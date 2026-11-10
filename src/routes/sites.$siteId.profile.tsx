import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { getSchoolProfile } from "@/modules/operations/school-profile.functions";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import { listMySites } from "@/modules/operations/site-directory.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { SchoolProfile, schoolRecordTabs, type SchoolProfileData, type SchoolRecordTab } from "@/components/operations/SchoolProfile";

export const Route = createFileRoute("/sites/$siteId/profile")({
  validateSearch: (search: Record<string, unknown>): { tab?: SchoolRecordTab } => ({
    tab: schoolRecordTabs.find(item => item.value === search.tab)?.value,
  }),
  loader: ({ params }) => safeLoader(async (): Promise<SchoolProfileData> => {
    const [site, experiences] = await Promise.all([
      getSchoolProfile({ data: { siteId: params.siteId } }),
      // School-life sections are supplementary; roles without that read still get the record.
      getSchoolExperiences().catch(() => null),
    ]);
    // Manager-only supplementary directory read: a failure only hides the
    // directory count, never an invented one.
    const sites = site.viewer.canManageSchool ? await listMySites().catch(() => null) : null;
    return { site, siteCount: sites?.length ?? null, experiences };
  }, { authMessage: "Sign in with an account at this school to view its profile." })(),
  component: SchoolProfilePage,
});

function SchoolProfilePage() {
  const outcome = Route.useLoaderData();
  const { siteId } = Route.useParams();
  const { tab = "overview" } = Route.useSearch();
  if (!outcome.ok) return <LoaderFailure eyebrow="School profile" title="School profile" outcome={outcome} />;
  return <SchoolProfile data={outcome.data} tab={tab}
    tabLink={value => linkOptions({ to: "/sites/$siteId/profile", params: { siteId }, search: value === "overview" ? {} : { tab: value } })} />;
}
