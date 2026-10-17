import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { studentProfiles } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { AuthorizationError } from "@/domain/command-context";
import { getStudentToday } from "./student-today.server";

/** Do not accept a student ID from the browser. The session defines the learner. */
export const getMyStudentToday = createServerFn({ method: "GET" }).handler(async () => {
  const context = await getCommandContext(getRequest());
  if (context.role !== "student" || !context.actorPersonId ||
      !context.scope.siteIds?.length) throw new AuthorizationError("student Today access");
  const [profile] = await db.select({ id: studentProfiles.id }).from(studentProfiles)
    .where(eq(studentProfiles.personId, context.actorPersonId)).limit(1);
  if (!profile) throw new AuthorizationError("student profile");
  const snapshot = await getStudentToday(profile.id);
  // Require an active scoped section OR program enrollment before exposing
  // the student workspace. Newly activated students have no sections yet.
  const { enrollments, programs } = await import("@/db/schema");
  const { and, inArray } = await import("drizzle-orm");
  const [membership] = await db.select({ id: enrollments.id }).from(enrollments)
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .where(and(eq(enrollments.studentProfileId, profile.id),
      eq(enrollments.status, "active"),
      inArray(programs.siteId, context.scope.siteIds))).limit(1);
  if (!membership) throw new AuthorizationError("active student membership");
  return snapshot;
});
