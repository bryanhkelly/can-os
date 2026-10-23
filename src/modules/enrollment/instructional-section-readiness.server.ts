import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accountPersonGrants, courseTemplateVersions, people, programs,
  sections, sectionTeachers,
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { hasAccessibleFirstLesson } from "@/domain/first-class-lesson";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";

/**
 * Public status and an assignment row are not proof a learner can enter a
 * staffed class. Always use canonical active teacher identity and permission,
 * alongside a published instructional version. The calling family/offer
 * query must additionally prove its enrolled student and school-year scope.
 */
export async function staffedPublishedSectionIds(
  ids:readonly string[],
  executor:Pick<typeof db,"select">=db,
):Promise<Set<string>> {
  if(!ids.length)return new Set();
  const rows=await executor.select({id:sections.id,programId:sections.programId,
    curriculum:courseTemplateVersions.curriculum}).from(sections)
    .innerJoin(programs,eq(programs.id,sections.programId))
    .innerJoin(courseTemplateVersions,eq(courseTemplateVersions.id,sections.courseTemplateVersionId))
    .innerJoin(sectionTeachers,eq(sectionTeachers.sectionId,sections.id))
    .innerJoin(people,eq(people.id,sectionTeachers.personId))
    .innerJoin(accountPersonGrants,and(
      eq(accountPersonGrants.personId,sectionTeachers.personId),
      eq(accountPersonGrants.active,true),
      eq(accountPersonGrants.role,"teacher"),
      or(eq(accountPersonGrants.organizationId,programs.organizationId),
        eq(accountPersonGrants.organizationId,programs.academicProviderOrganizationId)),
      or(isNull(accountPersonGrants.siteId),eq(accountPersonGrants.siteId,sections.siteId)),
    ))
    .where(and(
      inArray(sections.id,[...new Set(ids)]),
      eq(sections.active,true),
      eq(courseTemplateVersions.status,"published"),
      eq(people.active,true),
    ));
  const permitted=new Set<string>();
  for(const programId of new Set(rows.map(row=>row.programId))){
    try{
      await requireChurchHostedOperatingServices(executor,programId,[
        "academic_instruction","curriculum","school_of_record",
      ]);
      permitted.add(programId);
    }catch(error){
      if(!(error instanceof AuthorizationError))throw error;
      // A revoked, expired or unsigned institution/host agreement cannot
      // support a guardian claim that this is a ready teaching class.
    }
  }
  return new Set(rows.filter(row=>permitted.has(row.programId) &&
    hasAccessibleFirstLesson(row.curriculum)).map(row=>row.id));
}
