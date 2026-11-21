import type { Meta, StoryObj } from "@storybook/react-vite";
import { LaunchModuleDestinationV61 } from "./LaunchModuleDestinationV61";

/**
 * Governed Launch handoff fixture only. Share now uses the real shared
 * MarketingPackagesV61 route and should not be portrayed as a placeholder.
 */
const meta = {
  title: "Workflows/Launch Studio/V6.1 governed destination",
  component: LaunchModuleDestinationV61,
  parameters: { layout: "fullscreen" },
  args: {
    siteId: "00000000-0000-4000-8000-000000000001",
    module: "open",
    title: "Opening Checklist",
    stage: "Launch",
  },
} satisfies Meta<typeof LaunchModuleDestinationV61>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FinalGate: Story = {
  args: {
    module: "open", title: "Opening Checklist", stage: "Launch",
  },
};
