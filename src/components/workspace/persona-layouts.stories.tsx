import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";
import { StatCard } from "./stat-card";
import { StatusBadge, WorkspacePanel } from "./workspace-panel";
import { WorkspaceShell } from "./workspace-shell";

const meta = { title: "Persona layouts" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const FamilyHome: Story = {
  render: () => <WorkspaceShell eyebrow="CAN OS · Family" title="Good morning, Avery's family"
    subtitle="One place for the next authorized family actions.">
    <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Needs you" value="2" /><StatCard label="Today's classes" value="5" /><StatCard label="Unread messages" value="1" /></div>
    <WorkspacePanel title="Needs you" description="Exact student and school context" className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><StatusBadge tone="attention">Signature needed</StatusBadge><p className="mt-3 font-medium">Enrollment consent · Avery</p></div><Button>Open requirement</Button></div>
    </WorkspacePanel>
  </WorkspaceShell>,
};

export const TeacherWorkspace: Story = {
  render: () => <WorkspaceShell eyebrow="CAN OS · Teaching" title="Today's teaching workspace"
    subtitle="Assigned sections and server-authorized follow-up.">
    <WorkspacePanel title="First lesson" description="Biology · Period 2"><p className="text-sm text-muted-foreground">Published lesson content and the assigned class roster.</p></WorkspacePanel>
  </WorkspaceShell>,
};

export const SchoolOperator: Story = {
  render: () => <WorkspaceShell eyebrow="CAN OS · Operations" title="School operations"
    subtitle="Canonical readiness without synthetic approval indicators." width="wide">
    <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Active programs" value="3" /><StatCard label="Open reviews" value="7" /><StatCard label="Blocked openings" value="1" /></div>
    <WorkspacePanel title="Opening readiness" className="mt-6"><EmptyState title="No opening selected." description="Choose an authorized site and program to inspect its requirements." /></WorkspacePanel>
  </WorkspaceShell>,
};
