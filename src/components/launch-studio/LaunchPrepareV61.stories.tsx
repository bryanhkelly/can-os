import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { expect, within } from "storybook/test";
import { LaunchPrepareV61 } from "./LaunchPrepareV61";

/**
 * Isolated planning-stage examples. These modules render guidance and links,
 * never claim that actual facilities, staff, funding or safeguards are approved.
 */
const siteId = "00000000-0000-4000-8000-000000000001";
const meta = {
  title: "Workflows/Launch Studio/V6.1 Prepare",
  component: LaunchPrepareV61,
  parameters: { layout: "fullscreen" },
  args: { siteId, module: "facilities-resources" },
  decorators: [Story => {
    const root = createRootRoute({ component: () => <Outlet /> });
    const launchSite = createRoute({
      getParentRoute: () => root,
      path: "/launch/site",
      component: Story,
    });
    const router = createRouter({
      routeTree: root.addChildren([launchSite]),
      history: createMemoryHistory({
        initialEntries: ["/launch/site?siteId=" + siteId + "&module=facilities-resources"],
      }),
    });
    return <RouterProvider router={router} />;
  }],
} satisfies Meta<typeof LaunchPrepareV61>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Facilities: Story = {
  args: { module: "facilities-resources" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Facilities & Resources" })).toBeInTheDocument();
    await expect(canvas.getByRole("navigation", { name: "Prepare modules" })).toBeInTheDocument();
    await expect(canvas.queryByText("100%")).not.toBeInTheDocument();
  },
};

export const Team: Story = { args: { module: "invite-team" } };
export const Scheduling: Story = { args: { module: "schedules-capacity" } };
export const Funding: Story = { args: { module: "funding-enrollment" } };
export const Safety: Story = { args: { module: "opening-compliance" } };

export const PublishSite: Story = { args: { module: "publish-site" } };
