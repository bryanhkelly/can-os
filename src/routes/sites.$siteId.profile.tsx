import { createFileRoute } from "@tanstack/react-router";
import type { FriendlySiteIdentity } from "@/domain/friendly-site-urls";
import { getSchoolProfile } from "@/modules/operations/school-profile.functions";
import { AuthorizationError } from "@/domain/command-context";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import { listMySites } from "@/modules/operations/site-directory.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { SchoolProfile, schoolRecordTabs, type SchoolProfileData, type SchoolRecordTab } from "@/components/operations/SchoolProfile";

export function readSchoolProfile(siteId: string | null) {
  return safeLoader(async (): Promise<SchoolProfileData> => {
    if (!siteId) throw new AuthorizationError("school.profile.read");
    const [site, experiences] = await Promise.all([
      getSchoolProfile({ data: { siteId } }),
      // School-life sections are supplementary; roles without that read still get the record.
      getSchoolExperiences().catch(() => null),
    ]);
    // Manager-only supplementary directory read: a failure only hides the
    // directory count, never an invented one.
    const sites = site.viewer.canManageSchool ? await listMySites().catch(() => null) : null;
    return { site, siteCount: sites?.length ?? null, experiences };
  }, { authMessage: "Sign in with an account at this school to view its profile." })();
}

export const Route = createFileRoute("/sites/$siteId/profile")({
  validateSearch: (search: Record<string, unknown>): { tab?: SchoolRecordTab } => ({
    tab: schoolRecordTabs.find(item => item.value === search.tab)?.value,
  }),
  loader: ({ params }) => readSchoolProfile(params.siteId),
  component: SchoolProfilePage,
});

function SchoolProfilePage() {
  const { siteId } = Route.useParams();
  return <SiteProfileView outcome={Route.useLoaderData()}
    tab={Route.useSearch().tab ?? "overview"} siteId={siteId} />;
}

export function SiteProfileView({ outcome, siteId, tab, identity }: {
  outcome: Awaited<ReturnType<typeof readSchoolProfile>>;
  siteId?: string;
  tab: SchoolRecordTab;
  identity?: FriendlySiteIdentity;
}) {
  if (!outcome.ok) return <LoaderFailure eyebrow="Site Profile" title="Site Profile" outcome={outcome} />;
  return <SchoolProfile data={outcome.data} tab={tab} friendlyIdentity={identity}
    tabLink={value => identity
      ? ({ to: "/o/$organizationSlug/$siteSlug/profile", params: identity, search: { tab: value === "overview" ? undefined : value } })
      : ({ to: "/sites/$siteId/profile", params: { siteId: siteId ?? outcome.data.site.id }, search: { tab: value === "overview" ? undefined : value } })} />;
}
