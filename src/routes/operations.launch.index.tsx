import { createFileRoute } from "@tanstack/react-router";
import { LaunchWizardPage } from "@/components/operations/LaunchWizardPage";
import { listLaunchOptions, listLaunches } from "@/modules/programs/launch.functions";
import { listAdmissionsPrograms } from "@/modules/enrollment/admissions-program-directory.functions";
import { listFamilyInvitations } from "@/modules/enrollment/family-invitations.functions";
import { getLaunchAdmissionsCounts } from "@/modules/enrollment/launch-admissions-counts.functions";
import { getActiveEnrollmentCounts } from "@/modules/enrollment/admissions-dashboard.functions";
import { listExtendedSeasonPlanning } from "@/modules/activities/extended-learning.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/operations/launch/")({
  loaderDeps: ({ search }) => ({ siteId: search.siteId, programId: search.programId }),
  loader: ({ deps }) => safeLoader(async () => {
    // Launch identity and canonical launch records are required; peripheral
    // dashboards and outreach data must not block school setup.
    const options = await listLaunchOptions();
    const launches = await listLaunches();
    const [preparationPrograms, familyInvitations, admissionsCounts, enrollmentCounts, extendedPlanning] = await Promise.all([
      listAdmissionsPrograms().catch(() => null),
      listFamilyInvitations().catch(() => null),
      getLaunchAdmissionsCounts({ data: deps }).catch(() => null),
      getActiveEnrollmentCounts({ data: deps }).catch(() => null),
      listExtendedSeasonPlanning().catch(() => null),
    ]);
    return { options, launches, preparationPrograms, familyInvitations, admissionsCounts, enrollmentCounts, extendedPlanning, authError: "" };
  })(),
  component: LaunchPage,
});

function LaunchPage() {
  const result = Route.useLoaderData();
  if (!result.ok) {
    return <LoaderFailure title="Launch a school" eyebrow="CAN OS · Launch" outcome={result} />;
  }
  return <LaunchWizardPage selection={Route.useSearch()} data={result.data} />;
}
