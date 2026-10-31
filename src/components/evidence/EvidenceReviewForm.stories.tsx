import type { Meta, StoryObj } from "@storybook/react";
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
