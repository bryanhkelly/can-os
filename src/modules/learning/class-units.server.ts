import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { curriculumUnitVersions, sectionUnitAdoptions } from "@/db/schema";
import { classModuleSchema } from "@/domain/class-content";
import type { PublishedUnit } from "@/domain/class-unit-releases";

type ReadDb=Pick<typeof db,"select">;
export async function readAdoptedClassUnits(
  section:{id:string;versionId:string},tx:ReadDb=db,now=new Date(),
):Promise<PublishedUnit[]> {
  const rows=await tx.select({
    unitVersionId:curriculumUnitVersions.id,
    unitKey:curriculumUnitVersions.unitKey,
    module:curriculumUnitVersions.module,
    teacherGuide:curriculumUnitVersions.teacherGuide,
    status:curriculumUnitVersions.status,
    baseCourseVersionId:curriculumUnitVersions.baseCourseVersionId,
    adoptionCourseVersionId:sectionUnitAdoptions.baseCourseVersionId,
    adoptionUnitKey:sectionUnitAdoptions.unitKey,
    availableAt:sectionUnitAdoptions.availableAt,
  }).from(sectionUnitAdoptions)
    .innerJoin(curriculumUnitVersions,eq(curriculumUnitVersions.id,sectionUnitAdoptions.unitVersionId))
    .where(and(eq(sectionUnitAdoptions.sectionId,section.id),
      eq(sectionUnitAdoptions.status,"active"),
      eq(sectionUnitAdoptions.baseCourseVersionId,section.versionId),
      eq(curriculumUnitVersions.baseCourseVersionId,section.versionId),
      eq(curriculumUnitVersions.status,"published"),
      or(isNull(sectionUnitAdoptions.availableAt),lte(sectionUnitAdoptions.availableAt,now))))
    .orderBy(sectionUnitAdoptions.unitKey);
  return rows.map(row=>{
    if(row.unitKey!==row.adoptionUnitKey||
      row.baseCourseVersionId!==row.adoptionCourseVersionId ||
      classModuleSchema.parse(row.module).id!==row.unitKey)
      throw new Error("Adopted class unit does not match its pinned course.");
    return {unitKey:row.unitKey,unitVersionId:row.unitVersionId,status:row.status,
      module:row.module,teacherGuide:row.teacherGuide,availableAt:row.availableAt};
  });
}
