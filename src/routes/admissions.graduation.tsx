import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { approveGraduationRequirements, listGraduationCandidates, auditIssuedTranscript, decideGraduation, issueDiploma, listGraduationRequirements } from "@/modules/learning/graduation.functions";

export const Route=createFileRoute("/admissions/graduation")({component:GraduationCloseout});

function GraduationCloseout(){
 const [search,setSearch]=useState("");
 const [candidates,setCandidates]=useState<Awaited<ReturnType<typeof listGraduationCandidates>>>([]);
 const [issuerId,setIssuerId]=useState("");
 const [academicYear,setAcademicYear]=useState("");
 const [version,setVersion]=useState("1");
 const [requirements,setRequirements]=useState('[{"subject":"Mathematics","minimumUnits":3},{"subject":"English","minimumUnits":4}]');
 const [transcriptId,setTranscriptId]=useState("");
 const [requirementSetId,setRequirementSetId]=useState("");
 const [decisionId,setDecisionId]=useState("");
 const [audit,setAudit]=useState<Awaited<ReturnType<typeof auditIssuedTranscript>>|null>(null);
 const [sets,setSets]=useState<Awaited<ReturnType<typeof listGraduationRequirements>>>([]);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 async function perform(action:()=>Promise<void>){
  setBusy(true);setMessage("");
  try{await action()}catch(error){setMessage(error instanceof Error?error.message:"Request failed")}finally{setBusy(false)}
 }
 const field=(title:string,value:string,change:(value:string)=>void)=><label className="block text-sm font-medium">{title}<input className="mt-1 block w-full rounded-lg border bg-background p-2" value={value} onChange={e=>change(e.target.value)}/></label>;
 return <WorkspaceShell eyebrow="CAN OS · Registrar" title="Institutional graduation closeout" subtitle="Approve institutional requirements, audit issued transcripts, decide graduation, and issue diplomas. Each action requires an authorized issuer registrar.">
  <div className="space-y-6 py-6">
   <Link to="/admissions/credential-delivery" className="inline-block rounded-lg border px-3 py-2 text-sm">Download and deliver official credentials</Link>
   <p className="rounded-lg border p-3 text-sm">An issued transcript does not automatically certify graduation. Only institution-approved requirements and a passing credit audit permit graduation approval. Diploma issuance is a separate recorded action.</p>
   {message&&<p role="status" className="rounded-lg border p-3">{message}</p>}
   <section className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">1. Institution-approved requirements</h2>
    <p className="text-sm">Select an issued student transcript below to identify the issuing institution, or enter its ID when creating a new institutional policy.</p>
    {field("Institution ID (policy administration)",issuerId,setIssuerId)}
    {field("Academic year",academicYear,setAcademicYear)}
    {field("Requirements version",version,setVersion)}
    <label className="block text-sm">Subject requirements (JSON)<textarea className="mt-1 block min-h-28 w-full rounded-lg border bg-background p-2" value={requirements} onChange={e=>setRequirements(e.target.value)}/></label>
    <div className="flex flex-wrap gap-2">
     <button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void perform(async()=>{const result=await approveGraduationRequirements({data:{issuerId,academicYear,version,requirements:JSON.parse(requirements)}});setRequirementSetId(result.requirementSetId);setMessage("Requirements version approved.")})}>Approve requirements</button>
     <button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void perform(async()=>{setSets(await listGraduationRequirements({data:{issuerId}}))})}>Load approved versions</button>
    </div>
    {sets.map(set=><button key={set.id} className="block rounded border p-2 text-left text-sm" onClick={()=>setRequirementSetId(set.id)}>{set.academicYear} · version {set.version} · {set.id}</button>)}
   </section>
   <section className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">2. Credit audit and graduation decision</h2>
    <p className="text-sm">First <Link to="/admissions/transcripts" search={{query:""}} className="underline">issue the student's official transcript</Link>, then enter the immutable issuance ID.</p>
    <label className="block text-sm">Find student by first name<input className="mt-1 block w-full rounded border bg-background p-2" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <button disabled={busy||search.trim().length<2} className="rounded border px-3 py-2" onClick={()=>void perform(async()=>setCandidates(await listGraduationCandidates({data:{query:search}})))}>Find issued transcripts</button>
    {candidates.map(candidate=><button key={candidate.transcriptId} className="block w-full rounded border p-2 text-left text-sm" onClick={()=>{setTranscriptId(candidate.transcriptId);setIssuerId(candidate.issuerId);setRequirementSetId("");setSets([]);setAudit(null);void perform(async()=>setSets(await listGraduationRequirements({data:{issuerId:candidate.issuerId}})))}}>{candidate.firstName} {candidate.lastName} · Issued {new Date(candidate.issuedAt).toLocaleDateString()}</button>)}
    {transcriptId&&<p className="text-sm">Selected issued transcript. Choose its applicable approved policy below.</p>}
    {sets.length>0&&<label className="block text-sm">Approved requirements<select className="mt-1 block w-full rounded border bg-background p-2" value={requirementSetId} onChange={e=>{setRequirementSetId(e.target.value);setAudit(null)}}><option value="">Select requirements</option>{sets.map(set=><option key={set.id} value={set.id}>{set.academicYear} · version {set.version}</option>)}</select></label>}

    <button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void perform(async()=>{setAudit(await auditIssuedTranscript({data:{transcriptId,requirementSetId}}))})}>Run credit audit</button>
    {audit&&<div className="space-y-2 rounded-lg border p-3 text-sm"><p>Audit: <strong>{audit.audit.status}</strong> · Earned credits: {audit.audit.totalEarned}</p>
      {audit.audit.deficiencies.map(row=><p key={row.subject}>{row.subject}: {row.earned} of {row.required} ({row.missing} missing)</p>)}
      {audit.audit.blockers.map((blocker,i)=><p key={i} className="text-red-700">{blocker}</p>)}
      <div className="flex gap-2">
       <button disabled={busy||audit.audit.status!=="requirements_met"} className="rounded-lg border px-3 py-2 disabled:opacity-50" onClick={()=>void perform(async()=>{const result=await decideGraduation({data:{transcriptId,requirementSetId,decision:"approved"}});setDecisionId(result.decisionId);setMessage("Graduation approved and recorded.")})}>Approve graduation</button>
       <button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void perform(async()=>{const result=await decideGraduation({data:{transcriptId,requirementSetId,decision:"denied"}});setDecisionId(result.decisionId);setMessage("Graduation denial recorded.")})}>Record denial</button>
      </div>
     </div>}
   </section>
   <section className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">3. Diploma issuance</h2>
    <p className="text-sm">{decisionId?"Graduation decision recorded. Diploma issuance is available below.":"Record an eligible graduation approval above before issuing a diploma."}</p>
    <button disabled={busy||!decisionId} className="rounded-lg border px-3 py-2" onClick={()=>void perform(async()=>{const result=await issueDiploma({data:{decisionId}});setMessage("Diploma credential recorded: "+result.diplomaId)})}>Issue diploma</button>
   </section>
  </div>
 </WorkspaceShell>;
}
