import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useMutationFeedback, mutationErrorMessage } from "@/lib/mutation-feedback";
import { MutationFeedback, QueryState } from "@/components/workspace";
import { OnsiteRoomPlanningPanel } from "@/components/operations/OnsiteRoomPlanningPanel";
import { OperatingAgreementEvidencePicker } from "./OperatingAgreementEvidencePicker";
import { useCallback, useEffect, useState } from "react";
import { CANAcademicStaffDelegationPanel } from "./CANAcademicStaffDelegationPanel";
import { SchoolOpeningReviewPanel } from "@/components/operations/SchoolOpeningReviewPanel";
import { SchoolOpeningEvidencePanel } from "@/components/operations/SchoolOpeningEvidencePanel";
import {
  listCANOperatingAuthorizationDeskFn, reviewProgramSiteAuthorizationFn,
  revokeProgramSiteAuthorizationFn, suspendProgramSiteAuthorizationFn,
  resumeProgramSiteAuthorizationFn, renewProgramSiteAuthorizationFn,
} from "@/modules/programs/program-site-authorization.functions";

type Desk=Awaited<ReturnType<typeof listCANOperatingAuthorizationDeskFn>>;
export function CANOperatingAuthorizationDesk() {
  const [desk,setDesk]=useState<Desk|null>(null);
  const [inputs,setInputs]=useState<Record<string,{evidence:string;from:string;through:string;reason:string}>>({});
  const [staffProgramId,setStaffProgramId]=useState("");
  const [error,setError]=useState("");
  const load=useCallback(async()=>{setDesk(await listCANOperatingAuthorizationDeskFn());setError("");},[]);
  const feedback=useMutationFeedback(load);
  const busy=feedback.pending||feedback.refreshFailed;
  useEffect(()=>{void load().catch(e=>setError(mutationErrorMessage(e, "Unable to load operating authorizations")));},[load]);
  const update=(id:string,key:"evidence"|"from"|"through"|"reason",value:string)=>
    setInputs(rows=>({...rows,[id]:{evidence:"",from:"",through:"",reason:"",...rows[id],[key]:value,...(key==="through"?{evidence:""}:{})}}));
  async function decide(id:string,decision:"approved"|"denied"|"revoked"|"suspended"|"resumed"|"renewed") {
    const value=inputs[id]??{evidence:"",from:"",through:"",reason:""};
    if(busy)return;
    setError("");
    await feedback.run(async()=>{
      if(decision==="revoked")
        await revokeProgramSiteAuthorizationFn({data:{authorizationId:id,reason:value.reason}});
      else if(decision==="suspended")
        await suspendProgramSiteAuthorizationFn({data:{authorizationId:id,reason:value.reason}});
      else if(decision==="resumed")
        await resumeProgramSiteAuthorizationFn({data:{authorizationId:id,reason:value.reason}});
      else if(decision==="renewed")
        await renewProgramSiteAuthorizationFn({data:{
          authorizationId:id,reason:value.reason,evidenceDocumentId:value.evidence,
          effectiveThrough:new Date(value.through+"T00:00:00Z").toISOString(),
        }});
      else
        await reviewProgramSiteAuthorizationFn({data:{
          authorizationId:id,decision,reason:value.reason,
          ...(decision==="approved"?{
            evidenceDocumentId:value.evidence,
            effectiveFrom:new Date(value.from+"T00:00:00Z").toISOString(),
            effectiveThrough:new Date(value.through+"T00:00:00Z").toISOString(),
          }:{}),
        }});
    },{successMessage:"Independent operating authorization decision recorded.",commandErrorMessage:"Unable to record decision"});
  }
  return <section className="mt-6  border bg-card p-5">
    <h2 className="font-serif text-2xl">CAN–church institutional service agreements</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Only separately verified contracts may authorize CAN services at independently owned churches.
      Agreement approval does not issue user grants, certify child-safety readiness or activate schools.
    </p>
    <MutationFeedback state={feedback} pendingMessage="Recording the independent decision…" className="mt-3"/>
    {!desk?<QueryState loading={!error?"Loading scoped requests…":undefined} error={error||undefined} onRetry={()=>{setError("");void load().catch(e=>setError(mutationErrorMessage(e,"Unable to load operating authorizations")));}}/>:
      desk.authorizations.length===0?<p className="mt-3 text-sm">No church-site requests for this CAN institution.</p>:
      <div className="mt-3 space-y-3">{desk.authorizations.map(item=>{
        const value=inputs[item.id]??{evidence:"",from:"",through:"",reason:""};
        return <article key={item.id} className=" border p-3 text-sm">
          <p className="font-semibold">{item.programName} · {item.hostName}</p>
          <p className="mt-1 text-xs">{item.status} · Version {item.version} · {item.services.join(", ")}</p>
          {item.status==="suspended"&&<p className="mt-1 text-xs" role="status">
            Delegated services are suspended. Review the concern before resuming or revoke the agreement.
            Resumption does not extend the agreement period or replace independent school-opening review.
          </p>}
          {item.status==="suspended"&&item.suspensionReason&&<p className="mt-1 text-xs">
            Suspension reason: {item.suspensionReason}
          </p>}
          {item.effectiveFrom&&<p className="mt-1 text-xs">
            Agreement begins: {new Date(item.effectiveFrom).toLocaleString()}
          </p>}
          {item.effectiveThrough&&<p className="mt-1 text-xs">
            Agreement ends (exclusive): {new Date(item.effectiveThrough).toLocaleString()}
          </p>}
          {item.lapsed&&<p className="mt-1 text-xs" role="status">
            Agreement window elapsed: delegated operations are blocked until renewal under fresh evidence.
            {item.status==="suspended"&&" Resolve the suspension before renewing; resuming alone does not extend the expired term."}
          </p>}
          {(item.status==="requested"||item.status==="approved"||item.status==="suspended")&&<div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(item.status==="requested"||item.status==="approved")&&<>
              <div className="sm:col-span-2">
                <OperatingAgreementEvidencePicker key={item.id} authorizationId={item.id}
                  through={value.through} value={value.evidence} disabled={busy}
                  onChange={id=>update(item.id,"evidence",id)}/>
              </div>
              {item.status==="requested"&&<Label className="text-xs">Effective from
                <Input type="date" className="mt-1" value={value.from}
                  onChange={e=>update(item.id,"from",e.target.value)}/>
              </Label>}
              {item.status==="approved"&&<p className="text-xs sm:col-span-2">
                Renewal requires independently verified evidence covering the extended period.
                It does not renew school-opening authorization or change staff grants.
              </p>}
              <Label className="text-xs">Effective through (exclusive)
                <Input type="date" className="mt-1" value={value.through}
                  onChange={e=>update(item.id,"through",e.target.value)}/>
              </Label>
            </>}
            <Label className="text-xs sm:col-span-2">Decision reason
              <Input className="mt-1" minLength={10} maxLength={500}
                value={value.reason} onChange={e=>update(item.id,"reason",e.target.value)}/>
            </Label>
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              {item.status==="requested"&&<>
                <Button variant="outline" size="sm" type="button" disabled={busy||value.reason.trim().length<10||!value.evidence||!value.from||!value.through}
                  onClick={()=>void decide(item.id,"approved")}>Approve verified agreement</Button>
                <Button variant="outline" size="sm" type="button" disabled={busy||value.reason.trim().length<10}
                  onClick={()=>void decide(item.id,"denied")}>Deny request</Button>
              </>}
              {item.status==="approved"&&<Button variant="outline" size="sm" type="button"
                disabled={busy||value.reason.trim().length<10||!value.evidence||!value.through}
                onClick={()=>void decide(item.id,"renewed")}>Renew verified agreement</Button>}
              {item.status==="approved"&&<Button variant="outline" size="sm" type="button" disabled={busy||value.reason.trim().length<10}
                onClick={()=>void decide(item.id,"suspended")}>Suspend agreement</Button>}
              {item.status==="suspended"&&<Button variant="outline" size="sm" type="button" disabled={busy||value.reason.trim().length<10}
                onClick={()=>void decide(item.id,"resumed")}>Resume agreement</Button>}
              {(item.status==="approved"||item.status==="suspended")&&<Button variant="outline" size="sm" type="button" disabled={busy||value.reason.trim().length<10}
                onClick={()=>void decide(item.id,"revoked")}>Revoke agreement</Button>}
            </div>
          </div>}
        </article>;
      })}</div>}
    {desk&&<div className="mt-6 border-t pt-5">
      <h3 className="font-serif text-xl">Delegate CAN academic staff to one church Program</h3>
      <p className="mt-2 text-xs text-muted-foreground">
        A signed school-services agreement is not a login grant. Select an
        approved Program to authorize an already verified CAN teacher or
        academic registrar. Staff remain CAN employees and gain only the named
        Program and their specifically assigned classes.
      </p>
      <Label className="mt-3 block text-sm">Church school
        <Select className="mt-1"
          value={staffProgramId} onChange={e=>setStaffProgramId(e.target.value)}>
          <option value="">Choose approved CAN–church Program…</option>
          {desk.authorizations.filter(item=>item.status==="approved")
            .map(item=><option key={item.id} value={item.programId}>
              {item.programName} · {item.hostName}
            </option>)}
        </Select>
      </Label>
      {staffProgramId&&<>
        <SchoolOpeningEvidencePanel key={"evidence:"+staffProgramId} programId={staffProgramId}/>
        <SchoolOpeningReviewPanel key={"opening:"+staffProgramId} programId={staffProgramId}/>
        <OnsiteRoomPlanningPanel key={"rooms:"+staffProgramId} programId={staffProgramId}/>
        <CANAcademicStaffDelegationPanel key={staffProgramId} programId={staffProgramId}/>
      </>}
    </div>}
  </section>;
}
