import { createFileRoute, Navigate } from "@tanstack/react-router";
import { GuardianExperienceBoard } from "@/components/student/LiveSchoolExperiences";

export const Route = createFileRoute("/guardian/experiences")({ component: GuardianExperiencesPage });

/** Guardian booking surface for published office hours and field trips. */
function GuardianExperiencesPage() {
  const params = new URLSearchParams(window.location.search);
  if (!params.get("student")) return <Navigate to="/guardian" replace />;
  return <GuardianExperienceBoard />;
}
