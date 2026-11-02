import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import type { DailyAttentionItem } from "@/domain/daily-operations";
import { SiteTodayPriorities } from "./SiteTodayPriorities";

const items: DailyAttentionItem[] = [
  {
    id: "handoff",
    category: "opening",
    title: "Opening handoff awaiting receipt",
    detail: "The named operator reviews the recorded opening and acknowledges receipt separately.",
    href: "/sites/synthetic-site",
    nextStep: "Review the named handoff",
    ownerName: "Synthetic site operator",
    dueAt: null,
    priority: "critical",
  },
  {
    id: "coverage",
    category: "staffing",
    title: "Adult check-in missing",
    detail: "One scheduled coverage block has no current arrival report.",
    href: "/operations?siteId=synthetic-site&action=coverage",
    nextStep: "Review action",
    ownerName: null,
    dueAt: "2030-01-02T12:00:00.000Z",
    priority: "high",
  },
];

const meta = {
  title: "Operations/Site Today priorities",
  component: SiteTodayPriorities,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SiteTodayPriorities>;
export default meta;
type Story = StoryObj<typeof meta>;

const render: Story["render"] = args => (
  <div className="bg-background p-4 sm:p-8">
    <SiteTodayPriorities {...args}/>
  </div>
);

export const StaffingAndAttendanceExceptions: Story = {
  args: { items, siteId: "synthetic-site", siteTimezone: "America/Los_Angeles", ownedActionIds: [], staffingExceptionCount: 1, studentExceptionCount: 2 },
  render,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: "Review staffing" })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: "Review student exceptions" })).toHaveFocus();
  },
};

export const QuietDay: Story = {
  args: { items: [], siteId: "synthetic-site", siteTimezone: "America/Los_Angeles", ownedActionIds: [], staffingExceptionCount: 0, studentExceptionCount: 0 },
  render,
};
