import { createFileRoute } from "@tanstack/react-router";
import { StudentQuickWins } from "@/components/student/StudentQuickWins";

export const Route = createFileRoute("/student/experiences")({
  component: StudentQuickWins,
});
