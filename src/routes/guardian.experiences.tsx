import { createFileRoute, Link } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { LiveSchoolExperiences } from "@/components/student/LiveSchoolExperiences";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

/**
 * Guardian school experiences: the same calendar/announcements/office-hour
 * surface as /student/experiences, but reached through a guardian-scoped
 * loader so guardians can actually book, reschedule and cancel teacher
 * conferences. The student mount is unchanged.
 */
export const Route = createFileRoute("/guardian/experiences")({
  validateSearch: (search: Record<string, unknown>): { student?: string } => ({ student: typeof search.student === "string" ? search.student : undefined }),
  loader: safeLoader(() => getSchoolExperiences(), {
    authMessage: "Sign in with an authorized guardian account to book teacher conferences.",
  }),
  component: GuardianExperiencesPage,
});

function GuardianExperiencesPage() {
  const outcome = Route.useLoaderData();
  const {student} = Route.useSearch();
  if (!outcome.ok) {
    return <LoaderFailure eyebrow="CAN OS · Family" title="School experiences" outcome={outcome} />;
  }
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Family" title="School & community" subtitle="School calendar, announcements, and teacher conferences for your family." breadcrumbs={<><Link to="/guardian" search={{student}} className="underline">Family home</Link><span>/</span><span>School</span></>}><LiveSchoolExperiences data={outcome.data} /></WorkspaceShell>;
}
