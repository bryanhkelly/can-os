import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveLaunchResume } from "@/domain/launch-resume";
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
  loader: async ({ deps }) => {
    // Launch identity and canonical launch records are required; peripheral
    // dashboards and outreach data must not block school setup.
    const required = await safeLoader(async () => {
      const options = await listLaunchOptions();
      const launches = await listLaunches();
      const preparationPrograms = await listAdmissionsPrograms().catch(() => null);
      return { options, launches, preparationPrograms };
    })();
    if (!required.ok) return required;
    const { options, launches, preparationPrograms } = required.data;
    const schools = (preparationPrograms ?? []).filter(program =>
      ["draft", "launching", "ready", "active"].includes(program.status));
    const selected = resolveLaunchResume(schools, deps).launch
      ?? resolveLaunchResume(launches.launches, deps).launch;
    // Resolve the same school as the page before loading scoped dashboards.
    // Redirect outside safeLoader so navigation is not treated as a failure.
    if (!deps.programId && selected) {
      throw redirect({ to: "/operations/launch", replace: true,
        search: { siteId: selected.siteId ?? undefined, programId: selected.id } });
    }
    return safeLoader(async () => {
      const [familyInvitations, admissionsCounts, enrollmentCounts, extendedPlanning] = await Promise.all([
        listFamilyInvitations().catch(() => null),
        getLaunchAdmissionsCounts({ data: deps }).catch(() => null),
        getActiveEnrollmentCounts({ data: deps }).catch(() => null),
        listExtendedSeasonPlanning().catch(() => null),
      ]);
      return { options, launches, preparationPrograms, familyInvitations, admissionsCounts, enrollmentCounts, extendedPlanning, authError: "" };
    })();
  },
  component: LaunchPage,
});

function LaunchPage() {
  const result = Route.useLoaderData();
  if (!result.ok) {
    return <LoaderFailure title="Launch a school" eyebrow="CAN OS · Launch" outcome={result} />;
  }
  return <LaunchWizardPage selection={Route.useSearch()} data={result.data} />;
}
