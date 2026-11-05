import { PageFrame, PageTitle } from "@/components/workspace";
import { createFileRoute } from "@tanstack/react-router";
import { EngagementNextSteps } from "@/components/engagement/EngagementNextSteps";
import { getJourneyById } from "@/domain/engagement-context";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/next/$journeyId")({
  head: () => ({ meta: [
    { title: "Choose your next step | CAN Academy" },
    { name: "robots", content: "noindex,nofollow" },
  ] }),
  component: NextSteps,
});

function NextSteps() {
  const journey = getJourneyById(Route.useParams().journeyId);
  return journey ? <EngagementNextSteps journey={journey}/> :
    <PageFrame width="reading" className="mx-auto max-w-2xl px-5 py-20">
      <PageTitle className="font-serif text-4xl">Find your next step.</PageTitle>
      <p className="mt-3 text-sm text-muted-foreground">Choose the opportunity you want to explore with CAN.</p>
      <Link to="/landing" className="mt-5 inline-block min-h-11 text-primary underline">Explore CAN pathways</Link>
    </PageFrame>;
}
