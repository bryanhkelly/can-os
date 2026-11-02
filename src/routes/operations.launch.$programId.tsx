import { createFileRoute } from "@tanstack/react-router";
import { getLaunchAcademicSetup } from "@/modules/programs/launch-academics.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { LaunchAcademicSetupWorkspace } from "@/components/operations/LaunchAcademicSetupWorkspace";

export const Route = createFileRoute("/operations/launch/$programId")({
  loader: ({ params }) => safeLoader(
    async () => ({
      ...(await getLaunchAcademicSetup({ data: { programId: params.programId } })),
      demoTeacherMarketplaceEnabled:
        process.env.CAN_DEMO_TEACHER_PREVIEW_ENABLED === "true" &&
        process.env.CAN_DEMO_ISOLATED_ENV === "true",
    }),
    { authMessage: "Sign in with a registrar grant for this program." },
  )(),
  component: LaunchAcademicSetup,
});

function LaunchAcademicSetup() {
  const result = Route.useLoaderData();
  if (!result.ok) {
    return <LoaderFailure eyebrow="CAN OS · School launch" title="Academic provisioning" outcome={result} />;
  }
  return <LaunchAcademicSetupWorkspace data={result.data} />;
}
