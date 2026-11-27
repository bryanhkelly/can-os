import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { FieldTripFacts } from "./FieldTripFacts";

const meta = {
  id: "field-trips-shared-trip-facts", title: "08 Feature workspaces/Field trips/Shared trip facts",
  parameters: { chromatic: { modes: {
    light: { theme: "light" }, dark: { theme: "dark" }, site: { theme: "site" },
  } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const dates = {
  departsAt: "2027-05-01T16:00:00.000Z",
  returnsAt: "2027-05-01T23:00:00.000Z",
  timezone: "America/Los_Angeles",
};

export const ScheduledTrip: Story = {
  render: () => <div className="max-w-xl border bg-card p-5">
    <h2 className="font-semibold">Authorized trip details</h2>
    <FieldTripFacts trip={{ ...dates, deadline: "2027-04-28T23:00:00.000Z", feeAmountCents: 1250 }}/>
    <p className="mt-4 text-xs text-muted-foreground">
      Display of a trip invitation is not permission to attend or board.
    </p>
  </div>,
  play: async ({canvas}) => {
    await expect(canvas.getByLabelText("Field trip schedule and fee")).toBeVisible();
    await expect(canvas.getByText("$12.50")).toBeVisible();
    await expect(canvas.getByText(/not permission to attend or board/)).toBeVisible();
  },
};

export const DeadlineNotSet: Story = {
  render: () => <div className="max-w-xl border bg-card p-5">
    <FieldTripFacts trip={{ ...dates, deadline: null, feeAmountCents: null }}/>
  </div>,
  play: async ({canvas}) => {
    await expect(canvas.getByText("Before departure")).toBeVisible();
    await expect(canvas.getByText("No fee")).toBeVisible();
  },
};
