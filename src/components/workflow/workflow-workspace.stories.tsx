import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkflowWorkspace, WorkflowProgress, type WorkflowStepView } from "./workflow-workspace";
import { StatusBadge } from "@/components/workspace/workspace-panel";
import { Button } from "@/components/ui/button";
import { fn } from "storybook/test";

const meta = { title: "V6.1 templates/User and workflow flows", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const admissionsSteps: readonly WorkflowStepView[] = [
  { id: "inquiry", label: "Family inquiry", state: "complete", detail: "Inquiry recorded and linked to a household" },
  { id: "application", label: "Application", state: "complete", detail: "Submitted by the verified household" },
  { id: "review", label: "Evidence review", state: "current", detail: "Guardian verification requires review" },
  { id: "decision", label: "Decision and offer", state: "upcoming", detail: "Independent eligibility gate" },
  { id: "enroll", label: "Enrollment", state: "upcoming", detail: "Separate institutional enrollment transition" },
];

export const AdmissionsApplication: Story = {
  render: () => <div className="bg-background p-4 sm:p-8">
    <WorkflowWorkspace eyebrow="Admissions / Application" title="Avery Kelly"
      description="The selected record, next action and owning decision appear above the fold."
      status={<StatusBadge tone="attention">Awaiting review</StatusBadge>}
      identity="Valor Academy · Grade 9 · APP-2026-1042 · Illustrative record"
      steps={admissionsSteps}
      actions={<div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-semibold">Next action: verify guardian documentation</p>
        <p className="text-xs text-muted-foreground">Assigned to admissions registrar</p></div>
        <Button onClick={fn()}>Open review</Button>
      </div>}
      details={<><h2 className="font-serif text-2xl">Guardian verification</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Owning services supply the current evidence, version, reviewer, and authorization before any decision may be recorded.</p>
        <div className="mt-5 border-t pt-4"><p className="text-xs font-semibold">Required evidence</p>
        <p className="mt-1 text-sm">Guardian documentation</p>
        <div className="mt-2"><StatusBadge tone="attention">Review needed</StatusBadge></div></div></>}
      context={<section className="border bg-card p-4"><h2 className="text-sm font-semibold">Review context</h2>
        <p className="mt-2 text-xs text-muted-foreground">Checklist completion or editorial text cannot authorize enrollment.</p></section>}
      history={<><h2 className="text-sm font-semibold">Activity timeline</h2>
        <p className="mt-3 text-sm text-muted-foreground">Oct 29 · Application submitted by family</p></>}
    />
  </div>,
};

export const SchoolLaunch: Story = {
  render: () => <div className="bg-background p-4 sm:p-8">
    <WorkflowWorkspace eyebrow="School launch" title="Northside Church School"
      description="One configuration journey; separate website review and independent opening authorization."
      status={<StatusBadge>Configuration draft</StatusBadge>}
      identity="San Jose, California · Illustrative workflow"
      steps={[
        { id: "identity", label: "Identity and contacts", state: "complete" },
        { id: "program", label: "Programs and schedule", state: "current" },
        { id: "family", label: "Family information", state: "upcoming" },
        { id: "operations", label: "Staffing and operations", state: "upcoming" },
        { id: "approval", label: "Evidence review and authorization", state: "blocked", detail: "An independent reviewer must verify prerequisites" },
      ]}
      details={<><h2 className="font-serif text-2xl">Programs and schedule</h2>
        <p className="mt-3 text-sm text-muted-foreground">The owning setup workflow provides authoritative program choices, calendar coverage, draft-save state and validation.</p>
        <p className="mt-3 text-xs text-muted-foreground">Sunday is not excluded by default; schedules are program-specific.</p></>}
      context={<section className="border bg-card p-4"><h2 className="text-sm font-semibold">Authorization boundary</h2>
        <p className="mt-2 text-xs text-muted-foreground">Configured, publicly published, admissions-enabled, and authorized to open are distinct states.</p></section>}
    />
  </div>,
};

export const ProgressOnly: Story = { render: () => <div className="max-w-sm bg-background p-5">
  <WorkflowProgress steps={admissionsSteps} />
</div> };
