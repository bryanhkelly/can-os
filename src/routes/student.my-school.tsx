import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import { getMySchoolProfile } from "@/modules/operations/school-profile.functions";
import { SchoolProfile, schoolRecordTabs, type SchoolRecordTab } from "@/components/operations/SchoolProfile";
import { EmptyState, WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/student/my-school")({
  validateSearch: (search: Record<string, unknown>): { tab?: SchoolRecordTab } => ({
    tab: schoolRecordTabs.find(item => item.value === search.tab)?.value,
  }),
  loader: safeLoader(async () => {
    const [site, experiences] = await Promise.all([getMySchoolProfile(), getSchoolExperiences()]);
    return { site, siteCount: null, experiences };
  }, { authMessage: "Sign in as an enrolled student to see your school community." }),
  component: MySchoolPage,
});

function MySchoolPage() {
  const outcome = Route.useLoaderData();
  const { tab = "overview" } = Route.useSearch();
  if (!outcome.ok) return <LoaderFailure eyebrow="My School" title="My School" outcome={outcome} />;
  const { site } = outcome.data;
  if (!site) return <WorkspaceShell width="wide" eyebrow="My School" title="My School"
    subtitle="Your local school will appear here when it is connected to your student account.">
    <EmptyState title="No school connected" description="Your school profile will appear when your enrollment is linked to a school." />
  </WorkspaceShell>;
  return <SchoolProfile data={{ ...outcome.data, site }} tab={tab}
    tabLink={value => linkOptions({ to: "/student/my-school", search: value === "overview" ? {} : { tab: value } })} />;
}
