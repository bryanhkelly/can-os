import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";
import { SiteStaffingFeedback } from "./SiteStaffingFeedback";

const meta = {
  title: "Operations/Site staffing feedback",
  parameters: { chromatic: { modes: {
    light: { theme: "light" }, dark: { theme: "dark" }, site: { theme: "site" },
  } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const noop = fn();

export const Recorded: Story = {
  render: () => <div className="bg-background p-6">
    <SiteStaffingFeedback notice="Section facilitator recorded. Safeguarding approval remains separate."
      onRetry={noop} busy={false}/>
  </div>,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("Section facilitator recorded");
    await expect(canvas.queryByRole("button", {name:"Refresh staffing"})).not.toBeInTheDocument();
  },
};

export const RefreshRequired: Story = {
  render: () => <div className="bg-background p-6">
    <SiteStaffingFeedback notice="Section appointment saved."
      refreshWarning="The current staffing records could not refresh. Retry the read before another write."
      onRetry={noop} busy={false}/>
  </div>,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("Section appointment saved.");
    await expect(canvas.getByRole("button", {name:"Refresh staffing"})).toBeEnabled();
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
  },
};

export const RefreshPending: Story = {
  render: () => <div className="bg-background p-6">
    <SiteStaffingFeedback notice="Section appointment saved."
      refreshWarning="Reconciliation is still required."
      onRetry={noop} busy/>
  </div>,
  play: async ({canvasElement}) => {
    const button = within(canvasElement).getByRole("button", {name:"Refresh staffing"});
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy","true");
  },
};

export const CommandFailed: Story = {
  render: () => <div className="bg-background p-6">
    <SiteStaffingFeedback error="The requested change was not authorized."
      onRetry={noop} busy={false}/>
  </div>,
};
