import { createServerFn } from "@tanstack/react-start";

/**
 * Student preview is scoped to one server-configured profile. No arbitrary
 * student-id query parameter or public directory of student records.
 */
export const getStudentWorkspace = createServerFn({ method: "GET" })
  .handler(async () => {
    const studentId = "f1000000-0000-4000-8000-000000000007"; // Synthetic fixture only
    if (!process.env.DATABASE_URL) {
      return { mode: "not_connected" as const, data: null };
    }
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
