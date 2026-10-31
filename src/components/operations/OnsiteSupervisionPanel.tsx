import { OnsiteRoomPlanningPanel } from "./OnsiteRoomPlanningPanel";
import { useEffect, useState } from "react";
import { Qualifications } from "@/components/profiles/Qualifications";
import { getOnsiteSupervisionPlan } from "@/modules/operations/onsite-supervision.functions";
import {
  getOnsiteDutyResponses, respondToOnsiteDuty,
} from "@/modules/operations/onsite-duty-response.functions";
import {
  getOnsitePhysicalPresence,reportOnsitePhysicalPresence,witnessOnsiteBlockPresence,
} from "@/modules/operations/onsite-physical-presence.functions";

type Plan = Awaited<ReturnType<typeof getOnsiteSupervisionPlan>>;
type Responses = Awaited<ReturnType<typeof getOnsiteDutyResponses>>;
type Presence = Awaited<ReturnType<typeof getOnsitePhysicalPresence>>;

const labels: Record<string,string> = {
  schedule_missing:"Instructional block has no valid scheduled time",
  calendar_unverified:"No verified instructional day on the current academic calendar; duty response unavailable",
  facilitator_missing:"No named facilitator in the active delivery arrangement",
  staff_grant_missing:"Assigned adult lacks a verified active Site staff grant",
  section_delegation_missing:"Assigned adult lacks a current, time-valid appointment to this exact Section",
  operating_agreement_missing:"CAN–church onsite supervision agreement is not currently authorized",
  facilitator_conflict:"Facilitator is assigned to overlapping instructional blocks",
  room_unconfigured:"No current independently reviewed room/coverage document for this exact block",
  room_capacity_unverified:"Room occupancy limit is missing or exceeded by the active Section roster",
  room_schedule_conflict:"Two overlapping instructional blocks claim the same reviewed room",
  child_safety_screening_missing:"No independently verified, unexpired child-safety screening covering the entire block",
  safeguarding_training_missing:"No independently verified, unexpired safeguarding training covering the entire block",
  qualified_backup_missing:"No separately named backup with current staff appointment, screening and safeguarding training for this block",
};

/** Read-only staffing plan. This is NOT a live duty check-in or room sign-off. */
export function OnsiteSupervisionPanel({ date }: { date:string }) {
  const [plan,setPlan]=useState<Plan|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [responses,setResponses]=useState<Responses|null>(null);
  const [presence,setPresence]=useState<Presence|null>(null);
  const [presenceBusy,setPresenceBusy]=useState("");
  const [dutyBusy,setDutyBusy]=useState("");
  const [dutyMessage,setDutyMessage]=useState("");
  const [nonce,setNonce]=useState(0);
  useEffect(()=>{
    if (!date) return;
    let active=true;
    setLoading(true);setPlan(null);setResponses(null);setPresence(null);setError("");setDutyMessage("");
    void Promise.all([
      getOnsiteSupervisionPlan({data:{date}}),
      getOnsiteDutyResponses({data:{date}}),
      getOnsitePhysicalPresence({data:{date}}),
    ]).then(([result,duties,onsite])=>{
      if (!active) return;
      setPlan(result);setResponses(duties);setPresence(onsite);setError("");setLoading(false);
    }).catch(()=>{
      if (!active) return;
      setPlan(null);setResponses(null);setPresence(null);setLoading(false);
      setError("Staffing coverage or duty responses are unavailable. No confirmed coverage is assumed.");
    });
    return ()=>{active=false};
  },[date,nonce]);
  async function answerDuty(sectionId:string,periodId:string,response:"accepted"|"cannot_cover") {
    if(dutyBusy)return;
    setDutyBusy(sectionId+":"+periodId);setDutyMessage("");setError("");
    try{
      await respondToOnsiteDuty({data:{
        date,sectionId,periodId,response,
        ...(response==="cannot_cover"?{reason:"unavailable" as const}:{}),
        confirmed:true as const,
      }});
      setDutyMessage(response==="accepted"
        ?"Your availability response was saved. This is not a supervision or student handoff certification."
        :"Coverage exception recorded. Contact the site leader directly to arrange supervision.");
      const next=await getOnsiteDutyResponses({data:{date}});
      setResponses(next);
    }catch{
      setError("Duty response could not be saved. Refresh your assignment and contact the site leader.");
    }finally{setDutyBusy("")}
  }
  async function recordPresence(sectionId:string,periodId:string,action:"report"|"witness"){
    if(presenceBusy)return;
    setPresenceBusy(sectionId+":"+periodId);setError("");setDutyMessage("");
    try{
      if(action==="report")await reportOnsitePhysicalPresence({data:{
        date,sectionId,periodId,physicallyPresent:true,
      }});
      else await witnessOnsiteBlockPresence({data:{
        date,sectionId,periodId,witnessedBothAdults:true,
      }});
      setPresence(await getOnsitePhysicalPresence({data:{date}}));
      setDutyMessage(action==="report"
        ?"Your physical arrival was recorded. The Site director must independently witness both adults."
        :"Independent Site director witness recorded. This does not confirm student custody or ongoing coverage.");
    }catch(e){setError(e instanceof Error?e.message:"Unable to record physical presence");}
    finally{setPresenceBusy("");}
  }
  return <section id="supervision" className="mt-10" aria-label="Planned onsite supervision">
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
    {dutyMessage&&<p role="status" className="mt-3 text-sm">{dutyMessage}</p>}
    {plan&&<>
      {responses&&<p className="mt-3 text-sm">
        {responses.unacknowledged} planned blocks not responded to ·
        {" "}{responses.coverageExceptions} staffing exceptions.
        A response is not verified physical presence or a completed handoff.
      </p>}
      {presence&&<p className="mt-2 text-sm">
        Independently witnessed primary + backup blocks: {
          presence.blocks.filter(row=>row.witnessedBothAdults).length
        } of {presence.blocks.length}. Planning and human witness evidence
        are separate from student custody and full-day supervision.
      </p>}
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
        {plan.blocks.slice(0,60).map((block,index)=>{
          const duty=responses?.statuses.find(row=>row.sectionId===block.sectionId&&
            row.periodId===block.periodId);
          const onsite=presence?.blocks.find(row=>row.sectionId===block.sectionId &&
            row.periodId===block.periodId);
          return <li
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
          <p className="mt-1 text-sm">Named backup: {block.backupFacilitatorName??"Not currently verified"}</p>
          {block.roomLabel&&block.roomPlanVerified&&
            <p className="mt-1 text-xs">Reviewed planned room: {block.roomLabel}.
              This is not an inspection or physical check-in.</p>}
          <p className="mt-1 text-xs">
            {block.assignedPlan?"Staff assignment planned; onsite check-in not verified":"Needs staff assignment review"}
          </p>
          {block.gaps.length>0&&<ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
            {block.gaps.map(gap=><li key={gap}>{labels[gap]??gap}</li>)}
          </ul>}
          {onsite&&<p className="mt-2 text-xs" role="status">
            Institutionally authorized opening: {onsite.openingAuthorized?"Yes":"No"}.
            {" "}Required duties accepted: {onsite.dutiesAccepted?"Yes":"No"}.
            {" "}Your arrival: {onsite.ownPresenceReported?"Reported":"Not reported"}.
            {" "}Independent witness of both adults: {onsite.witnessedBothAdults?"Recorded":"Not recorded"}.
          </p>}
          {onsite&&block.periodId&&
            (onsite.canReport&&!onsite.ownPresenceReported ||
             onsite.canWitness&&!onsite.witnessedBothAdults)&&
            <div className="mt-2 flex flex-wrap gap-2">
              {onsite.canReport&&!onsite.ownPresenceReported&&<button type="button"
                disabled={!!presenceBusy}
                onClick={()=>void recordPresence(block.sectionId,block.periodId!,"report")}
                className="rounded border px-3 py-2 text-xs disabled:opacity-50">
                I am physically present in this room
              </button>}
              {onsite.canWitness&&!onsite.witnessedBothAdults&&<button type="button"
                disabled={!!presenceBusy}
                onClick={()=>void recordPresence(block.sectionId,block.periodId!,"witness")}
                className="rounded border px-3 py-2 text-xs disabled:opacity-50">
                I personally witnessed both named adults here
              </button>}
            </div>}
          {duty&&<p className="mt-2 text-xs font-semibold" role="status">
            Duty response: {duty.status==="accepted"?"All required named adults report availability":
              duty.status==="cannot_cover"?"Coverage gap reported":
              duty.status==="stale_after_delegation"?"Previous acceptance is stale: named delegation or operating agreement is no longer effective":
              "Awaiting required named adult responses"}
          </p>}
          {duty?.canRespond&&<p className="mt-1 text-xs">Your {block.ownDutyRole??"assigned"} duty response: {duty.ownStatus.replaceAll("_"," ")}</p>}
          {duty?.canRespond&&duty.ownStatus==="not_reported"&&block.periodId&&<>
            <div className="mt-3 flex flex-wrap gap-2">
              {duty.canAccept&&<button type="button" disabled={!!dutyBusy}
                onClick={()=>void answerDuty(block.sectionId,block.periodId!,"accepted")}
                className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50">
                I can cover this scheduled block
              </button>}
              <button type="button" disabled={!!dutyBusy}
                onClick={()=>void answerDuty(block.sectionId,block.periodId!,"cannot_cover")}
                className="rounded border px-3 py-2 text-xs disabled:opacity-50">
                I cannot cover this block
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              For coverage gaps, contact your site leader directly. The app does not arrange a substitute.
            </p>
          </>}
        </li>})}
      </ul>
      {plan.blocks.length>60&&<p className="mt-3 text-sm">
        Showing 60 of {plan.blocks.length} instructional blocks. Use school staffing administration for the complete plan.
      </p>}
      {plan.canPlanRooms&&[...new Map(plan.blocks.filter(block=>block.requiresSectionDelegation).map(block=>[block.programId,block])).values()]
        .map(block=><OnsiteRoomPlanningPanel key={block.programId} programId={block.programId} initialDate={date}
          onChanged={()=>setNonce(value=>value+1)}/>)}
      <p className="mt-3 text-xs text-muted-foreground">{plan.note}</p>
      <details className="mt-5 rounded border p-3">
        <summary className="cursor-pointer font-semibold text-sm">My required safety-screening and safeguarding-training evidence</summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Verified site staff may upload their own supporting documents to the
          existing private qualification workflow. A separate authorized reviewer
          must approve each claim. Uploaded documents do not automatically establish
          legal clearance or authorizations to supervise students.
        </p>
        <Qualifications/>
      </details>
    </>}
  </section>;
}
