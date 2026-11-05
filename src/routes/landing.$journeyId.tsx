import { createFileRoute } from "@tanstack/react-router";
import { EngagementLandingDetail, EngagementLandingIndex } from "@/components/engagement/EngagementLanding";
import { getJourneyById } from "@/domain/engagement-context";

export const Route = createFileRoute("/landing/$journeyId")({
  head: ({ params }) => {
    const journey = getJourneyById(params.journeyId);
    return { meta: [
      { title: journey ? `${journey.audience} | CAN Academy` : "Explore CAN Academy" },
      { name: "description", content: journey?.introduction ?? "Explore the CAN Academy partnership and learning model." },
    ] };
  },
  component: LandingJourney,
});

function LandingJourney() {
  const { journeyId } = Route.useParams();
  const journey = getJourneyById(journeyId);
  return journey ? <EngagementLandingDetail journey={journey}/> : <EngagementLandingIndex/>;
}
