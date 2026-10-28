import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { PrerequisiteChecklist } from "@/components/workspace/prerequisite-checklist";
import { StatusBadge, WorkspaceShell, WorkspaceNotice } from "@/components/workspace";
import { ChecklistWorkspaceShell } from "./checklist-workspace-shell";
import { GuidedSetupShell } from "./guided-setup-shell";
import { SplitReviewShell } from "./split-review-shell";

const meta = { title: "Workflows/Patterns" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const GuidedSetup: Story = {
  parameters: { chromatic: { modes: {
    light: { theme: "light" }, dark: { theme: "dark" }, site: { theme: "site" },
  } } },
  render: () => <WorkspaceShell title="School launch" subtitle="A presentational shell over server-owned setup requirements." width="wide">
    <GuidedSetupShell title="Configure the program" steps={[
      { id: "identity", title: "Organization", status: "complete" },
      { id: "program", title: "Program", status: "current" },
      { id: "readiness", title: "Readiness", status: "upcoming" },
      { id: "review", title: "Activation", status: "upcoming" },
    ]} aside={<p className="text-sm leading-6 text-muted-foreground">Activation remains blocked until every required server-evaluated prerequisite is complete.</p>}>
      <WorkspaceNotice>Use the existing bounded command to save this step. Progress is not inferred from client navigation.</WorkspaceNotice>
      <Button className="mt-5">Save configuration</Button>
    </GuidedSetupShell>
  </WorkspaceShell>,
};

export const ChecklistWorkspace: Story = {
  render: () => <WorkspaceShell title="Enrollment checklist" subtitle="Requirements and blockers come from the canonical journey." width="wide">
    <ChecklistWorkspaceShell title="Required evidence" description="Document approval does not bypass independent review."
      summary={<div className="flex gap-2"><StatusBadge tone="attention">2 items need attention</StatusBadge></div>}
      context={<p className="text-sm text-muted-foreground">Student and application context, with no private staff notes.</p>}
      activity={<p className="text-sm text-muted-foreground">Latest authorized transition and timestamp.</p>}>
      <PrerequisiteChecklist label="Enrollment requirements" items={[
        { id: "identity", title: "Guardian identity", satisfied: true, detail: "Verified by an authorized registrar." },
        { id: "consent", title: "Configured consent", satisfied: false, detail: "Signature and school review are required." },
      ]} />
    </ChecklistWorkspaceShell>
  </WorkspaceShell>,
};

export const SplitReview: Story = {
  render: () => <WorkspaceShell title="Application review" subtitle="Submitted evidence stays visible beside the authorized decision." width="wide">
    <SplitReviewShell context={<WorkspaceNotice tone="info">The decision command rechecks role, scope and current application state.</WorkspaceNotice>}
      record={<dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Student</dt><dd className="mt-1 font-medium">Synthetic student</dd></div>
        <div><dt className="text-muted-foreground">Program</dt><dd className="mt-1 font-medium">High school</dd></div>
        <div className="sm:col-span-2"><dt className="text-muted-foreground">Submitted evidence</dt><dd className="mt-1">Authorized application DTO content.</dd></div>
      </dl>}
      review={<div className="space-y-4"><p className="text-sm leading-6 text-muted-foreground">Review controls bind to existing server transitions, not to a client-side approval flag.</p>
        <Button disabled>Confirm authorized decision</Button></div>} />
  </WorkspaceShell>,
};
