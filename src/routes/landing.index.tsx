import { createFileRoute } from "@tanstack/react-router";
import { EngagementLandingIndex } from "@/components/engagement/EngagementLanding";

export const Route = createFileRoute("/landing/")({
  head: () => ({
    meta: [
      { title: "Explore a path with CAN Academy" },
      { name: "description", content: "A clear introduction to CAN for churches, teachers, families, Christian schools, and networks." },
    ],
  }),
  component: EngagementLandingIndex,
});
