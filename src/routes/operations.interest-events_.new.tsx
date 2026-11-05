import { createFileRoute } from "@tanstack/react-router";
import { InterestEventsWorkspace } from "@/routes/operations.interest-events";
import { listSchoolInterestEvents } from "@/modules/enrollment/interest-events.functions";
import { siteProgramSelectionSchema } from "@/lib/route-search";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/operations/interest-events_/new")({
  validateSearch: (search: Record<string, unknown>) => siteProgramSelectionSchema.parse(search),
  loader: safeLoader(() => listSchoolInterestEvents(), { authMessage: "Sign in as an authorized school administrator to create an event." }),
  component: CreateInterestEventPage,
});

function CreateInterestEventPage() {
  const outcome = Route.useLoaderData();
  const selection = Route.useSearch();
  if (!outcome.ok) return <LoaderFailure eyebrow="School launch" title="Create interest event" outcome={outcome}/>;
  return <InterestEventsWorkspace key={JSON.stringify(selection)} data={outcome.data} selection={selection} mode="create"/>;
}