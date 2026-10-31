import { createFileRoute } from "@tanstack/react-router";
import { LaunchWizardPage } from "@/components/operations/LaunchWizardPage";
import { listLaunchOptions, listLaunches } from "@/modules/programs/launch.functions";
import { listAdmissionsPrograms } from "@/modules/enrollment/admissions-program-directory.functions";
import { listFamilyInvitations } from "@/modules/enrollment/family-invitations.functions";
import { listAdmissionsIntake } from "@/modules/enrollment/admissions-intake.functions";
import { getActiveEnrollmentCounts } from "@/modules/enrollment/admissions-dashboard.functions";
import { listExtendedSeasonPlanning } from "@/modules/activities/extended-learning.functions";

export const Route = createFileRoute("/operations/launch/")({
  loaderDeps:({search})=>({siteId:search.siteId,programId:search.programId}),
  loader: async ({deps}) => {
    try {
      return {
        options: await listLaunchOptions(),
        launches: await listLaunches(),
        preparationPrograms:await listAdmissionsPrograms().catch(()=>null),
        familyInvitations: await listFamilyInvitations().catch(() => null),
        admissions: await listAdmissionsIntake().catch(() => null),
        enrollmentCounts: await getActiveEnrollmentCounts({data:deps}).catch(() => null),
        // A pending migration for extended programs must not prevent core school launch.
        extendedPlanning: await listExtendedSeasonPlanning().catch(() => null),
        authError: "",
      };
    } catch {
      return { options: null, launches: null, preparationPrograms:null, familyInvitations: null, admissions: null, enrollmentCounts: null, extendedPlanning: null, authError: "Sign in with an authorized registrar account to manage program launches." };
    }
  },
  component: () => <LaunchWizardPage selection={Route.useSearch()} data={Route.useLoaderData()} />,
});

