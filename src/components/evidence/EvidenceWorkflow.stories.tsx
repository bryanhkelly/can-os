import type { Meta, StoryObj } from "@storybook/react-vite";
import { EvidenceWorkflow } from "./EvidenceWorkflow";
const meta = { title: "Evidence/Workflow", component: EvidenceWorkflow,
  args: { title: "School opening evidence", status: "pending" } } satisfies Meta<typeof EvidenceWorkflow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Pending: Story = {};
export const Rejected: Story = { args: { status: "rejected", rejectionReason:
  "Please provide a legible updated certificate identifying the current school location." } };
export const LongContent: Story = { args: { title: "Annual school opening evidence — ".repeat(5),
  status: "approved" } };
