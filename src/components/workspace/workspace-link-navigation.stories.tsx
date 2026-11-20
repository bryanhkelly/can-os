import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { DetailNavigation } from "./workspace-panel";
import { WorkspaceLinkNavigation } from "./workspace-link-navigation";

const meta = {
  title: "V6.1 foundations/Shared navigation",
  parameters: {
    layout: "fullscreen",
    chromatic: { modes: { light: { theme: "light" }, dark: { theme: "dark" }, site: { theme: "site" } },
      viewports: [390, 768, 1440] },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const items = [
  { id: "overview", label: "Overview" },
  { id: "learning", label: "Classroom & learning" },
  { id: "grades", label: "Grades and released feedback" },
  { id: "calendar", label: "Calendar" },
];

function TabsExample() {
  const [selected, setSelected] = useState("overview");
  return <div className="min-w-0 space-y-4 bg-background p-4 text-foreground sm:p-8">
    <h1 className="font-serif text-2xl">Class sections preview</h1>
    <DetailNavigation label="Class sections" variant="record">
      {items.map(item => <a key={item.id} href={`#${item.id}`}
        aria-current={selected === item.id ? "page" : undefined}
        onClick={event => { event.preventDefault(); setSelected(item.id); }}>{item.label}</a>)}
    </DetailNavigation>
    <p role="status" aria-live="polite">Selected section: {selected}</p>
  </div>;
}

export const ResponsiveRecordTabs: Story = {
  render: () => <TabsExample/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole("navigation", { name: "Class sections" });
    await expect(nav).toBeVisible();
    await expect(within(nav).getAllByRole("link")).toHaveLength(items.length);
    await expect(within(nav).getByRole("link", { name: "Overview" }))
      .toHaveAttribute("aria-current", "page");
    await userEvent.click(within(nav).getByRole("link", { name: "Grades and released feedback" }));
    await expect(within(nav).getByRole("link", { name: "Grades and released feedback" }))
      .toHaveAttribute("aria-current", "page");
    await expect(within(nav).getAllByRole("link").filter(link =>
      link.getAttribute("aria-current") === "page")).toHaveLength(1);
    await expect(canvas.getByRole("status")).toHaveTextContent("grades");
  },
};

export const RelatedDestinations: Story = {
  render: () => <div className="max-w-3xl bg-background p-4 text-foreground">
    <WorkspaceLinkNavigation label="Curriculum workflows" surface="panel">
      <a href="#browse">Browse</a>
      <a href="#resources">Resources</a>
      <a href="#imports">Imports</a>
      <a href="#roster">Roster exchange</a>
    </WorkspaceLinkNavigation>
  </div>,
  play: async ({ canvasElement }) => {
    const nav = within(canvasElement).getByRole("navigation", { name: "Curriculum workflows" });
    await expect(nav).toHaveAttribute("data-workspace-link-navigation", "panel");
    await expect(within(nav).getAllByRole("link")).toHaveLength(4);
  },
};

export const PlainDestinationLinks: Story = {
  render: () => <div className="bg-background p-4 text-foreground">
    <WorkspaceLinkNavigation label="School review navigation" surface="plain">
      <a href="#operations">Back to operations</a>
      <a href="#planning">School-year planning</a>
    </WorkspaceLinkNavigation>
  </div>,
};
