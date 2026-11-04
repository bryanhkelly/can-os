import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { DetailNavigation, SectionTab } from "./workspace-panel";

const tabs = [["overview", "Overview"], ["calendar", "Calendar"], ["announcements", "Announcements"]] as const;

function RecordTabs({ tab }: { tab: string }) {
  return <div className="bg-background p-5 sm:p-8">
    <DetailNavigation label="School sections">{tabs.map(([value, label]) => <SectionTab key={value} current={tab === value}
      link={{ to: "/student/my-school", search: value === "overview" ? {} : { tab: value } }}>{label}</SectionTab>)}</DetailNavigation>
  </div>;
}

const withLocation = (path: string) => (Story: () => React.JSX.Element) => {
  const root = createRootRoute({ component: Story });
  return <RouterProvider router={createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: [path] }) })} />;
};

const meta = { title: "V6.1 templates/Section tabs", component: RecordTabs, parameters: { layout: "fullscreen" } } satisfies Meta<typeof RecordTabs>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The tab without search params ("Overview") must not also read as current on another tab. */
export const OneCurrentTab: Story = {
  args: { tab: "calendar" },
  decorators: [withLocation("/student/my-school?tab=calendar")],
  play: async ({ canvas }) => {
    const current = canvas.getAllByRole("link").filter(link => link.getAttribute("aria-current") === "page");
    await expect(current).toHaveLength(1);
    await expect(current[0]).toHaveTextContent("Calendar");
  },
};

/** Extra scope params in the URL (site, program) keep the caller's current tab. */
export const ScopedLocation: Story = {
  args: { tab: "overview" },
  decorators: [withLocation("/student/my-school?siteId=site-1")],
  play: async ({ canvas }) => {
    const current = canvas.getAllByRole("link").filter(link => link.getAttribute("aria-current") === "page");
    await expect(current).toHaveLength(1);
    await expect(current[0]).toHaveTextContent("Overview");
  },
};
