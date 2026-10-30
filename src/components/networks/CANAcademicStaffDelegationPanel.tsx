import { useCallback, useEffect, useState } from "react";
import {
  delegateCANAcademicProgramStaffFn,
  listCANAcademicProgramStaffFn,
  revokeCANAcademicProgramStaffFn,
} from "@/modules/programs/can-academic-staff-delegation.functions";

type Desk=Awaited<ReturnType<typeof listCANAcademicProgramStaffFn>>;

export function CANAcademicStaffDelegationPanel({programId}:{programId:string}) {
  const [desk,setDesk]=useState<Desk|null>(null);
  const [selected,setSelected]=useState("");
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const load=useCallback(async()=>{
    setDesk(await listCANAcademicProgramStaffFn({data:{programId}}));
  },[programId]);
  useEffect(()=>{void load().catch(e=>setError(
    e instanceof Error?e.message:"Unable to load verified CAN staff"
  ));},[load]);
  const grant=async(event:React.FormEvent)=>{
    event.preventDefault();
    const person=desk?.candidates.find(c=>c.personId+":"+c.role===selected);
    if(!person)return;
    setBusy(true);setError("");setNotice("");
    try{
      const result=await delegateCANAcademicProgramStaffFn({data:{
        programId,personId:person.personId,role:person.role as "teacher"|"registrar",
        reason,
      }});
      await load();
      setNotice(result.created?"Scoped CAN academic staff grant recorded.":"The same scoped staff grant already exists.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to delegate CAN staff");}
    finally{setBusy(false);}
  };
  const revoke=async(roleAssignmentId:string)=>{
    setBusy(true);setNotice("");setError("");
    try{
      await revokeCANAcademicProgramStaffFn({data:{roleAssignmentId,reason}});
      await load();setNotice("Scoped CAN academic staff grant revoked.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to revoke staff");}
    finally{setBusy(false);}
  };
  const field="mt-1 block w-full rounded border bg-background p-2 text-sm";
  return <div className="mt-3 space-y-3 rounded-lg border p-4 text-sm">
    <p className="text-muted-foreground">Grant only to an already verified CAN staff account.
      Teacher grants permit subsequent Section assignment, not immediate student access.
      Registrar grants allow official records only for this contracted Program.
      Neither creates a church account grant or overrides the academic-services agreement.</p>
    {error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {!desk?<p>Loading authorized CAN personnel…</p>:<>
      <form onSubmit={e=>void grant(e)} className="grid gap-2">
        <label>Existing verified CAN employee
          <select className={field} required value={selected}
            onChange={e=>setSelected(e.target.value)}>
            <option value="">Choose teacher or academic registrar…</option>
            {desk.candidates.map(candidate=>
              <option key={candidate.personId+":"+candidate.role}
                value={candidate.personId+":"+candidate.role}>
                {candidate.firstName} {candidate.lastName} · {candidate.role}
              </option>
            )}
          </select>
        </label>
        <label>Internal authorization or revocation reason
          <input className={field} minLength={10} maxLength={500}
            required value={reason} onChange={e=>setReason(e.target.value)}
            placeholder="Explain the exact academic duty"/>
        </label>
        <button type="submit" disabled={busy||!selected||reason.trim().length<10}
          className="rounded border px-3 py-2 disabled:opacity-50">
          Grant exact Program responsibility
        </button>
      </form>
      <div>
        <h3 className="font-semibold">Current delegated CAN staff</h3>
        <ul className="mt-2 space-y-2">
          {desk.current.map(grant=>{
            const person=desk.candidates.find(c=>c.personId===grant.personId);
            return <li key={grant.id} className="flex items-center justify-between gap-2 rounded border p-2">
              <span>{person?person.firstName+" "+person.lastName:"Previously delegated CAN employee"} · {grant.role}</span>
              <button type="button" disabled={busy||reason.trim().length<10}
                onClick={()=>void revoke(grant.id)}
                className="rounded border px-2 py-1 text-xs disabled:opacity-50">
                Revoke
              </button>
            </li>;
          })}
          {!desk.current.length&&<li className="text-muted-foreground">No current delegated CAN academic staff.</li>}
        </ul>
        {desk.truncated&&<p className="mt-2 text-xs">Directory capped; use an administrator to verify complete scope.</p>}
      </div>
    </>}
  </div>;
}
