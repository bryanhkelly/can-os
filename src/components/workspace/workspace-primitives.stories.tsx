import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { ActionFooter } from "./action-footer";
import { EmptyState } from "./empty-state";
import { WorkspaceNotice } from "./notice";
import { QueryState } from "./query-state";
import { StatCard } from "./stat-card";
import { StatusBadge, WorkspacePanel } from "./workspace-panel";
import { WorkspaceActionLink } from "./workspace-action-link";

const meta = { title: "Foundations/Workspace primitives" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const PanelAndStatuses: Story = {
  parameters: { chromatic: { modes: {
    light: { theme: "light" }, dark: { theme: "dark" }, site: { theme: "site" },
  } } },
  render: () => <div className="bg-background p-6"><WorkspacePanel title="Application review" description="Server-authorized record context">
    <div className="flex flex-wrap gap-2">
      <StatusBadge>Draft</StatusBadge><StatusBadge tone="info">In review</StatusBadge>
      <StatusBadge tone="attention">Needs information</StatusBadge><StatusBadge tone="success">Approved</StatusBadge>
      <StatusBadge tone="danger">Blocked</StatusBadge>
    </div>
  </WorkspacePanel></div>,
};

export const Metrics: Story = {
  render: () => <div className="grid gap-4 bg-background p-6 sm:grid-cols-3">
    <StatCard label="Applications" value="18" hint="Current admissions cycle" />
    <StatCard label="Needs review" value="4" hint="Authorized staff queue" />
    <StatCard label="Ready" value="11" hint="Server-evaluated readiness" />
  </div>,
};

export const InteractiveMetric: Story = {
  render: () => <div className="bg-background p-6">
    <StatCard asChild className="max-w-sm" label="Needs your attention" value="3" hint="Open the related items">
      <a href="#details" />
    </StatCard>
  </div>,
};

export const Loading: Story = {
  render: () => <div className="bg-background p-6"><QueryState loading="Loading authorized applications…" /></div>,
};

export const Empty: Story = {
  render: () => <div className="bg-background p-6"><EmptyState title="No applications yet."
    description="New applications appear here after the family submits them." /></div>,
};

export const ErrorWithRetry: Story = {
  render: () => <div className="bg-background p-6"><QueryState error="The workspace could not be loaded. No changes were made."
    onRetry={fn()} /></div>,
};

export const AttentionNotice: Story = {
  render: () => <div className="bg-background p-6">
    <WorkspaceNotice tone="attention">
      The enrollment update was saved, but the records could not be refreshed. Retry refreshing before submitting again.
    </WorkspaceNotice>
  </div>,
};

export const SuccessConfirmation: Story = {
  render: () => <div className="bg-background p-6"><WorkspaceNotice tone="success">Application received. Independent guardian verification is still required.</WorkspaceNotice></div>,
};

export const AuthorizedActionLink: Story = {
  render: () => <div className="max-w-2xl bg-background p-6">
    <WorkspaceActionLink
      title="Review learning requirements"
      description="Open the existing independently authorized workspace. This link does not grant approval."
      href="#review-requirements"
      actionLabel="Review requirements"
    />
  </div>,
};

/** A narrow container also exercises nested panels, not only viewport breakpoints. */
export const NarrowWorkspace: Story = {
  render: () => <div className="w-full max-w-[20rem] bg-background p-4">
    <WorkspacePanel title="Independent account review">
      <div className="space-y-4">
        <StatusBadge tone="attention">Independent identity verification and organizational approval required</StatusBadge>
        <StatCard label="Reference" value="REFERENCEWITHOUTBREAKPOINTS01234567890123456789" />
        <WorkspaceNotice tone="attention">An independently authorized reviewer must confirm the next step.</WorkspaceNotice>
        <ActionFooter layout="inline">
          <Button>Review independently verified account and organizational eligibility</Button>
          <Button variant="outline">Check again</Button>
        </ActionFooter>
      </div>
    </WorkspacePanel>
  </div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const panel = canvas.getByRole("region", { name: "Independent account review" });
    const button = canvas.getByRole("button", { name: "Review independently verified account and organizational eligibility" });
    await expect(button).toBeVisible();
    await expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth + 1);
    await expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
    const bounds = panel.getBoundingClientRect();
    for (const element of panel.querySelectorAll("button, [class*='tabular-nums']")) {
      const rect = element.getBoundingClientRect();
      await expect(rect.right).toBeLessThanOrEqual(bounds.right + 1);
      await expect(rect.left).toBeGreaterThanOrEqual(bounds.left - 1);
    }
  },
};
