import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, WorkspacePanel } from "@/components/workspace/workspace-panel";
import { DashboardPanel } from "@/components/workspace/dashboard-layout";
import { StatCard } from "@/components/workspace/stat-card";

const meta = { title: "V6.1 foundations/Visual grammar", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const ColorAndTypography: Story = { render: () => <div className="min-h-screen space-y-8 bg-background p-6 text-foreground">
  <div className="border-b pb-5">
    <p className="text-xs font-semibold uppercase tracking-eyebrow text-muted-foreground">V6.1 system</p>
    <h1 className="mt-2 font-serif text-5xl font-normal">Clarity without clutter.</h1>
    <p className="mt-3 font-sans text-sm text-muted-foreground">DM Sans interface text; Instrument Serif editorial and section headings; square corners.</p>
  </div>
  <div className="grid gap-3 sm:grid-cols-3">
    <div className="border bg-card p-4"><p className="text-xs font-semibold">Neutral</p><p className="mt-2 text-sm text-muted-foreground">The default presentation for metrics, drafts and routine information.</p></div>
    <div className="border border-primary bg-card p-4"><p className="text-xs font-semibold">Interactive</p><p className="mt-2 text-sm text-muted-foreground">Blue signals navigation, actions and keyboard focus—not success.</p></div>
    <div className="border bg-card p-4"><p className="text-xs font-semibold">Semantic</p><div className="mt-3 flex flex-wrap gap-2"><StatusBadge>Draft</StatusBadge><StatusBadge tone="attention">Review</StatusBadge><StatusBadge tone="danger">Blocked</StatusBadge><StatusBadge tone="success">Verified</StatusBadge></div></div>
  </div>
  <DashboardPanel title="Component hierarchy" action={<Button size="sm">Primary action</Button>}>
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard label="Applications" value={24} hint="Neutral metric" />
      <StatCard label="Actions" value={8} hint="3 require review" />
      <StatCard label="Programs" value={3} hint="Authorized scope only" />
    </div>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <Button>Save changes</Button><Button variant="outline">Cancel</Button><Button variant="ghost">More details</Button>
      <Input aria-label="Example search" placeholder="Search records…" className="max-w-xs" />
    </div>
  </DashboardPanel>
  <WorkspacePanel title="Canonical controls" description="Use the existing shared primitives; no new component library is needed.">
    <p className="text-sm text-muted-foreground">Status, layout and action state belong to verified domain data, not color-driven inference.</p>
  </WorkspacePanel>
</div> };
