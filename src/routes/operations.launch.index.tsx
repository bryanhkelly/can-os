import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveLaunchResume } from "@/domain/launch-resume";
import { LaunchWizardPage } from "@/components/operations/LaunchWizardPage";
import { listLaunchOptions, listLaunches } from "@/modules/programs/launch.functions";
import { listAdmissionsPrograms } from "@/modules/enrollment/admissions-program-directory.functions";
import { listFamilyInvitations } from "@/modules/enrollment/family-invitations.functions";
import { getLaunchAdmissionsCounts } from "@/modules/enrollment/launch-admissions-counts.functions";
import { getActiveEnrollmentCounts } from "@/modules/enrollment/admissions-dashboard.functions";
import { listExtendedSeasonPlanning } from "@/modules/activities/extended-learning.functions";
import { listPublishedJurisdictionGuidance } from "@/modules/programs/jurisdiction-profile.functions";
import { listLaunchJurisdictionResearch } from "@/modules/programs/jurisdiction-launch-research.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { supplementaryRead } from "@/lib/supplementary-read";

export const Route = createFileRoute("/operations/launch/")({
  loaderDeps: ({ search }) => ({ siteId: search.siteId, programId: search.programId }),
  loader: async ({ deps }) => {
    // Launch identity and canonical launch records are required; peripheral
    // dashboards and outreach data must not block school setup.
    const required = await safeLoader(async () => {
      const options = await listLaunchOptions();
      const launches = await listLaunches();
      const preparation = await supplementaryRead(() => listAdmissionsPrograms(), data => data.length === 0);
      return { options, launches, preparationPrograms: preparation.data, preparationState: preparation.state };
    })();
    if (!required.ok) return required;
    const { options, launches, preparationPrograms, preparationState } = required.data;
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
      const [familyInvitations, admissionsCounts, enrollmentCounts, extendedPlanning, jurisdictionGuidance, jurisdictionResearch] = await Promise.all([
        supplementaryRead(() => listFamilyInvitations(), data => data.batches.length === 0),
        supplementaryRead(() => getLaunchAdmissionsCounts({ data: deps }), data => data.total === 0),
        supplementaryRead(() => getActiveEnrollmentCounts({ data: deps }), data => data.length === 0),
        supplementaryRead(() => listExtendedSeasonPlanning(), data => Object.keys(data).length === 0),
        supplementaryRead(() => listPublishedJurisdictionGuidance(), data => Object.keys(data).length === 0),
        supplementaryRead(() => listLaunchJurisdictionResearch(), data => Object.keys(data).length === 0),
      ]);
      return { options, launches, preparationPrograms,
        familyInvitations: familyInvitations.data, admissionsCounts: admissionsCounts.data,
        enrollmentCounts: enrollmentCounts.data, extendedPlanning: extendedPlanning.data,
        jurisdictionGuidance: jurisdictionGuidance.data ?? {}, jurisdictionResearch: jurisdictionResearch.data ?? {},
        reads: { preparationPrograms: preparationState, familyInvitations: familyInvitations.state,
          admissionsCounts: admissionsCounts.state, enrollmentCounts: enrollmentCounts.state,
          extendedPlanning: extendedPlanning.state, jurisdictionGuidance: jurisdictionGuidance.state,
          jurisdictionResearch: jurisdictionResearch.state }, authError: "" };
    })();
  },
  component: LaunchPage,
});

function LaunchPage() {
  const result = Route.useLoaderData();
  const selection = Route.useSearch();
  if (!result.ok) {
    return <LoaderFailure title="Launch a school" eyebrow="Launch" outcome={result} />;
  }
  return <LaunchWizardPage selection={selection} data={result.data} />;
}
