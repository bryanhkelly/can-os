import { useEffect, useState } from "react";
import { getOnsiteSupervisionPlan } from "@/modules/operations/onsite-supervision.functions";

type Plan = Awaited<ReturnType<typeof getOnsiteSupervisionPlan>>;

const labels: Record<string,string> = {
  schedule_missing:"Instructional block has no valid scheduled time",
  facilitator_missing:"No named facilitator in the active delivery arrangement",
  staff_grant_missing:"Assigned adult lacks a verified active site-staff grant",
  facilitator_conflict:"Facilitator is assigned to overlapping instructional blocks",
  room_unconfigured:"Physical room / duty location is not recorded in CAN OS",
};

/** Read-only staffing plan. This is NOT a live duty check-in or room sign-off. */
export function OnsiteSupervisionPanel({ date }: { date:string }) {
  const [plan,setPlan]=useState<Plan|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [nonce,setNonce]=useState(0);
  useEffect(()=>{
    if (!date) return;
    let active=true;
    void getOnsiteSupervisionPlan({data:{date}}).then(result=>{
      if (!active) return;
      setPlan(result);setError("");setLoading(false);
    }).catch(()=>{
      if (!active) return;
      setPlan(null);setLoading(false);
      setError("Supervision planning is unavailable. Verify assignments with your site leader.");
    });
    return ()=>{active=false};
  },[date,nonce]);
  return <section className="mt-10" aria-label="Planned onsite supervision">
    <h2 className="font-serif text-2xl">Instructional supervision plan</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Planned section times and assigned adults from the existing school schedule.
      An assigned facilitator is not confirmation of onsite arrival, actual room supervision,
      student custody, or an approved handoff.
    </p>
    {loading&&<p role="status" className="mt-3 text-sm">Loading planned staff coverage…</p>}
    {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
    {!loading&&<button type="button" className="mt-3 text-sm underline"
      onClick={()=>{setLoading(true);setError("");setNonce(n=>n+1)}}>
      Refresh supervision plan
    </button>}
    {plan&&<>
      {plan.projectionTruncated&&<p role="alert" className="mt-3 rounded border p-3 text-sm">
        Coverage listing was capped. These counts are incomplete; do not use this plan to certify site staffing.
      </p>}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded border p-3">Planned facilitator assignments
          <strong className="mt-1 block text-2xl">{plan.plannedAssignments}</strong>
        </div>
        <div className="rounded border p-3">Missing / conflicting assignments
          <strong className="mt-1 block text-2xl">{plan.unassignedOrConflicting}</strong>
        </div>
      </div>
      {!plan.blocks.length&&<p className="mt-3 text-sm">
        No active instructional sections were found for this site and date.
        Verify the academic calendar and instructional schedules before treating the site as unstaffed.
      </p>}
      <ul className="mt-4 grid gap-3">
        {plan.blocks.slice(0,60).map((block,index)=><li
          key={block.sectionId+":"+(block.periodId??"missing")+":"+index}
          className="rounded-lg border p-3">
          <p className="font-semibold">{block.sectionTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {block.programName} · {block.periodLabel??"Schedule missing"} ·
            {" "}{block.startsAtLocal??"—"}–{block.endsAtLocal??"—"} (site-local)
          </p>
          <p className="mt-2 text-sm">
            {block.facilitatorName && block.verifiedSiteStaffGrant
              ? "Assigned facilitator: "+block.facilitatorName
              : "Facilitator assignment not verified"}
          </p>
          <p className="mt-1 text-xs">
            {block.assignedPlan?"Staff assignment planned; onsite check-in not verified":"Needs staff assignment review"}
          </p>
          {block.gaps.length>0&&<ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
            {block.gaps.map(gap=><li key={gap}>{labels[gap]??gap}</li>)}
          </ul>}
        </li>)}
      </ul>
      {plan.blocks.length>60&&<p className="mt-3 text-sm">
        Showing 60 of {plan.blocks.length} instructional blocks. Use school staffing administration for the complete plan.
      </p>}
      <p className="mt-3 text-xs text-muted-foreground">{plan.note}</p>
    </>}
  </section>;
}
