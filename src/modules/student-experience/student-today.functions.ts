import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { and,eq,inArray } from "drizzle-orm";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { db } from "@/db/client";
import { guardianRelationships, studentProfiles, enrollments, programs } from "@/db/schema";
import { getIdentityContext } from "@/modules/identity/command-context.server";
import { AuthorizationError } from "@/domain/command-context";
import { studentSiteScope } from "@/domain/student-site-scope";
import { getStudentToday, getCanonicalStudentTodayShell } from "./student-today.server";
import { safeLoader } from "@/lib/safe-loader";
import { readFirstClassrooms } from "@/modules/learning/first-classroom.server";

/** Do not accept a student ID from the browser. The session defines the learner. */
export const getMyStudentToday = createServerFn({ method: "GET" }).handler(async () => {
  const context = await getIdentityContext(getRequest());
  const membership = studentSiteScope(context);
  if (!membership) throw new AuthorizationError("student Today access");
  setResponseHeader("Cache-Control","private, no-store");
  const at = new Date();
  const school = await safeLoader(async () => {
    const programIds = context.scope.programIds ?? [];
    if (!programIds.length) return null;
    const [profile] = await db.select({ id: studentProfiles.id }).from(studentProfiles)
      .where(eq(studentProfiles.personId, membership.personId)).limit(1);
    if (!profile) return null;
    const [schoolMembership] = await db.select({ id: enrollments.id }).from(enrollments)
      .innerJoin(programs, eq(programs.id, enrollments.programId))
      .where(and(eq(enrollments.studentProfileId, profile.id),
        eq(enrollments.kind,"program"),eq(enrollments.status,"active"),
        inArray(enrollments.programId,programIds),eq(programs.siteId,membership.siteId))).limit(1);
    if (!schoolMembership) return null;
    return getStudentToday(profile.id,at,{siteIds:[membership.siteId],programIds});
  })();
  // A retiring adapter outage must not prevent native participation.
  const snapshot = school.ok && school.data
    ? school.data : await getCanonicalStudentTodayShell(membership.personId,membership.siteId,at);
  const guardian = await safeLoader(async () => {
    const [relationship] = await db.select({ id: guardianRelationships.id })
      .from(guardianRelationships)
      .where(guardianRelationshipPredicate({
        studentPersonId: membership.personId,
        access: "enrollment",
      })).limit(1);
    return Boolean(relationship);
  })();
  const firstWeek = await safeLoader(async () => snapshot.sections.length
    ? readFirstClassrooms(snapshot.sections.map(section => section.sectionId)) : [])();
  return {
    ...snapshot,
    hasEnrollmentGuardian: guardian.ok ? guardian.data : undefined,
    ...(school.ok === false || firstWeek.ok === false ? {schoolRecordsUnavailable:true} : {}),
    firstWeek: firstWeek.ok ? firstWeek.data : [],
    coursework: snapshot.coursework.map(({ feedback, response, ...item }) => item),
    recoveryCandidates: snapshot.recoveryCandidates.map(({ feedback, response, ...item }) => item),
  };
});
