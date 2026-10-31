import { useState } from "react";
import { applyOneRosterStudentMappings, validateOneRosterCsvBundle } from "@/modules/learning/oneroster-import.functions";

/** Explicit registrar assertion. CAN student ID is selected from verified records, never inferred from CSV. */
export function OneRosterStudentReconciliation({programId}:{programId:string}) {
 const [sourceSystem,setSourceSystem]=useState("");
 const [school,setSchool]=useState("");
 const [orgs,setOrgs]=useState("");
 const [users,setUsers]=useState("");
 const [externalUser,setExternalUser]=useState("");
 const [studentId,setStudentId]=useState("");
 const [validated,setValidated]=useState(false);
 const [approved,setApproved]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const reset=()=>{setValidated(false);setApproved(false);setMessage("");setError("");};
 const bundle={orgs,users};
 async function execute(action:"validate"|"map") {
  setBusy(true);setError("");setMessage("");
  try {
   if(action==="validate"){
    const result=await validateOneRosterCsvBundle({data:{programId,files:bundle}});
    if(!result.report.valid)throw new Error("CSV validation failed. Correct the source before approval.");
    setValidated(true);
    setMessage("Source validated. Confirm the external school, student, and existing CAN student profile.");
   }else{
    const result=await applyOneRosterStudentMappings({data:{
     programId,files:bundle,sourceSystem,externalSchoolSourcedId:school,
     studentMappings:[{sourcedId:externalUser,studentProfileId:studentId}],
    }});
    setApproved(false);
    setMessage(result.added===0?"Existing approved mapping confirmed; no new mapping created.":"Approved student identity mapping recorded. No enrollment was created.");
   }
  }catch(e){setError(e instanceof Error?e.message:"Reconciliation failed.");}
  finally{setBusy(false);}
 }
 const sourceValid=/^[A-Za-z0-9._:-]{2,100}$/.test(sourceSystem);
 const canApprove=validated&&approved&&sourceValid&&school.trim()&&externalUser.trim()&&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentId);
 return <section className="space-y-3 rounded-xl border bg-card p-5" aria-label="Registrar OneRoster student identity reconciliation">
  <h2 className="font-serif text-2xl">Review external student identities</h2>
  <p className="text-sm text-muted-foreground">Registrar-only: reconcile a student in the source school's users.csv to an already verified CAN Student Profile with an active enrollment in this Program. Email and external sourcedId are untrusted. This does not create identities, guardians, Section seats, or grades.</p>
  <label className="block text-sm">External issuer / source system
   <input className="mt-1 block w-full rounded border bg-background p-2" value={sourceSystem} onChange={e=>{setSourceSystem(e.target.value);reset();}} placeholder="district-sis" maxLength={100}/>
  </label>
  <label className="block text-sm">OneRoster orgs.csv
   <textarea className="mt-1 block min-h-24 w-full rounded border bg-background p-2 font-mono text-xs" value={orgs} onChange={e=>{setOrgs(e.target.value);reset();}} maxLength={500000}/>
  </label>
  <label className="block text-sm">OneRoster users.csv
   <textarea className="mt-1 block min-h-24 w-full rounded border bg-background p-2 font-mono text-xs" value={users} onChange={e=>{setUsers(e.target.value);reset();}} maxLength={500000}/>
  </label>
  <button type="button" disabled={busy||!sourceValid||!orgs.trim()||!users.trim()} onClick={()=>void execute("validate")} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Validate source</button>
  {validated&&<div className="space-y-3 rounded border p-3">
   <label className="block text-sm">External school sourcedId
    <input className="mt-1 block w-full rounded border bg-background p-2" value={school} onChange={e=>{setSchool(e.target.value);setApproved(false);}} maxLength={256}/>
   </label>
   <label className="block text-sm">External student sourcedId
    <input className="mt-1 block w-full rounded border bg-background p-2" value={externalUser} onChange={e=>{setExternalUser(e.target.value);setApproved(false);}} maxLength={256}/>
   </label>
   <label className="block text-sm">Existing verified CAN Student Profile UUID
    <input className="mt-1 block w-full rounded border bg-background p-2" value={studentId} onChange={e=>{setStudentId(e.target.value);setApproved(false);}} placeholder="Select an existing approved student record" maxLength={36}/>
   </label>
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>
    <span>I verified this student's canonical CAN identity and active Program enrollment independently of external email or sourcedId, and approve this exact mapping.</span>
   </label>
   <button type="button" disabled={busy||!canApprove} onClick={()=>void execute("map")} className="rounded border px-3 py-2 text-sm font-semibold disabled:opacity-50">Approve student mapping</button>
  </div>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {message&&<p role="status" className="text-sm">{message}</p>}
 </section>;
}
