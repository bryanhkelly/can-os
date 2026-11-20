import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { GuidedSetupShell } from "@/components/workflow/guided-setup-shell";

const meta = {
  title: "Workflows/Launch Studio/V6.1 internal steps",
  component: GuidedSetupShell,
  parameters: { layout: "padded" },
} satisfies Meta<typeof GuidedSetupShell>;
export default meta;
type Story = StoryObj<typeof meta>;

function Example({ variant }: { variant: "two" | "four" }) {
  const items = variant === "four" ? [
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
