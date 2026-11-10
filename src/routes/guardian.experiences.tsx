import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import { getMySchoolProfile } from "@/modules/operations/school-profile.functions";
import { SchoolProfile, schoolRecordTabs, type SchoolRecordTab } from "@/components/operations/SchoolProfile";
import { EmptyState, WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

/**
 * The guardian mount of the one school record: the same profile, calendar,
 * announcement and conference sections as /student/my-school and
 * /sites/$siteId/profile, reached through a guardian-scoped loader so guardians
 * can actually book, reschedule and cancel teacher conferences.
 */
export const Route = createFileRoute("/guardian/experiences")({
  validateSearch: (search: Record<string, unknown>): { tab?: SchoolRecordTab; student?: string } => ({
    tab: schoolRecordTabs.find(item => item.value === search.tab)?.value,
    student: typeof search.student === "string" ? search.student : undefined,
  }),
  loader: safeLoader(async () => {
    const [site, experiences] = await Promise.all([getMySchoolProfile(), getSchoolExperiences()]);
    return { site, siteCount: null, experiences };
  }, { authMessage: "Sign in with an authorized guardian account to book teacher conferences." }),
  component: GuardianExperiencesPage,
});

function GuardianExperiencesPage() {
  const outcome = Route.useLoaderData();
  const { tab = "overview", student } = Route.useSearch();
  if (!outcome.ok) return <LoaderFailure eyebrow="Family" title="School" outcome={outcome} />;
  const { site } = outcome.data;
  if (!site) return <WorkspaceShell width="wide" eyebrow="Family" title="School"
    subtitle="Your school will appear here when it is connected to your family account.">
    <EmptyState title="No school connected" description="The school profile will appear when your family account is linked to a school." />
  </WorkspaceShell>;
  return <SchoolProfile data={{ ...outcome.data, site }} tab={tab}
    tabLink={value => linkOptions({ to: "/guardian/experiences", search: value === "overview" ? { student } : { tab: value, student } })} />;
}
