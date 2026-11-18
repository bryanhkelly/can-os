import { Link } from "@tanstack/react-router";
import { WorkspacePanel, StatusBadge } from "@/components/workspace";
import { projectClassLaunchReadiness, type ClassLaunchReadState } from
  "@/domain/native-class-launch-readiness";

const tone={
  checking:"neutral",
  unavailable:"danger",
  action_required:"attention",
  visible:"success",
} as const;
const statusLabel={
  checking:"Checking",
  unavailable:"Cannot verify",
  action_required:"Needs action",
  visible:"Record visible",
} as const;

/** A read-only, authenticated operator guide, not a second release gate.
 * Use original services and keep policy/approval decisions in their owners. */
export function NativeClassLaunchReadiness({state}:{state:ClassLaunchReadState}){
  const steps=projectClassLaunchReadiness(state);
  return <WorkspacePanel title="Class launch readiness"
    description="Follow the authoritative approvals before creating a Class, opening registration or holding a Session.">
    <ol aria-label="Class launch prerequisites" className="grid gap-3 lg:grid-cols-3">
      {steps.map((step,index)=><li key={step.key}
        className="border border-border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Step {index+1}
          </span>
          <StatusBadge tone={tone[step.status]}>{statusLabel[step.status]}</StatusBadge>
        </div>
        <h3 className="mt-3 text-sm font-semibold">{step.label}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.detail}</p>
      </li>)}
    </ol>
    {steps.some(step=>step.status!=="visible")&&<div className="mt-4 space-y-2">
      <p className="text-sm font-semibold">Resolve prerequisites through existing workspaces</p>
      <div className="flex flex-wrap gap-4 text-sm">
        <Link to="/class" search={{view:"content"}} className="font-semibold underline underline-offset-4">
          Native Course drafts (authorized creator)
        </Link>
        <Link to="/class" search={{view:"reviews"}} className="font-semibold underline underline-offset-4">
          Publisher release review (independently appointed reviewer)
        </Link>
        <Link to="/canonical/program-operations" className="font-semibold underline underline-offset-4">
          Program Operations and adoption inspection (staging)
        </Link>
        <Link to="/canonical/blueprints" className="font-semibold underline underline-offset-4">
          Local adoption review (independently appointed Blueprint reviewer)
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        These links do not grant publication, Site approval, learner consent or Session authority.
        A missing record is not automatically evidence of a failed global catalog.
      </p>
    </div>}
  </WorkspacePanel>;
}
