import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { approveGraduationRequirements, getApplicableGraduationPolicy, listGraduationCandidates, auditIssuedTranscript, decideGraduation, issueDiploma, listGraduationRequirements, listGraduationIssuers } from "@/modules/learning/graduation.functions";

export const Route=createFileRoute("/admissions/graduation")({component:GraduationCloseout});

function GraduationCloseout(){
 const [search,setSearch]=useState("");
 const [candidates,setCandidates]=useState<Awaited<ReturnType<typeof listGraduationCandidates>>>([]);
 const [issuerId,setIssuerId]=useState("");
 const [issuers,setIssuers]=useState<Awaited<ReturnType<typeof listGraduationIssuers>>>([]);
 useEffect(()=>{let active=true;void listGraduationIssuers().then(rows=>{if(active)setIssuers(rows)}).catch(()=>{});return()=>{active=false}},[]);
 const [academicYear,setAcademicYear]=useState("");
 const [version,setVersion]=useState("1");
 const [cohortStart,setCohortStart]=useState("");
 const [cohortEnd,setCohortEnd]=useState("");
 const [applicabilityReason,setApplicabilityReason]=useState("");
 const [supersedesRequirementSetId,setSupersedesRequirementSetId]=useState("");
 const [applicablePolicy,setApplicablePolicy]=useState("");
 const [requirements,setRequirements]=useState([{subject:"",minimumUnits:""}]);
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
   <Link to="/admissions/credential-delivery" className="inline-block rounded-lg border px-3 py-2 text-sm">Download official credentials</Link>
   <p className="rounded-lg border p-3 text-sm">An issued transcript does not automatically certify graduation. Only institution-approved requirements and a passing credit audit permit graduation approval. Diploma issuance is a separate recorded action.</p>
   {message&&<p role="status" className="rounded-lg border p-3">{message}</p>}
   <section className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">1. Institution-approved requirements</h2>
    <p className="text-sm">Select an institution you are authorized to administer. Its policies remain institution-owned and versioned.</p>
    <label className="block text-sm font-medium">Issuing institution<select className="mt-1 block w-full rounded-lg border bg-background p-2" value={issuerId} onChange={e=>{setIssuerId(e.target.value);setSets([]);setRequirementSetId("");setAudit(null);setDecisionId("")}}><option value="">Select authorized institution</option>{issuers.map(issuer=><option key={issuer.id} value={issuer.id}>{issuer.name}</option>)}</select></label>
    {field("Academic year",academicYear,setAcademicYear)}
    {field("Requirements version",version,setVersion)}
    {field("Entry cohort start (YYYY)",cohortStart,setCohortStart)}
    {field("Entry cohort end (YYYY)",cohortEnd,setCohortEnd)}
    {field("Institutional applicability justification",applicabilityReason,setApplicabilityReason)}
    <label className="block text-sm">Supersedes approved policy (optional)<select className="mt-1 block w-full rounded border bg-background p-2" value={supersedesRequirementSetId} onChange={e=>setSupersedesRequirementSetId(e.target.value)}><option value="">New cohort policy</option>{sets.map(set=><option key={set.id} value={set.id}>{set.academicYear} · {set.version}</option>)}</select></label>
    <div className="space-y-2"><p className="text-sm font-medium">Required credits by subject</p>{requirements.map((rule,index)=><div key={index} className="flex flex-wrap items-center gap-2"><input aria-label={"Subject "+(index+1)} className="rounded border bg-background p-2" value={rule.subject} onChange={e=>setRequirements(previous=>previous.map((item,i)=>i===index?{...item,subject:e.target.value}:item))}/><input aria-label={"Minimum units for "+rule.subject} type="number" min="0.01" step="0.01" className="w-28 rounded border bg-background p-2" value={rule.minimumUnits} onChange={e=>setRequirements(previous=>previous.map((item,i)=>i===index?{...item,minimumUnits:e.target.value}:item))}/><button type="button" disabled={requirements.length===1} className="rounded border px-2 py-1" onClick={()=>setRequirements(previous=>previous.filter((_,i)=>i!==index))}>Remove</button></div>)}<button type="button" className="rounded border px-3 py-2" onClick={()=>setRequirements(previous=>[...previous,{subject:"",minimumUnits:""}])}>Add subject</button></div>
    <div className="flex flex-wrap gap-2">
     <button disabled={busy||!issuerId||!academicYear.trim()||!cohortStart||!cohortEnd||applicabilityReason.trim().length<12||requirements.some(rule=>!rule.subject.trim()||!(Number(rule.minimumUnits)>0))} className="rounded-lg border px-3 py-2" onClick={()=>void perform(async()=>{const result=await approveGraduationRequirements({data:{issuerId,academicYear,version,cohortStart,cohortEnd,applicabilityReason,supersedesRequirementSetId:supersedesRequirementSetId||undefined,requirements:requirements.map(rule=>({subject:rule.subject.trim(),minimumUnits:Number(rule.minimumUnits)}))}});setRequirementSetId(result.requirementSetId);setSets(await listGraduationRequirements({data:{issuerId}}));setAudit(null);setDecisionId("");setMessage("Requirements version approved.")})}>Approve requirements</button>
     <button disabled={busy||!issuerId} className="rounded-lg border px-3 py-2" onClick={()=>void perform(async()=>{setSets(await listGraduationRequirements({data:{issuerId}}))})}>Load approved versions</button>
    </div>

   </section>
   <section className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">2. Credit audit and graduation decision</h2>
    <p className="text-sm">First <Link to="/admissions/transcripts" search={{query:""}} className="underline">issue the student's official transcript</Link>, then select the student below.</p>
    <label className="block text-sm">Find student by first name<input className="mt-1 block w-full rounded border bg-background p-2" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <button disabled={busy||search.trim().length<2} className="rounded border px-3 py-2" onClick={()=>void perform(async()=>setCandidates(await listGraduationCandidates({data:{query:search}})))}>Find issued transcripts</button>
    {candidates.map(candidate=><button key={candidate.transcriptId} className="block w-full rounded border p-2 text-left text-sm" onClick={()=>{setTranscriptId(candidate.transcriptId);setDecisionId("");setApplicablePolicy("");setIssuerId(candidate.issuerId);setRequirementSetId("");setSets([]);setAudit(null);void perform(async()=>{const policy=await getApplicableGraduationPolicy({data:{transcriptId:candidate.transcriptId}});setRequirementSetId(policy.id);setApplicablePolicy(`${policy.academicYear} · version ${policy.version} · entry cohorts ${policy.cohortStart}–${policy.cohortEnd}`)})}}>{candidate.firstName} {candidate.lastName} · Issued {new Date(candidate.issuedAt).toLocaleDateString()}</button>)}
    {transcriptId&&<p className="text-sm">Selected issued transcript. Choose its applicable approved policy below.</p>}
    {applicablePolicy&&<p className="rounded border p-3 text-sm">Applicable institution policy: <strong>{applicablePolicy}</strong></p>}

    <button disabled={busy||!transcriptId||!requirementSetId} className="rounded-lg border px-3 py-2" onClick={()=>void perform(async()=>{setDecisionId("");setAudit(await auditIssuedTranscript({data:{transcriptId,requirementSetId}}))})}>Run credit audit</button>
    {audit&&<div className="space-y-2 rounded-lg border p-3 text-sm"><p>Audit: <strong>{audit.audit.status}</strong> · Earned credits: {audit.audit.totalEarned}</p>
      {audit.audit.deficiencies.map(row=><p key={row.subject}>{row.subject}: {row.earned} of {row.required} ({row.missing} missing)</p>)}
      {audit.audit.blockers.map((blocker,i)=><p key={i} className="text-red-700">{blocker}</p>)}
      <div className="flex gap-2">
       <button disabled={busy||audit.audit.status!=="requirements_met"} className="rounded-lg border px-3 py-2 disabled:opacity-50" onClick={()=>void perform(async()=>{const result=await decideGraduation({data:{transcriptId,requirementSetId,decision:"approved"}});setDecisionId(result.decisionId);setMessage("Graduation approved and recorded.")})}>Approve graduation</button>
       <button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void perform(async()=>{await decideGraduation({data:{transcriptId,requirementSetId,decision:"denied"}});setDecisionId("");setAudit(null);setMessage("Graduation denial recorded.")})}>Record denial</button>
      </div>
     </div>}
   </section>
   <section className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">3. Diploma issuance</h2>
    <p className="text-sm">{decisionId?"Graduation decision recorded. Diploma issuance is available below.":"Record an eligible graduation approval above before issuing a diploma."}</p>
    <button disabled={busy||!decisionId} className="rounded-lg border px-3 py-2" onClick={()=>void perform(async()=>{await issueDiploma({data:{decisionId}});setDecisionId("");setMessage("Diploma credential recorded.")})}>Issue diploma</button>
   </section>
  </div>
 </WorkspaceShell>;
}
