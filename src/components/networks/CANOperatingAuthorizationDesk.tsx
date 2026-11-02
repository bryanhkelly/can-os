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
  const [busy,setBusy]=useState(false);
  const [staffProgramId,setStaffProgramId]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const load=useCallback(async()=>{setDesk(await listCANOperatingAuthorizationDeskFn());},[]);
  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:"Unable to load operating authorizations"));},[load]);
  const update=(id:string,key:"evidence"|"from"|"through"|"reason",value:string)=>
    setInputs(rows=>({...rows,[id]:{evidence:"",from:"",through:"",reason:"",...rows[id],[key]:value,...(key==="through"?{evidence:""}:{})}}));
  async function decide(id:string,decision:"approved"|"denied"|"revoked"|"suspended"|"resumed"|"renewed") {
    const value=inputs[id]??{evidence:"",from:"",through:"",reason:""};
    setBusy(true);setNotice("");setError("");
    try {
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
      await load();setNotice("Independent operating authorization decision recorded.");
    }catch(e){setError(e instanceof Error?e.message:"Unable to record decision");}
    finally{setBusy(false);}
  }
  return <section className="mt-6 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">CAN–church institutional service agreements</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Only separately verified contracts may authorize CAN services at independently owned churches.
      Agreement approval does not issue user grants, certify child-safety readiness or activate schools.
    </p>
    {error&&<p className="mt-3 text-sm" role="alert">{error}</p>}
    {notice&&<p className="mt-3 text-sm" role="status">{notice}</p>}
    {!desk?<p className="mt-3 text-sm">Loading scoped requests…</p>:
      desk.authorizations.length===0?<p className="mt-3 text-sm">No church-site requests for this CAN institution.</p>:
      <div className="mt-3 space-y-3">{desk.authorizations.map(item=>{
        const value=inputs[item.id]??{evidence:"",from:"",through:"",reason:""};
        return <article key={item.id} className="rounded-lg border p-3 text-sm">
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
              {item.status==="requested"&&<label className="text-xs">Effective from
                <input type="date" className="mt-1 w-full rounded border bg-background p-2" value={value.from}
                  onChange={e=>update(item.id,"from",e.target.value)}/>
              </label>}
              {item.status==="approved"&&<p className="text-xs sm:col-span-2">
                Renewal requires independently verified evidence covering the extended period.
                It does not renew school-opening authorization or change staff grants.
              </p>}
              <label className="text-xs">Effective through (exclusive)
                <input type="date" className="mt-1 w-full rounded border bg-background p-2" value={value.through}
                  onChange={e=>update(item.id,"through",e.target.value)}/>
              </label>
            </>}
            <label className="text-xs sm:col-span-2">Decision reason
              <input className="mt-1 w-full rounded border bg-background p-2" minLength={10} maxLength={500}
                value={value.reason} onChange={e=>update(item.id,"reason",e.target.value)}/>
            </label>
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              {item.status==="requested"&&<>
                <button type="button" disabled={busy||value.reason.trim().length<10||!value.evidence||!value.from||!value.through}
                  onClick={()=>void decide(item.id,"approved")} className="rounded border px-3 py-2 text-xs disabled:opacity-50">Approve verified agreement</button>
                <button type="button" disabled={busy||value.reason.trim().length<10}
                  onClick={()=>void decide(item.id,"denied")} className="rounded border px-3 py-2 text-xs disabled:opacity-50">Deny request</button>
              </>}
              {item.status==="approved"&&<button type="button"
                disabled={busy||value.reason.trim().length<10||!value.evidence||!value.through}
                onClick={()=>void decide(item.id,"renewed")} className="rounded border px-3 py-2 text-xs disabled:opacity-50">Renew verified agreement</button>}
              {item.status==="approved"&&<button type="button" disabled={busy||value.reason.trim().length<10}
                onClick={()=>void decide(item.id,"suspended")} className="rounded border px-3 py-2 text-xs disabled:opacity-50">Suspend agreement</button>}
              {item.status==="suspended"&&<button type="button" disabled={busy||value.reason.trim().length<10}
                onClick={()=>void decide(item.id,"resumed")} className="rounded border px-3 py-2 text-xs disabled:opacity-50">Resume agreement</button>}
              {(item.status==="approved"||item.status==="suspended")&&<button type="button" disabled={busy||value.reason.trim().length<10}
                onClick={()=>void decide(item.id,"revoked")} className="rounded border px-3 py-2 text-xs disabled:opacity-50">Revoke agreement</button>}
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
      <label className="mt-3 block text-sm">Church school
        <select className="mt-1 w-full rounded border bg-background p-2"
          value={staffProgramId} onChange={e=>setStaffProgramId(e.target.value)}>
          <option value="">Choose approved CAN–church Program…</option>
          {desk.authorizations.filter(item=>item.status==="approved")
            .map(item=><option key={item.id} value={item.programId}>
              {item.programName} · {item.hostName}
            </option>)}
        </select>
      </label>
      {staffProgramId&&<>
        <SchoolOpeningEvidencePanel key={"evidence:"+staffProgramId} programId={staffProgramId}/>
        <SchoolOpeningReviewPanel key={"opening:"+staffProgramId} programId={staffProgramId}/>
        <OnsiteRoomPlanningPanel key={"rooms:"+staffProgramId} programId={staffProgramId}/>
        <CANAcademicStaffDelegationPanel key={staffProgramId} programId={staffProgramId}/>
      </>}
    </div>}
  </section>;
}
