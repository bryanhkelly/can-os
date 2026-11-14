import { createFileRoute, linkOptions, Link } from "@tanstack/react-router";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import { getMySchoolProfile } from "@/modules/operations/school-profile.functions";
import { SchoolProfile, schoolRecordTabs, type SchoolRecordTab } from "@/components/operations/SchoolProfile";
import { EmptyState, WorkspaceShell } from "@/components/workspace";
import { LiveSchoolExperiences } from "@/components/student/LiveSchoolExperiences";
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
  if (!site) return <WorkspaceShell width="wide" eyebrow="Family" title="School & teacher conferences"
    subtitle="Your family's authorized school updates, calendar and appointments. A single school profile is not available for this membership.">
    {outcome.data.experiences.connected ? <>
      <nav aria-label="Family school sections" className="mt-6 flex flex-wrap gap-2">
        {schoolRecordTabs.map(item => <Link key={item.value} to="/guardian/experiences"
          search={item.value === "overview" ? { student } : { student, tab: item.value }}
          aria-current={tab === item.value ? "page" : undefined}
          className="inline-flex min-h-11 items-center border px-4 py-2 text-sm font-semibold underline focus-visible:outline-2">
          {item.label}
        </Link>)}
      </nav>
      <div className="mt-6"><LiveSchoolExperiences data={outcome.data.experiences}
        view={tab === "overview" ? "all" : tab} /></div>
    </> : <EmptyState title="No school connected" description="The school calendar and conference bookings will appear when your family account is linked to an active school." />}
  </WorkspaceShell>;
  return <SchoolProfile data={{ ...outcome.data, site }} tab={tab}
    tabLink={value => linkOptions({ to: "/guardian/experiences", search: value === "overview" ? { student } : { tab: value, student } })} />;
}
