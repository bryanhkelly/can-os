import { createFileRoute } from "@tanstack/react-router";
import { InterestEventsWorkspace } from "@/routes/operations.interest-events";
import { listSchoolInterestEvents } from "@/modules/enrollment/interest-events.functions";
import { siteProgramSelectionSchema } from "@/lib/route-search";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/operations/interest-events_/$eventId")({
  validateSearch: (search: Record<string, unknown>) => siteProgramSelectionSchema.parse(search),
  loader: safeLoader(() => listSchoolInterestEvents(), { authMessage: "Sign in as an authorized school administrator to view this event." }),
  component: InterestEventDetailPage,
});

function InterestEventDetailPage() {
  const outcome = Route.useLoaderData();
  const selection = Route.useSearch();
  const { eventId } = Route.useParams();
  if (!outcome.ok) return <LoaderFailure eyebrow="School launch" title="Interest event" outcome={outcome}/>;
  return <InterestEventsWorkspace key={eventId} data={outcome.data} selection={selection} eventId={eventId} mode="detail"/>;
}