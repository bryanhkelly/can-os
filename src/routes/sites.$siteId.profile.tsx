import { createFileRoute } from "@tanstack/react-router";
import { getLaunchSiteConfiguration } from "@/modules/programs/site-configuration.functions";
import { getActiveEnrollmentCounts } from "@/modules/enrollment/admissions-dashboard.functions";
import { listMySites } from "@/modules/operations/site-directory.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { SchoolProfile, type SchoolProfileData } from "@/components/operations/SchoolProfile";

export const Route = createFileRoute("/sites/$siteId/profile")({
  loader: ({ params }) => safeLoader(async (): Promise<SchoolProfileData> => {
    const [site, sites, counts] = await Promise.all([
      getLaunchSiteConfiguration({ data: { siteId: params.siteId } }),
      // Supplementary reads: the profile stays usable without them, so failures only hide their facts.
      listMySites().catch(() => null),
      getActiveEnrollmentCounts({ data: { siteId: params.siteId } }).catch(() => null),
    ]);
    return {
      site,
      organizationName: site.organization.name,
      siteCount: sites?.length ?? 1,
      activeStudents: counts && Object.fromEntries(counts.map(row => [row.programId, row.activeStudents])),
    };
  }, { authMessage: "Only an authorized school administrator or registrar can view this school profile." })(),
  component: SchoolProfilePage,
});

function SchoolProfilePage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="School profile" title="School profile" outcome={outcome} />;
  return <SchoolProfile data={outcome.data} />;
}
