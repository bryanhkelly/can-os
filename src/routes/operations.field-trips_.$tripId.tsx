import { createFileRoute } from "@tanstack/react-router";
import { FieldTripOperationsView } from "@/routes/operations.field-trips";
import { listFieldTripOperations } from "@/modules/field-trips/field-trip-operations.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/operations/field-trips_/$tripId")({
  loader: safeLoader(() => listFieldTripOperations(), { authMessage: "Sign in as an authorized registrar to view this field trip." }),
  component: FieldTripDetailPage,
});

function FieldTripDetailPage() {
  const outcome = Route.useLoaderData();
  const { tripId } = Route.useParams();
  if (!outcome.ok) return <LoaderFailure eyebrow="Operations" title="Field trip" outcome={outcome}/>;
  return <FieldTripOperationsView key={tripId} data={outcome.data} mode="detail" tripId={tripId}/>;
}