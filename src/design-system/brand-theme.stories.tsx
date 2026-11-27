import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { Button } from "@/components/ui/button";
import { StatusBadge, WorkspacePanel } from "@/components/workspace";
import { BrandTheme } from "./brand-theme";

const meta = { id: "branding-controlled-tokens", title: "01 Foundations/Controlled brand tokens" } satisfies Meta;
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

function ScopedEyebrows() {
  return <div className="space-y-4 bg-background p-4">
    <div className="dark bg-background p-4 text-foreground"><p className="can-eyebrow">Dark workspace label</p></div>
    <BrandTheme brand={{ primary: "#075b50", primaryForeground: "#ffffff", accent: "#e5f4f0", accentForeground: "#102a26" }}>
      <p className="can-eyebrow">Institutional workspace label</p>
      <BrandTheme className="dark" brand={{ primary: "#075b50", primaryForeground: "#ffffff", accent: "#e5f4f0", accentForeground: "#102a26" }}>
        <p className="can-eyebrow">Dark institutional workspace label</p>
        <Button>Dark institutional action</Button>
      </BrandTheme>
    </BrandTheme>
  </div>;
}
export const NestedThemeContrast: Story = {
  globals: { theme: "light" },
  render: () => <ScopedEyebrows />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Dark workspace label")).toHaveStyle({ color: "rgb(184, 208, 255)" });
    await expect(canvas.getByText("Institutional workspace label")).toHaveStyle({ color: "rgb(7, 91, 80)" });
    await expect(canvas.getByText("Dark institutional workspace label")).toHaveStyle({ color: "rgb(184, 208, 255)" });
    await expect(canvas.getByRole("button", { name: "Dark institutional action" })).toHaveStyle({ backgroundColor: "rgb(138, 180, 255)" });
  },
};
