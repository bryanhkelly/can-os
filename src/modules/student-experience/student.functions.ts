import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { requireActor } from "@/modules/identity/actors.server";

/** Student Today for the signed-in student only; no caller-supplied student id. */
export const getStudentWorkspace = createServerFn({ method: "GET" })
  .handler(async () => {
    const actor = await requireActor(["student"], "student:read");
    setResponseHeader("Cache-Control", "private, no-store");
    if (!process.env.DATABASE_URL) {
      return { mode: "not_connected" as const, data: null };
    }
    const [{ db }, { studentProfiles }] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const [profile] = await db.select({ id: studentProfiles.id }).from(studentProfiles).where(eq(studentProfiles.personId, actor.actorPersonId)).limit(1);
    if (!profile) return { mode: "preview_profile_missing" as const, data: null };
    const studentId = profile.id;
    const { getStudentToday } = await import("./student-today.server");
    try {
      const data = await getStudentToday(studentId);
      const safeData = {
        ...data,
        coursework: data.coursework.map(({ feedback, response, ...item }) => ({
          ...item,
          feedback: { comment: typeof feedback?.comment === "string" ? feedback.comment : "" },
          response: null,
        })),
        recoveryCandidates: data.recoveryCandidates.map(({ feedback, response, ...item }) => ({
          ...item,
          feedback: { comment: typeof feedback?.comment === "string" ? feedback.comment : "" },
          response: null,
        })),
      };
      return { mode: "live" as const, data: safeData };
    } catch (error) {
      if (error instanceof Error && error.message === "Student not found") {
        return { mode: "preview_profile_missing" as const, data: null };
      }
      throw error;
    }
  });
