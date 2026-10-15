import { createServerFn } from "@tanstack/react-start";

/**
 * Student preview is scoped to one server-configured profile. No arbitrary
 * student-id query parameter or public directory of student records.
 */
export const getStudentWorkspace = createServerFn({ method: "GET" })
  .handler(async () => {
    const studentId = process.env.CAN_STUDENT_PREVIEW_PROFILE_ID;
    if (!process.env.DATABASE_URL) {
      return { mode: "not_connected" as const, data: null };
    }
    if (!studentId) {
      // Verify connectivity without exposing any student's private record.
      const { db } = await import("@/db/client");
      const { studentProfiles } = await import("@/db/schema");
      const { sql } = await import("drizzle-orm");
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(studentProfiles);
      return {
        mode: "no_preview_profile" as const,
        studentCount: Number(total ?? 0),
        data: null,
      };
    }
    const { getStudentToday } = await import("./student-today.server");
    try {
      const data = await getStudentToday(studentId);
      return { mode: "live" as const, data };
    } catch (error) {
      if (error instanceof Error && error.message === "Student not found") {
        return { mode: "preview_profile_missing" as const, data: null };
      }
      throw error;
    }
  });
