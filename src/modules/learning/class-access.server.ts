import { and, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { requireActor, assertSiteGranted, assertProgramGranted, type Actor } from "@/modules/identity/actors.server";
import { requireInstitutionalAcademicProgramAuthority } from "@/modules/programs/program-site-authorization.server";
import { requireCurrentTeacherProgramDelegation } from "@/modules/identity/teaching-eligibility.server";
import { requireTeachingEligibility } from "@/modules/staffing/teaching-eligibility.server";
export type ClassTransaction = Parameters<Parameters<typeof import("@/db/client").db.transaction>[0]>[0];

/** Church owns its Site, CAN owns academics. A church staff grant must
 * never stand in for CAN teacher authority on a separate academic provider.
 */
async function isIndependentChurchAcademicProgram(
  query: Pick<typeof import("@/db/client").db,"select">,
  programId: string,
):Promise<boolean>{
  const s=await import("@/db/schema");
  const [program]=await query.select({
    hostId:s.programs.hostOrganizationId,
    ownerId:s.programs.organizationId,
    academicProviderId:s.programs.academicProviderOrganizationId,
  }).from(s.programs).where(eq(s.programs.id,programId)).limit(1);
  if(!program)throw new AuthorizationError("existing class academic Program");
  const hostId=program.hostId??program.ownerId;
  if(hostId===program.academicProviderId)return false;
  const [host]=await query.select({type:s.organizations.type}).from(s.organizations)
    .where(eq(s.organizations.id,hostId)).limit(1);
  if(!host)throw new AuthorizationError("existing church Site host");
  return host.type==="church";
}


export async function classActor() {
  const actor = await requireActor(["student", "guardian", "teacher"]);
  assertCapability(actor, actor.role === "student" ? "student:read" : actor.role === "guardian" ? "student:related-read" : "teacher:read");
  if (!(actor.scope.siteIds?.length && actor.scope.programIds?.length) &&
      !(actor.role==="teacher" && actor.scope.sectionIds?.length))
    throw new AuthorizationError("class delivery scope");
  return actor;
}

export async function authorizeClass(actor: Actor, sectionId: string, studentPersonId?: string, transaction?: ClassTransaction) {
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const query = transaction ?? db;
  const [section] = await query.select({
    id: s.sections.id, title: s.sections.title, code: s.sections.code, siteId: s.sections.siteId,
    programId: s.sections.programId, schoolYearId: s.terms.schoolYearId,
    versionId: s.sections.courseTemplateVersionId,
    curriculum: s.courseTemplateVersions.curriculum, contentStatus: s.courseTemplateVersions.status,
    description: s.courseTemplates.description, subject: s.courseTemplates.subject, courseCode: s.courseTemplates.code,
  }).from(s.sections)
    .innerJoin(s.courseTemplateVersions, eq(s.courseTemplateVersions.id, s.sections.courseTemplateVersionId))
    .innerJoin(s.courseTemplates, eq(s.courseTemplates.id, s.courseTemplateVersions.courseTemplateId))
    .innerJoin(s.terms, eq(s.terms.id, s.sections.termId))
    .where(and(eq(s.sections.id, sectionId), eq(s.sections.active, true))).limit(1);
  if (!section) throw new AuthorizationError("active class");
  // An independent CAN teacher receives ONLY this Section, never the
  // host Organization or its unrelated Programs and Sites.
  const institutionalSection=actor.role==="teacher" &&
    actor.scope.sectionIds?.includes(section.id)===true;
  const churchCANProgram=actor.role==="teacher" &&
    await isIndependentChurchAcademicProgram(query,section.programId);
  if(institutionalSection){
    await requireCurrentTeacherProgramDelegation(query,{
      personId:actor.actorPersonId,programId:section.programId,siteId:section.siteId,
    });
  }
  if(churchCANProgram){
    // Church staff may supervise children, but must NOT grade or teach
    // institution-owned CAN classes on a host-local grant. The teacher must
    // have a provider-wide original CAN grant and exact delegated Section.
    if(!institutionalSection || actor.grantSiteId!==null)
      throw new AuthorizationError("CAN academic provider teacher assigned to exact Section");
    await requireInstitutionalAcademicProgramAuthority(query,actor,section.programId,[
      "academic_instruction","curriculum",
    ]);
  }else if(institutionalSection){
    await requireInstitutionalAcademicProgramAuthority(query,actor,section.programId,[
      "academic_instruction","curriculum",
    ]);
  }else{
    assertSiteGranted(actor, section.siteId);
    assertProgramGranted(actor, section.programId);
  }
  if (actor.role === "teacher") {
    await requireTeachingEligibility(sectionId, actor.actorPersonId, query, {
      horizon: "current", requireAssignment: true,
    });
    return { section, studentProfileId: null, studentPersonId: null };
  }
  const personId = actor.role === "student" ? actor.actorPersonId : studentPersonId;
  if (!personId) throw new AuthorizationError("selected child");
  if (actor.role === "guardian") {
    const [related] = await query.select({ id: s.guardianRelationships.id }).from(s.guardianRelationships)
      .where(guardianRelationshipPredicate({
        guardianPersonId: actor.actorPersonId,
        studentPersonId: personId,
        access: "academic",
      })).limit(1);
    if (!related) throw new AuthorizationError("guardian academic relationship");
  }
  // A Section row must not preserve learning access after the child's actual
  // Program enrollment is withdrawn or transferred. Require matching active
  // Program AND Section memberships for the same school year.
  const programMembership=alias(s.enrollments,"class_authorized_program_membership");
  const [enrollment] = await query.select({ profileId: s.studentProfiles.id }).from(s.enrollments)
    .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
    .innerJoin(programMembership,and(
      eq(programMembership.studentProfileId,s.enrollments.studentProfileId),
      eq(programMembership.kind,"program"),eq(programMembership.status,"active"),
      eq(programMembership.programId,section.programId),
      eq(programMembership.schoolYearId,section.schoolYearId),
    ))
    .where(and(eq(s.studentProfiles.personId, personId), eq(s.enrollments.sectionId, sectionId),
      eq(s.enrollments.programId,section.programId),
      eq(s.enrollments.schoolYearId,section.schoolYearId),
      eq(s.enrollments.kind, "section"), eq(s.enrollments.status, "active"))).limit(1);
  if (!enrollment) throw new AuthorizationError("active class enrollment");
  return { section, studentProfileId: enrollment.profileId, studentPersonId: personId };
}

export async function accessibleClasses(actor: Actor) {
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const projection = { id: s.sections.id, title: s.sections.title, code: s.sections.code };
  const scope = and(eq(s.sections.active, true),
    inArray(s.sections.siteId, actor.scope.siteIds ?? []),
    inArray(s.sections.programId, actor.scope.programIds ?? []));
  // The teacher branch has no student enrollment join; keep this predicate
  // strictly on the student/guardian directory query below.
  const studentScope=and(scope,
    eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"),
    eq(s.enrollments.programId,s.sections.programId),
    eq(s.enrollments.schoolYearId,s.terms.schoolYearId));
  if (actor.role === "teacher") {
    const delegated=actor.scope.sectionIds??[];
    const rows = await db.select({
      ...projection,siteId:s.sections.siteId,programId:s.sections.programId,
    }).from(s.sections)
      .innerJoin(s.sectionTeachers, eq(s.sectionTeachers.sectionId, s.sections.id))
      .where(and(eq(s.sections.active,true),
        eq(s.sectionTeachers.personId,actor.actorPersonId),
        delegated.length ? (
          // Host-local assignments continue to be checked by the existing
          // Site/Program scope; delegated assignments are exact Section IDs.
          or(scope,inArray(s.sections.id,delegated))
        ) : scope)).orderBy(s.sections.title);
    const available=[];
    const independentByProgram=new Map<string,boolean>();
    // A previously signed-in CAN teacher must not retain a stale church
    // class directory entry after the underlying academic agreement expires
    // or is withdrawn. A Section assignment alone is never a contract.
    for(const row of rows){
      let independent=independentByProgram.get(row.programId);
      if(independent===undefined){
        independent=await isIndependentChurchAcademicProgram(db,row.programId);
        independentByProgram.set(row.programId,independent);
      }
      const hostLocal=!!row.siteId &&
        (actor.scope.siteIds??[]).includes(row.siteId) &&
        (actor.scope.programIds??[]).includes(row.programId);
      if(independent){
        if(actor.grantSiteId!==null || !delegated.includes(row.id))continue;
      }else if(hostLocal){
        // Ordinary school teacher: original local Site authorization remains
        // sufficient, never a cross-school grant.
      }else if(!delegated.includes(row.id))continue;
      if(independent || !hostLocal){
        try{
          await requireCurrentTeacherProgramDelegation(db,{
            personId:actor.actorPersonId,programId:row.programId,siteId:row.siteId,
          });
          await requireInstitutionalAcademicProgramAuthority(db,actor,row.programId,[
            "academic_instruction","curriculum",
          ]);
        }catch(error){
          if(!(error instanceof AuthorizationError))throw error;
          continue;
        }
      }
      try {
        await requireTeachingEligibility(row.id, actor.actorPersonId, db, {
          horizon: "current", requireAssignment: true,
        });
      } catch (error) {
        if (!(error instanceof AuthorizationError)) throw error;
        continue;
      }
      available.push({
        id:row.id,title:row.title,code:row.code,
        studentPersonId:null,studentName:null,
      });
    }
    return available;
  }
  const activeProgramMembership=alias(s.enrollments,"class_directory_program_membership");
  const query = db.select({ ...projection, studentPersonId: s.studentProfiles.personId,
    firstName: s.people.legalFirstName, preferredName: s.people.preferredName, lastName: s.people.legalLastName })
    .from(s.sections)
    .innerJoin(s.enrollments, and(eq(s.enrollments.sectionId, s.sections.id), eq(s.enrollments.kind, "section"), eq(s.enrollments.status, "active")))
    .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
    .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
    .innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
    .innerJoin(activeProgramMembership,and(
      eq(activeProgramMembership.studentProfileId,s.enrollments.studentProfileId),
      eq(activeProgramMembership.programId,s.sections.programId),
      eq(activeProgramMembership.schoolYearId,s.terms.schoolYearId),
      eq(activeProgramMembership.kind,"program"),
      eq(activeProgramMembership.status,"active"),
    ));
  const rows = actor.role === "guardian"
    ? await query.innerJoin(s.guardianRelationships, and(
      eq(s.guardianRelationships.studentPersonId, s.studentProfiles.personId),
      guardianRelationshipPredicate({
        guardianPersonId: actor.actorPersonId,
        access: "academic",
      }),
    )).where(studentScope).orderBy(s.sections.title)
    : await query.where(and(studentScope, eq(s.studentProfiles.personId, actor.actorPersonId))).orderBy(s.sections.title);
  return [...new Map(rows.map(row => [`${row.id}:${row.studentPersonId}`, {
    id: row.id, title: row.title, code: row.code, studentPersonId: row.studentPersonId,
    studentName: `${row.preferredName ?? row.firstName} ${row.lastName}`,
  }])).values()];
}
