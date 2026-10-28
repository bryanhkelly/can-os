import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { StatusBadge, WorkspacePanel } from "@/components/workspace";
import { BrandTheme } from "./brand-theme";

const meta = { title: "Branding/Controlled tokens" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const SiteBrand: Story = {
  render: () => <BrandTheme brand={{ primary: "#075b50", primaryForeground: "#ffffff", accent: "#e5f4f0", accentForeground: "#102a26" }}>
    <div className="p-6"><WorkspacePanel title="Site-branded workspace" description="Only validated semantic action and accent tokens change.">
      <div className="flex flex-wrap items-center gap-3"><Button>Primary action</Button><StatusBadge tone="info">Canonical status</StatusBadge></div>
    </WorkspacePanel></div>
  </BrandTheme>,
};

export const InvalidBrandFallsBack: Story = {
  render: () => <BrandTheme brand={{ primary: "#ffffff", primaryForeground: "#ffffff" }}>
    <div className="p-6"><WorkspacePanel title="Accessible fallback" description="A low-contrast brand input is rejected as a complete token set.">
      <Button>Readable primary action</Button>
    </WorkspacePanel></div>
  </BrandTheme>,
};
