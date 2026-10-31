import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within, fn } from "storybook/test";
import { EvidenceReviewForm } from "./EvidenceReviewForm";
const meta = { title: "Evidence/Review form", component: EvidenceReviewForm,
  args: { onReview: async () => {} } } satisfies Meta<typeof EvidenceReviewForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const IndependentReview: Story = { args: {
  label: "Independent review reason", approveLabel: "Verify this version",
  rejectLabel: "Reject and request correction",
} };

export const ApproveWithKeyboard: Story = {
  args: { onReview: fn(async () => {}) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole("textbox", { name: "Review rationale" });
    await userEvent.click(textarea);
    await userEvent.type(textarea, "The submitted document meets the required evidence criteria.");
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await expect(args.onReview).toHaveBeenCalledWith("approve",
      "The submitted document meets the required evidence criteria.");
    await expect(textarea).toHaveValue("");
  },
};
export const FailedReviewRetainsRationale: Story = {
  args: { onReview: fn(async () => { throw new Error("Version changed"); }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole("textbox", { name: "Review rationale" });
    await userEvent.type(textarea, "Please provide a corrected and signed document.");
    await userEvent.click(canvas.getByRole("button", { name: "Reject and request correction" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Version changed");
    await expect(textarea).toHaveValue("Please provide a corrected and signed document.");
  },
};
