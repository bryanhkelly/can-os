import { and, eq } from "drizzle-orm";
import { AuthorizationError } from "@/domain/command-context";
import { authorizeClass, classActor, type ClassTransaction } from "./class-access.server";

export async function academicConversationHref(thread: {
  contextType: string | null; contextId: string | null; metadata: Record<string, unknown>;
}, tx?: ClassTransaction) {
  if (thread.metadata.kind !== "academic_conversation") return null;
  if (thread.contextType !== "assessment" || !thread.contextId || typeof thread.metadata.studentProfileId !== "string") {
    throw new AuthorizationError("academic conversation context");
  }
  const actor = await classActor();
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const query = tx ?? db;
  const [assessment] = await query.select({ sectionId: s.assessments.sectionId }).from(s.assessments)
    .where(eq(s.assessments.id, thread.contextId)).limit(1);
  const [profile] = await query.select({ personId: s.studentProfiles.personId }).from(s.studentProfiles)
    .where(eq(s.studentProfiles.id, thread.metadata.studentProfileId)).limit(1);
  if (!assessment || !profile) throw new AuthorizationError("academic conversation records");
  const { studentPersonId } = await authorizeClass(actor, assessment.sectionId, profile.personId, tx);
  if (actor.role === "student" && studentPersonId !== profile.personId) throw new AuthorizationError("own academic conversation");
  const [enrolled] = await query.select({ id: s.enrollments.id }).from(s.enrollments)
    .where(and(eq(s.enrollments.studentProfileId, thread.metadata.studentProfileId),
      eq(s.enrollments.sectionId, assessment.sectionId), eq(s.enrollments.kind, "section"), eq(s.enrollments.status, "active"))).limit(1);
  if (!enrolled) throw new AuthorizationError("current academic conversation enrollment");
  const params = new URLSearchParams({ section: assessment.sectionId, assessment: thread.contextId });
  if (actor.role === "teacher") params.set("student", thread.metadata.studentProfileId);
  if (actor.role === "guardian") params.set("student", profile.personId);
  return (actor.role === "teacher" ? "/teacher/gradebook" : actor.role === "guardian" ? "/guardian/academics" : "/student/assignments") + "?" + params;
}
