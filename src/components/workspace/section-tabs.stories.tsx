import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { FixtureRouter } from "../../../.storybook/fixture-router";
import { DetailNavigation, SectionTab } from "./workspace-panel";

const tabs = [["overview", "Overview"], ["calendar", "Calendar"], ["announcements", "Announcements"]] as const;

function RecordTabs({ tab, variant = "default" }: { tab: string; variant?: "default" | "record" }) {
  return <div className="bg-background p-5 sm:p-8">
    <DetailNavigation label="School sections" variant={variant}>{tabs.map(([value, label]) => <SectionTab key={value} current={tab === value}
      link={{ to: "/student/my-school", search: value === "overview" ? {} : { tab: value } }}>{label}</SectionTab>)}</DetailNavigation>
  </div>;
}

const withLocation = (path: string) => (Story: () => React.JSX.Element) => <FixtureRouter initialPath={path}><Story /></FixtureRouter>;

const meta = { id: "v6-1-templates-section-tabs", title: "03 Components/Section tabs", component: RecordTabs, parameters: { layout: "fullscreen" } } satisfies Meta<typeof RecordTabs>;
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

export const RecordSections: Story = {
  args: { tab: "calendar", variant: "record" },
  decorators: [withLocation("/student/my-school?tab=calendar")],
  play: async ({ canvas }) => {
    const links = canvas.getAllByRole("link");
    const current = links.filter(link => link.getAttribute("aria-current") === "page");
    await expect(current).toHaveLength(1);
    await expect(current[0]).toHaveTextContent("Calendar");
    await expect(current[0]).toHaveStyle({ borderBottomWidth: "2px", borderRadius: "0px" });
    for (const link of links) await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    links[0]!.focus();
    await expect(links[0]).toHaveFocus();
  },
};

function RouterIdentity({ revision }: { revision: number }) {
  const router = useRouter();
  const [initialRouter] = useState(() => router);
  return <p role="status">Revision {revision}: {router === initialRouter ? "same router" : "replaced router"}</p>;
}
function RouterStabilityExample() {
  const [revision, setRevision] = useState(0);
  return <div className="bg-background p-5">
    <button type="button" onClick={() => setRevision(value => value + 1)}>Update fixture data</button>
    <FixtureRouter initialPath="/"><RouterIdentity revision={revision} /></FixtureRouter>
  </div>;
}
export const FixtureRouterPreservesState: Story = {
  args: { tab: "overview" },
  render: () => <RouterStabilityExample />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Revision 0: same router");
    await userEvent.click(canvas.getByRole("button", { name: "Update fixture data" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Revision 1: same router");
  },
};
