import * as React from "react";
import { CircleCheck, CircleDot, Circle, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageEyebrow, PageTitle } from "@/components/workspace/page-frame";

/**
 * A reusable user/workflow flow template for admissions, site setup, approvals,
 * enrollment, staffing, and records review. All step states, decisions and
 * permissions MUST be derived from the owning server workflow.
 */
export type WorkflowStepState = "complete" | "current" | "upcoming" | "blocked";
export interface WorkflowStepView {
  id: string;
  label: string;
  detail?: string;
  state: WorkflowStepState;
  /** A supported, authorized destination. Absent means a noninteractive step. */
  href?: string;
}
const stepIcons = { complete: CircleCheck, current: CircleDot, upcoming: Circle, blocked: CircleAlert };

export function WorkflowProgress({ steps, label = "Workflow progress", className }: {
  steps: readonly WorkflowStepView[];
  label?: string;
  className?: string;
}) {
  return <nav aria-label={label} className={cn("border border-border bg-card", className)}>
    <ol className="divide-y divide-border">
      {steps.map((step, i) => {
        const Icon = stepIcons[step.state];
        const content = <><Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0",
          step.state === "blocked" ? "text-danger" : step.state === "complete" ? "text-success" :
          step.state === "current" ? "text-primary" : "text-muted-foreground")} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-foreground">{i + 1}. {step.label}</span>
            {step.detail && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{step.detail}</span>}
            <span className="sr-only">{step.state === "complete" ? "Complete" : step.state === "current" ? "Current step" : step.state === "blocked" ? "Blocked" : "Upcoming"}</span>
          </span></>;
        return <li key={step.id}>
          {step.href ? <a href={step.href} aria-current={step.state === "current" ? "step" : undefined}
            className="flex gap-3 p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{content}</a>
            : <div aria-current={step.state === "current" ? "step" : undefined} className="flex gap-3 p-4">{content}</div>}
        </li>;
      })}
    </ol>
  </nav>;
}

/**
 * Generic workflow layout—not a parallel workflow engine. Its owner supplies:
 * authoritative status, assigned owner, current stage, next action, and detail.
 */
export function WorkflowWorkspace({ eyebrow, title, description, status, identity, steps, details,
  actions, context, history, footer, className }: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  status?: React.ReactNode;
  identity?: React.ReactNode;
  steps: readonly WorkflowStepView[];
  details: React.ReactNode;
  actions?: React.ReactNode;
  context?: React.ReactNode;
  history?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const titleId = React.useId();
  return <article aria-labelledby={titleId} className={cn("min-w-0 space-y-5", className)}>
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        {eyebrow && <PageEyebrow className="mb-2">{eyebrow}</PageEyebrow>}
        <PageTitle id={titleId}>{title}</PageTitle>
        {description && <div className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</div>}
        {identity && <div className="mt-3 text-xs text-muted-foreground">{identity}</div>}
      </div>
      {status && <div className="shrink-0">{status}</div>}
    </header>
    {actions && <section aria-label="Available next actions" className="border border-border bg-card p-4">{actions}</section>}
    <div className={cn("grid min-w-0 items-start gap-5", context ? "xl:grid-cols-[15rem_minmax(0,1fr)_16rem]" : "xl:grid-cols-[15rem_minmax(0,1fr)]")}>
      <WorkflowProgress steps={steps} />
      <section aria-label="Current workflow step" className="min-w-0 border border-border bg-card p-5">{details}</section>
      {context && <aside aria-label="Workflow guidance and evidence" className="min-w-0 space-y-4">{context}</aside>}
    </div>
    {history && <section aria-label="Workflow history" className="min-w-0 border border-border bg-card p-5">{history}</section>}
    {footer && <footer className="border-t border-border pt-4">{footer}</footer>}
  </article>;
}
