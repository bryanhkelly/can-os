import { createFileRoute } from "@tanstack/react-router";
import { FieldTripOperationsView } from "@/routes/operations.field-trips";
import { listFieldTripOperations } from "@/modules/field-trips/field-trip-operations.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/operations/field-trips_/new")({
  loader: safeLoader(() => listFieldTripOperations(), { authMessage: "Sign in as an authorized registrar to propose a field trip." }),
  component: CreateFieldTripPage,
});

function CreateFieldTripPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="Operations" title="Propose a field trip" outcome={outcome}/>;
  return <FieldTripOperationsView data={outcome.data} mode="create"/>;
}