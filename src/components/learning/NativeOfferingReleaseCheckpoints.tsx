import { StatusBadge, type StatusTone } from "@/components/workspace";
import {
  projectNativeReleaseCheckpoints,
  type NativeReleaseCheckpointInput,
  type ReleaseCheckpointStatus,
} from "@/domain/native-offering-release-checkpoints";

const appearance:Record<ReleaseCheckpointStatus,{
  tone:StatusTone;label:string;
}>={
  recorded:{tone:"success",label:"Recorded"},
  action_required:{tone:"attention",label:"Needs action"},
  pending:{tone:"neutral",label:"Pending"},
  unverified:{tone:"info",label:"Not visible"},
};

/** Shared v6.1 read-only evidence progression for publisher and reviewer.
 * Never maps statuses into publication authorization or local adoption. */
export function NativeOfferingReleaseCheckpoints({
  state,
}:{
  state:NativeReleaseCheckpointInput;
}){
  const checkpoints=projectNativeReleaseCheckpoints(state);
  const recorded=checkpoints.filter(step=>step.status==="recorded").length;
  return <section aria-label="Native Course and Offering release checkpoints"
    className="mt-4 border border-border bg-background p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h4 className="text-sm font-semibold">Publication checkpoints</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Observed publisher records, not a publishing authorization.
        </p>
      </div>
      <span className="text-xs font-medium tabular-nums text-muted-foreground">
        {recorded} of {checkpoints.length} recorded
      </span>
    </div>
    <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {checkpoints.map((step,index)=><li key={step.key}
        className="min-w-0 border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {String(index+1).padStart(2,"0")}
          </span>
          <StatusBadge tone={appearance[step.status].tone}>
            {appearance[step.status].label}
          </StatusBadge>
        </div>
        <h5 className="mt-2 text-sm font-semibold">{step.label}</h5>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
      </li>)}
    </ol>
    <p className="mt-3 text-xs text-muted-foreground">
      Approval, distribution rights, authorized local adoption and Class enrollment
      are verified by their separate server-side commands. This checklist is read-only.
    </p>
  </section>;
}
