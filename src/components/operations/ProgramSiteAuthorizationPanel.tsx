import { useCallback, useEffect, useState } from "react";
import {
  getHostProgramSiteAuthorizationFn, requestProgramSiteAuthorizationFn,
  revokeProgramSiteAuthorizationFn,
} from "@/modules/programs/program-site-authorization.functions";
import { operatingServices, type OperatingService } from "@/domain/program-site-operating-policy";

type Status = Awaited<ReturnType<typeof getHostProgramSiteAuthorizationFn>>;
const defaults: OperatingService[] = [
  "academic_instruction", "onsite_supervision", "school_of_record", "credit_issuance",
];

/** This only requests an agreement. School opening and CAN staff grants remain separate. */
export function ProgramSiteAuthorizationPanel({programId}:{programId:string}) {
  const [status,setStatus] = useState<Status|null>(null);
  const [selected,setSelected] = useState<OperatingService[]>(defaults);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [revokeReason,setRevokeReason] = useState("");
  const load = useCallback(async () => {
    const result = await getHostProgramSiteAuthorizationFn({data:{programId}});
    setStatus(result);
  },[programId]);
  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:"Unable to load agreement status"));},[load]);
  async function request() {
    setBusy(true);setError("");setNotice("");
    try {
      await requestProgramSiteAuthorizationFn({data:{programId,services:selected}});
      await load();setNotice("Request recorded for independent CAN institutional review.");
    } catch(e){setError(e instanceof Error?e.message:"Request failed");}
    finally{setBusy(false);}
  }
  async function revoke() {
    if(!status?.authorization) return;
    setBusy(true);setError("");setNotice("");
    try {
      await revokeProgramSiteAuthorizationFn({data:{
        authorizationId:status.authorization.id,reason:revokeReason,
      }});
      await load();setNotice("Operating authorization revoked; new delegated activity is blocked.");
    }catch(e){setError(e instanceof Error?e.message:"Revocation failed");}
    finally{setBusy(false);}
  }
  if(status && !status.eligible) return null;
  return <section className="mt-7 rounded-xl border bg-card p-5" aria-label="CAN church institutional authorization">
    <h2 className="font-serif text-2xl">CAN–church operating agreement</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      A church-owned Site can request separately authorized CAN academic services without
      transferring church ownership. The contract, individual staff grants, school opening
      and safeguarding approvals are independent checks.
    </p>
    {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
    {!status?<p className="mt-3 text-sm">Checking institutional authorization…</p>:
    status.authorization?<div className="mt-3 text-sm">
      <p><strong>Request v{status.authorization.version}:</strong> {status.authorization.status}</p>
      <p className="mt-1 text-xs">Services: {status.authorization.services.join(", ")}</p>
      {status.authorization.effectiveThrough&&<p className="mt-1 text-xs">
        Term ends: {new Date(status.authorization.effectiveThrough).toLocaleDateString()}
      </p>}
      {status.authorization.reviewReason&&<p className="mt-2 text-xs">
        Institutional review: {status.authorization.reviewReason}
      </p>}
      {status.authorization.status==="approved"&&<form onSubmit={e=>{e.preventDefault();void revoke();}} className="mt-3 space-y-2">
        <label className="block text-xs">Reason for withdrawing church-hosted authority
          <input className="mt-1 w-full rounded border bg-background p-2" value={revokeReason}
            onChange={e=>setRevokeReason(e.target.value)} minLength={10} maxLength={500} required/>
        </label>
        <button type="submit" disabled={busy||revokeReason.trim().length<10}
          className="rounded border px-3 py-2 text-xs disabled:opacity-50">Revoke authorization</button>
      </form>}
      {(status.authorization.status==="denied"||status.authorization.status==="revoked")&&
        <button type="button" disabled={busy} onClick={()=>void request()}
          className="mt-3 rounded border px-3 py-2 text-xs">Request new agreement version</button>}
    </div>:
    <div className="mt-3">
      <p className="text-sm font-semibold">Request service scope</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {operatingServices.map(service=><label key={service} className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={selected.includes(service)} onChange={e=>setSelected(v=>
            e.target.checked?[...v,service]:v.filter(x=>x!==service))}/>
          {service.replace(/_/g," ")}
        </label>)}
      </div>
      <button type="button" disabled={busy||!selected.length} onClick={()=>void request()}
        className="mt-3 rounded border px-4 py-2 text-sm disabled:opacity-50">
        {busy?"Requesting…":"Request CAN operating authorization"}
      </button>
      <p className="mt-2 text-xs text-muted-foreground">
        Requests do not activate your school or authorize staff to serve students.
      </p>
    </div>}
  </section>;
}
