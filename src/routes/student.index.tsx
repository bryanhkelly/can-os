import { createFileRoute } from "@tanstack/react-router";
import { StudentExperience } from "@/components/student/StudentExperience";

export const Route = createFileRoute("/student/")({
  component: StudentExperience,
});
