import { createFileRoute } from "@tanstack/react-router";
import { getLaunchAcademicSetup } from "@/modules/programs/launch-academics.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { LaunchAcademicSetupWorkspace } from "@/components/operations/LaunchAcademicSetupWorkspace";

export const Route = createFileRoute("/operations/launch/$programId")({
  loader: ({ params }) => safeLoader(
    () => getLaunchAcademicSetup({ data: { programId: params.programId } }),
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
