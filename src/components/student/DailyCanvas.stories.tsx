import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import { DailyCanvas, type DailyCanvasContent, selectDailyCanvasContent } from "./DailyCanvas";

const defaultContent: DailyCanvasContent = {
  id: "evergreen", audience: "student", priority: "default",
  headline: "Make today count.", supportingCopy: "Your classes and next steps are ready.", campaignLabel: "Your learning day",
};
const meta = { title: "Student/Daily canvas", component: DailyCanvas, parameters: { layout: "fullscreen" } } satisfies Meta<typeof DailyCanvas>;
export default meta;
type Story = StoryObj<typeof meta>;
const render: Story["render"] = args => <div className="bg-background p-4 sm:p-8"><DailyCanvas {...args} /></div>;
export const Default: Story = { args: { audience: "student", content: defaultContent, operationalSummary: "4 classes · 2 assignments due" }, render };
export const Verse: Story = { args: { audience: "student", content: { ...defaultContent, id: "verse", priority: "editorial", headline: "A day to practice love.", verseText: "Let all that you do be done in love.", verseReference: "1 Corinthians 16:14" }, operationalSummary: "Biology begins at 9:00" }, render };
export const Holiday: Story = { args: { audience: "student", content: { ...defaultContent, id: "advent", priority: "seasonal", campaignLabel: "Advent", headline: "A season of hope.", supportingCopy: "Join your school community this week." } }, render };
export const Emergency: Story = { args: { audience: "student", content: { ...defaultContent, id: "closure", priority: "emergency", headline: "Campus closed today", supportingCopy: "Please follow official school instructions for next steps.", verseText: "Editorial content must not displace urgent safety information.", verseReference: "Storybook example" }, operationalSummary: "School-day updates take priority over campaigns." }, render };
export const NoCampaign: Story = { args: { audience: "student", content: null, operationalSummary: "2 assignments due today" }, render };
export const ParentNotice: Story = { args: { audience: "guardian", content: { id: "family", audience: "guardian", priority: "local", headline: "Family conference week", supportingCopy: "Review upcoming events with your school." } }, render };
export const PrioritySelection: Story = { args: { audience: "student", content: selectDailyCanvasContent([defaultContent, { ...defaultContent, id: "safety", priority: "emergency", headline: "Urgent safety update" }], "student", new Date()) }, render };

export const EditorialActions: Story = {
  args: {
    audience: "student", content: defaultContent,
    primaryAction: <a href="#classes" className="can-editorial-primary inline-flex min-h-11 items-center px-5 py-3 text-sm font-semibold">View my classes</a>,
    secondaryAction: <a href="#assignments" className="can-editorial-secondary inline-flex min-h-11 items-center px-5 py-3 text-sm font-semibold">Assignments</a>,
  },
  render,
  play: async ({ canvas }) => {
    const primary = canvas.getByRole("link", { name: "View my classes" });
    await expect(primary).toHaveStyle({ color: "rgb(16, 29, 57)", backgroundColor: "rgb(255, 255, 255)", borderRadius: "0px" });
    await primary.focus();
    await expect(primary).toHaveFocus();
    await expect(primary).toHaveStyle({ outlineStyle: "solid", outlineWidth: "2px" });
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: "Assignments" })).toHaveFocus();
  },
};
export const DarkEditorialActions: Story = { ...EditorialActions, globals: { theme: "dark" } };
export const SiteEditorialActions: Story = { ...EditorialActions, globals: { theme: "site" } };
