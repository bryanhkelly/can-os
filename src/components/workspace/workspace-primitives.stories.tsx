import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EmptyState } from "./empty-state";
import { WorkspaceNotice } from "./notice";
import { QueryState } from "./query-state";
import { StatCard } from "./stat-card";
import { StatusBadge, WorkspacePanel } from "./workspace-panel";

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

export const SuccessConfirmation: Story = {
  render: () => <div className="bg-background p-6"><WorkspaceNotice tone="success">Application received. Independent guardian verification is still required.</WorkspaceNotice></div>,
};
