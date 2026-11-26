import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { StatusTimeline } from "./status-timeline";

const meta = {
  id: "foundations-status-timeline", title: "04 Application patterns/Status timeline",
  component: StatusTimeline,
} satisfies Meta<typeof StatusTimeline>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RecordedDecisions: Story = {
  args: {
    label: "Authorized decision history",
    entries: [
      { id: "2", title: "Correction approved", occurredAt: "2026-11-16T08:00:00Z",
        description: "A later decision supersedes the original.", status: "Approved", tone: "success" },
      { id: "1", title: "Initial review", occurredAt: "2026-11-15T11:00:00Z",
        status: "Needs correction", tone: "attention" },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("list", { name: "Authorized decision history" })).toBeVisible();
    await expect(canvas.getByText("Correction approved")).toBeVisible();
    await expect(canvas.getByText("Needs correction")).toBeVisible();
    await expect(canvasElement.querySelectorAll("time")).toHaveLength(2);
  },
};

export const NoRecordedEvents: Story = {
  args: { entries: [], emptyMessage: "No decision has been recorded." },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("No decision has been recorded.");
  },
};

export const SiteLocalAuditTime: Story = {
  args: {
    label: "School review events",
    timeZone: "America/Los_Angeles",
    entries: [{
      id: "school-review", title: "Independent review recorded",
      occurredAt: "2026-11-17T19:00:00.000Z",
      status: "Review complete", tone: "info",
    }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/11:00 AM PST/)).toBeVisible();
    await expect(canvas.getByText("Independent review recorded")).toBeVisible();
  },
};
