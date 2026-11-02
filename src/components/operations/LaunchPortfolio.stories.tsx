import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { LaunchPortfolio } from "./LaunchPortfolio";

type Launch = ComponentProps<typeof LaunchPortfolio>["launches"][number];

const launches: Launch[] = [
  {
    id: "synthetic-program",
    name: "Synthetic Academy",
    slug: "synthetic-academy",
    type: "full_school",
    status: "launching",
    organizationId: "synthetic-organization",
    academicProviderOrganizationId: "synthetic-provider",
    siteId: "synthetic-site",
    siteTimezone: "America/Los_Angeles",
    publicSiteSlug: null,
    publicSiteStatus: null,
    createdAt: "2030-01-01T12:00:00.000Z",
    publicSite: null,
    journey: { id: "synthetic-journey", status: "in_progress" },
    canReviewEvidence: false,
    openingOperators: [],
    requirements: [
      { id: "staff", key: "teacher-readiness", title: "Verify teachers", status: "needs_can", blocking: true, ownerPersonId: null, evidence: [], metadata: {} },
      { id: "year", key: "school-year", title: "Review academic year", status: "needs_you", blocking: true, ownerPersonId: null, evidence: [], metadata: {} },
      { id: "orientation", key: "orientation", title: "Schedule orientation", status: "complete", blocking: false, ownerPersonId: null, evidence: [], metadata: {} },
    ],
  },
];

const meta = {
  title: "Operations/Launch portfolio",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function withRouter(content: ReactNode) {
  const root = createRootRoute({ component: () => <div className="bg-background p-4 sm:p-8">{content}</div> });
  const index = createRoute({
    getParentRoute: () => root,
    path: "/operations/launch",
    component: () => null,
  });
  const academicSetup = createRoute({
    getParentRoute: () => root,
    path: "/operations/launch/$programId",
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([index, academicSetup]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return <RouterProvider router={router}/>;
}

export const BlockingRequirements: Story = {
  render: () => withRouter(
    <LaunchPortfolio launches={launches} sites={[
      { id: "synthetic-site", name: "Synthetic Site", organizationId: "synthetic-organization", slug: "synthetic-site", timezone: "America/Los_Angeles" },
    ]}/>,
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: "Continue guided launch" })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: "Review academic setup" })).toHaveFocus();
  },
};

export const JourneyUnavailable: Story = {
  render: () => withRouter(
    <LaunchPortfolio launches={[{ ...launches[0]!, journey: null, requirements: [] }]} sites={[]}/>,
  ),
};
