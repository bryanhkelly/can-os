import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { CredentialDeliveryHistory } from "./CredentialDeliveryHistory";

const meta = {
  id: "learning-credential-delivery-history", title: "08 Feature workspaces/Learning/Credential delivery history",
  component: CredentialDeliveryHistory,
} satisfies Meta<typeof CredentialDeliveryHistory>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ProviderTransportHistory: Story = {
  args: {
    records: [
      {
        id: "accepted-1",
        recipientName: "Example Registrar",
        recipientEmail: "registrar@example.test",
        status: "accepted",
        providerMessageId: "provider-ack-1",
        lastError: null,
        createdAt: new Date("2026-11-17T12:00:00Z"),
        sentAt: null,
      },
      {
        id: "pending-1",
        recipientName: "Example Coordinator",
        recipientEmail: "coordinator@example.test",
        status: "pending",
        providerMessageId: null,
        lastError: null,
        createdAt: new Date("2026-11-17T10:00:00Z"),
        sentAt: null,
      },
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Accepted by provider")).toBeVisible();
    await expect(canvas.getByText("Pending")).toBeVisible();
    await expect(canvas.queryByText("Delivered")).not.toBeInTheDocument();
  },
};

export const NoDeliveryRecords: Story = {
  args: { records: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("No delivery receipts loaded.");
  },
};
