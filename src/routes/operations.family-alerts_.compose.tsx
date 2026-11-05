import { createFileRoute } from "@tanstack/react-router";
import { Publisher } from "@/routes/operations.family-alerts";
import { getSchoolFamilyAlerts } from "@/modules/communication/school-family-alerts.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/operations/family-alerts_/compose")({
  loader: safeLoader(() => getSchoolFamilyAlerts(), { authMessage: "Sign in as an authorized institutional registrar to compose family notices." }),
  component: ComposeFamilyNoticePage,
});

function ComposeFamilyNoticePage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="Communications" title="Compose family notice" outcome={outcome}/>;
  return <Publisher data={outcome.data} mode="compose"/>;
}