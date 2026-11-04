import type { StudentSuccessAssignment } from "@/domain/student-success";
import type { LoadOutcome } from "@/lib/safe-loader";
import type { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import type { getStudentReportCard } from "@/modules/learning/report-cards.functions";

export type DashboardAssignment = StudentSuccessAssignment & { hasDraft: boolean };
export type LearningResume = {
  sectionId: string;
  title: string;
  lesson: { id: string; title: string; estimatedMinutes?: number } | null;
  completed: number;
  total: number;
};
export type StudentDashboardData = {
  assignments: LoadOutcome<DashboardAssignment[]>;
  learning: LoadOutcome<LearningResume | null>;
  grades: LoadOutcome<Pick<Awaited<ReturnType<typeof getStudentReportCard>>["grades"][number],
    "sectionGradeId" | "sectionTitle" | "schoolYearName" | "gradingPeriodName" | "letterGrade" | "percentage">[]>;
  community: LoadOutcome<Pick<Awaited<ReturnType<typeof getSchoolExperiences>>, "connected" | "events" | "notices">>;
};
