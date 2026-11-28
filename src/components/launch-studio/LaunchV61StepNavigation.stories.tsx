import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { GuidedSetupProgress, GuidedSetupShell } from "@/components/workflow/guided-setup-shell";

const meta = {
  id: "workflows-launch-studio-v6-1-internal-steps", title: "08 Feature workspaces/Launch Studio/Internal steps",
  component: GuidedSetupShell,
  parameters: { layout: "padded" },
  args: { title: "Site Information", steps: [], children: null },
} satisfies Meta<typeof GuidedSetupShell>;
export default meta;
type Story = StoryObj<typeof meta>;

function Example({ variant }: { variant: "two" | "four" }) {
  const items: Array<readonly [string, string, string]> = variant === "four" ? [
    ["hosting", "Hosting & Organization", "Confirm your local host"],
    ["environment", "Learning Environment", "Choose how learning happens"],
    ["network", "Network Affiliation", "Optional partnership"],
    ["story", "Your Story", "Your learning community"],
  ] : [
    ["interests", "Program Interests", "What you want to offer"],
    ["audiences", "Your Audiences", "Who you hope to serve"],
  ];
  const [current, setCurrent] = useState(items[0]![0]);
  const steps = items.map(([id,title,description]) => ({
    id, title, description, status: id === current ? "current" as const : "upcoming" as const,
  }));
  return <div className="mx-auto max-w-4xl">
    <GuidedSetupShell
      title={variant === "four" ? "Site Information" : "Programs & Audiences"}
      description="Internal steps live in the center pane, not in the global Launch navigation."
      steps={steps} onStepChange={setCurrent}>
      <p className="text-sm">Editing: {items.find(item => item[0] === current)?.[1]}</p>
      <p className="mt-3 text-xs text-muted-foreground">
        Visiting a step does not mark it saved, complete or approved.
      </p>
    </GuidedSetupShell>
  </div>;
}

export const FourSiteInformationSteps: Story = {
  render: () => <Example variant="four"/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const story = canvas.getByRole("button", {name:/Your Story/});
    await userEvent.click(story);
    await expect(story).toHaveAttribute("aria-current","step");
    await expect(canvas.getByText("Editing: Your Story")).toBeInTheDocument();
  },
};
export const TwoProgramsAudiencesSteps: Story = {
  render: () => <Example variant="two"/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const audience = canvas.getByRole("button",{name:/Your Audiences/});
    await userEvent.click(audience);
    await expect(audience).toHaveAttribute("aria-current","step");
  },
};

/** Progress is informational until the owning module validates the next step. */
export const PassiveMarketingPackageProgress: Story = {
  render: () => <GuidedSetupProgress label="Package progress" steps={[
    { id: "menu", title: "Menu", status: "upcoming" },
    { id: "audience", title: "Audience", status: "current" },
    { id: "message", title: "Messages", status: "upcoming" },
    { id: "assets", title: "Collateral & Assets", status: "upcoming" },
  ]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const progress = canvas.getByRole("list", { name: "Package progress" });
    await expect(progress.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    await expect(within(progress).queryByRole("button")).not.toBeInTheDocument();
  },
};

/** Six steps use the same presentation as two-step and four-step modules. */
export const SixWebsiteBrandSteps: Story = {
  render: () => <GuidedSetupProgress label="Website & Brand steps" steps={[
    { id: "brand", title: "Brand Identity", description: "Choose an editorial direction", status: "complete" },
    { id: "wireframe", title: "Choose Wireframe", description: "Choose a structure", status: "current" },
    { id: "visual", title: "Visual Identity", description: "Colors, fonts and imagery", status: "upcoming" },
    { id: "consent", title: "Content Consent", description: "Approve information reuse", status: "upcoming" },
    { id: "content", title: "Your Content", description: "Edit website content", status: "upcoming" },
    { id: "review", title: "Review & Finish", description: "Review private draft", status: "upcoming" },
  ]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const progress = canvas.getByRole("list", { name: "Website & Brand steps" });
    await expect(progress.querySelectorAll("li")).toHaveLength(6);
    await expect(progress.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    await expect(within(progress).queryByRole("button")).not.toBeInTheDocument();
  },
};
