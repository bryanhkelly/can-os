import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { expect, userEvent, within } from "storybook/test";
import { LaunchStudioChrome, LaunchStudioShell, JourneyWelcome } from "./LaunchStudioShell";
import { LaunchStudioEntry } from "./LaunchStudioEntry";
import { Button } from "@/components/ui/button";

const meta = {
  title: "Workflows/Launch Studio",
  parameters: { layout: "fullscreen" },
  decorators: [Story => {
    const router = createRouter({ routeTree: createRootRoute({ component: Story }),
      history: createMemoryHistory({ initialEntries: ["/launch"] }) });
    return <RouterProvider router={router} />;
  }],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const steps = [{ id: "welcome", title: "Welcome" }, { id: "details", title: "School details" },
  { id: "review", title: "Independent review" }];
function Journey({ state = "welcome" }: { state?: "welcome" | "pending" | "error" | "forbidden" | "empty" }) {
  const [step, setStep] = useState("welcome");
  return <LaunchStudioChrome><LaunchStudioShell role="School setup" subject="Isolated example school"
    title="Let's build your school." steps={steps} currentId={step} onStepChange={setStep}
    progress={state === "pending" ? { complete: 1, total: 4 } : undefined}
    actions={<Button onClick={() => setStep("details")}>Let's get started</Button>}
    exit={<a href="#dashboard">Skip to dashboard</a>}>
    {state === "welcome" ? <JourneyWelcome summary="An isolated layout fixture, not a real school."
      requirements={["School location and time zone", "Grade range and intended opening date"]}
      outcome="Saved preparation does not approve school opening." /> :
      <p role={state === "error" || state === "forbidden" ? "alert" : "status"} className="border bg-card p-6 text-sm">
        {{ pending: "Evidence received. Independent review is pending.", error: "School information is unavailable. Retry before continuing.",
          forbidden: "This school is unavailable to your verified account. No other school was selected.",
          empty: "No requirements have been configured. No completion percentage can be inferred." }[state]}
      </p>}
  </LaunchStudioShell></LaunchStudioChrome>;
}
export const Entry: Story = { render: () => <LaunchStudioChrome><LaunchStudioEntry /></LaunchStudioChrome> };
export const Welcome: Story = {
  render: () => <Journey />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Let's get started" }));
    await expect(canvas.getByRole("button", { name: "2 School details" })).toHaveAttribute("aria-current", "step");
    await expect(canvas.queryByText("100%")).not.toBeInTheDocument();
  },
};
export const PendingReview: Story = { render: () => <Journey state="pending" /> };
export const Unavailable: Story = { render: () => <Journey state="error" /> };
export const Forbidden: Story = { render: () => <Journey state="forbidden" /> };
export const Unconfigured: Story = { render: () => <Journey state="empty" /> };
