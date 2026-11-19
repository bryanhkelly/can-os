import type { Meta, StoryObj } from "@storybook/react-vite";
import { LaunchModuleDestinationV61 } from "./LaunchModuleDestinationV61";

/** Presentation fixtures only. Actions open real authorized routes; they do not
 * create, publish or approve any records inside Storybook. */
const meta = {
  title: "Workflows/Launch Studio/V6.1 destinations",
  component: LaunchModuleDestinationV61,
  parameters: { layout: "fullscreen" },
  args: {
    siteId: "00000000-0000-4000-8000-000000000001",
    module: "promote",
    title: "Promote",
    stage: "Introduce",
  },
} satisfies Meta<typeof LaunchModuleDestinationV61>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Planned: Story = {
  args: {
    module: "promote", title: "Promote", stage: "Introduce",
  },
};
export const ExistingEvents: Story = {
  args: {
    module: "interest-events", title: "Interest Events", stage: "Introduce",
  },
};
export const CanonicalCatalog: Story = {
  args: {
    module: "program-catalog", title: "Program Catalog", stage: "Prepare",
  },
};
export const GovernedOpening: Story = {
  args: {
    module: "opening-compliance", title: "Opening & Compliance", stage: "Prepare",
  },
};
export const FinalGate: Story = {
  args: {
    module: "open", title: "Open", stage: "Open",
  },
};
