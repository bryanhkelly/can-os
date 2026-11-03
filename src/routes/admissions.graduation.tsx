import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { WorkspaceShell, QueryState } from "@/components/workspace";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { approveGraduationRequirements, classifyLegacyGraduationRequirements, getApplicableGraduationPolicy, listGraduationCandidates, auditIssuedTranscript, decideGraduation, issueDiploma, getDiplomaFreshness, revokeDiploma, listTranscriptDiplomas, listGraduationRequirements, listGraduationIssuers } from "@/modules/learning/graduation.functions";

export const Route=createFileRoute("/admissions/graduation")({component:GraduationCloseout});

function GraduationCloseout(){
 const [search,setSearch]=useState("");
 const [candidates,setCandidates]=useState<Awaited<ReturnType<typeof listGraduationCandidates>>>([]);
 const [issuerId,setIssuerId]=useState("");
 const issuersQuery=useQuery({queryKey:["graduation-issuers"],queryFn:()=>listGraduationIssuers(),retry:false,gcTime:0});
 const issuers=issuersQuery.data??[];
 const [academicYear,setAcademicYear]=useState("");
 const [version,setVersion]=useState("1");
 const [cohortStart,setCohortStart]=useState("");
 const [cohortEnd,setCohortEnd]=useState("");
 const [applicabilityReason,setApplicabilityReason]=useState("");
 const [supersedesRequirementSetId,setSupersedesRequirementSetId]=useState("");
 const [legacyPolicyId,setLegacyPolicyId]=useState("");
 const [legacyCohortStart,setLegacyCohortStart]=useState("");
 const [legacyCohortEnd,setLegacyCohortEnd]=useState("");
 const [legacyEvidenceReference,setLegacyEvidenceReference]=useState("");
 const [legacyJustification,setLegacyJustification]=useState("");
 const [applicablePolicy,setApplicablePolicy]=useState("");
 const [requirements,setRequirements]=useState([{subject:"",minimumUnits:""}]);
 const [transcriptId,setTranscriptId]=useState("");
 const [requirementSetId,setRequirementSetId]=useState("");
 const [decisionId,setDecisionId]=useState("");
 const [decisionRationale,setDecisionRationale]=useState("");
 const [issuedDiplomaId,setIssuedDiplomaId]=useState("");
 const [diplomaStatus,setDiplomaStatus]=useState("");
 const [diplomas,setDiplomas]=useState<Awaited<ReturnType<typeof listTranscriptDiplomas>>>([]);
 const [revocationReason,setRevocationReason]=useState("");
 const [audit,setAudit]=useState<Awaited<ReturnType<typeof auditIssuedTranscript>>|null>(null);
 const [sets,setSets]=useState<Awaited<ReturnType<typeof listGraduationRequirements>>>([]);
 const [message,setMessage]=useState("");
 const [reading,setReading]=useState(false);
 const readingRef=useRef(false);
 const mutation=useMutationFeedback(async()=>undefined);
 const busy=reading||mutation.pending||mutation.refreshFailed;
 async function perform(action:()=>Promise<void>){
  if(readingRef.current||busy)return;
  readingRef.current=true;setReading(true);setMessage("");
  try{await action()}catch(error){setMessage(mutationErrorMessage(error, "Request failed"))}finally{readingRef.current=false;setReading(false)}
 }
 return <WorkspaceShell eyebrow="CAN OS · Registrar" title="Institutional graduation closeout" subtitle="Approve institutional requirements, audit issued transcripts, decide graduation, and issue diplomas. Each action requires an authorized issuer registrar.">
  <div className="space-y-6 py-6">
   <Link to="/admissions/credential-delivery" className="inline-block rounded-lg border px-3 py-2 text-sm">Download official credentials</Link>
   <p className="rounded-lg border p-3 text-sm">An issued transcript does not automatically certify graduation. Only institution-approved requirements and a passing credit audit permit graduation approval. Diploma issuance is a separate recorded action.</p>
   {message&&<p role="status" className="rounded-lg border p-3">{message}</p>}
   <MutationFeedback state={mutation} pendingMessage="Recording graduation changes..."/>
   <section className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">1. Institution-approved requirements</h2>
    <p className="text-sm">Select an institution you are authorized to administer. Its policies remain institution-owned and versioned.</p>
    <QueryState loading={issuersQuery.isPending?"Loading authorized institutions...":undefined}
      error={issuersQuery.isError?mutationErrorMessage(issuersQuery.error,"Unable to load authorized institutions."):undefined}
      onRetry={()=>void issuersQuery.refetch()} retrying={issuersQuery.isFetching}>
      <label className="block text-sm font-medium">Issuing institution<select className="mt-1 block w-full rounded-lg border bg-background p-2" value={issuerId} onChange={e=>{setIssuerId(e.target.value);setSets([]);setRequirementSetId("");setAudit(null);setDecisionId("")}}><option value="">Select authorized institution</option>{issuers.map(issuer=><option key={issuer.id} value={issuer.id}>{issuer.name}</option>)}</select></label>
    </QueryState>
    <Field label="Academic year"><Input value={academicYear} onChange={event=>setAcademicYear(event.target.value)}/></Field>
    <Field label="Requirements version"><Input value={version} onChange={event=>setVersion(event.target.value)}/></Field>
    <Field label="Entry cohort start (YYYY)"><Input value={cohortStart} onChange={event=>setCohortStart(event.target.value)}/></Field>
    <Field label="Entry cohort end (YYYY)"><Input value={cohortEnd} onChange={event=>setCohortEnd(event.target.value)}/></Field>
    <Field label="Institutional applicability justification"><Input value={applicabilityReason} onChange={event=>setApplicabilityReason(event.target.value)}/></Field>
    <label className="block text-sm">Supersedes approved policy (optional)<select className="mt-1 block w-full rounded border bg-background p-2" value={supersedesRequirementSetId} onChange={e=>setSupersedesRequirementSetId(e.target.value)}><option value="">New cohort policy</option>{sets.map(set=><option key={set.id} value={set.id}>{set.academicYear} · {set.version}</option>)}</select></label>
    <div className="space-y-2"><p className="text-sm font-medium">Required credits by subject</p>{requirements.map((rule,index)=><div key={index} className="flex flex-wrap items-center gap-2"><input aria-label={"Subject "+(index+1)} className="rounded border bg-background p-2" value={rule.subject} onChange={e=>setRequirements(previous=>previous.map((item,i)=>i===index?{...item,subject:e.target.value}:item))}/><input aria-label={"Minimum units for "+rule.subject} type="number" min="0.01" step="0.01" className="w-28 rounded border bg-background p-2" value={rule.minimumUnits} onChange={e=>setRequirements(previous=>previous.map((item,i)=>i===index?{...item,minimumUnits:e.target.value}:item))}/><button type="button" disabled={requirements.length===1} className="rounded border px-2 py-1" onClick={()=>setRequirements(previous=>previous.filter((_,i)=>i!==index))}>Remove</button></div>)}<button type="button" className="rounded border px-3 py-2" onClick={()=>setRequirements(previous=>[...previous,{subject:"",minimumUnits:""}])}>Add subject</button></div>
    <div className="flex flex-wrap gap-2">
     <button disabled={busy||!issuerId||!academicYear.trim()||!cohortStart||!cohortEnd||applicabilityReason.trim().length<12||requirements.some(rule=>!rule.subject.trim()||!(Number(rule.minimumUnits)>0))} className="rounded-lg border px-3 py-2" onClick={()=>void mutation.run(async()=>{const result=await approveGraduationRequirements({data:{issuerId,academicYear,version,cohortStart,cohortEnd,applicabilityReason,supersedesRequirementSetId:supersedesRequirementSetId||undefined,requirements:requirements.map(rule=>({subject:rule.subject.trim(),minimumUnits:Number(rule.minimumUnits)}))}});setRequirementSetId(result.requirementSetId);setAudit(null);setDecisionId("");},{successMessage:"Requirements version approved.",commandErrorMessage:"Unable to approve requirements.",refresh:async()=>setSets(await listGraduationRequirements({data:{issuerId}}))})}>Approve requirements</button>
     <button disabled={busy||!issuerId} className="rounded-lg border px-3 py-2" onClick={()=>void perform(async()=>{setSets(await listGraduationRequirements({data:{issuerId}}))})}>Load approved versions</button>
    </div>

    {sets.some(set=>!set.cohortStart||!set.cohortEnd)&&
     <div className="space-y-3 rounded-lg border p-3">
      <h3 className="font-semibold">Classify a legacy graduation policy</h3>
      <p className="text-sm">Legacy policies without attested entry-cohort bounds block graduation. Classify each policy from its institutional evidence. Never infer a cohort from its academic year. This one-time action is audited; approved credit requirements do not change.</p>
      <label className="block text-sm">Unclassified policy<select className="mt-1 block w-full rounded border bg-background p-2" value={legacyPolicyId} onChange={e=>setLegacyPolicyId(e.target.value)}><option value="">Select unclassified policy</option>{sets.filter(set=>!set.cohortStart||!set.cohortEnd).map(set=><option key={set.id} value={set.id}>{set.academicYear} · {set.version}</option>)}</select></label>
      <Field label="Attested entry cohort start (YYYY)"><Input value={legacyCohortStart} onChange={event=>setLegacyCohortStart(event.target.value)}/></Field>
      <Field label="Attested entry cohort end (YYYY)"><Input value={legacyCohortEnd} onChange={event=>setLegacyCohortEnd(event.target.value)}/></Field>
      <Field label="Registrar evidence reference"><Input value={legacyEvidenceReference} onChange={event=>setLegacyEvidenceReference(event.target.value)}/></Field>
      <Field label="Institutional classification justification"><Input value={legacyJustification} onChange={event=>setLegacyJustification(event.target.value)}/></Field>
      <button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-50" disabled={busy||!issuerId||!legacyPolicyId||!/^[0-9]{4}$/.test(legacyCohortStart)||!/^[0-9]{4}$/.test(legacyCohortEnd)||legacyCohortStart>legacyCohortEnd||legacyEvidenceReference.trim().length<12||legacyJustification.trim().length<20} onClick={()=>void mutation.run(async()=>{
       await classifyLegacyGraduationRequirements({data:{issuerId,requirementSetId:legacyPolicyId,cohortStart:legacyCohortStart,cohortEnd:legacyCohortEnd,evidenceReference:legacyEvidenceReference,applicabilityReason:legacyJustification}});
       setLegacyPolicyId("");setLegacyCohortStart("");setLegacyCohortEnd("");setLegacyEvidenceReference("");setLegacyJustification("");
      },{successMessage:"Legacy policy cohort classified and audited. Review any remaining unclassified active policies.",commandErrorMessage:"Unable to classify legacy policy.",refresh:async()=>setSets(await listGraduationRequirements({data:{issuerId}}))})}>Attest and classify legacy policy</button>
     </div>}

   </section>
   <section className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">2. Credit audit and graduation decision</h2>
    <p className="text-sm">First <Link to="/admissions/transcripts" search={{query:""}} className="underline">issue the student's official transcript</Link>, then select the student below.</p>
    <label className="block text-sm">Find student by first name<input className="mt-1 block w-full rounded border bg-background p-2" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <button disabled={busy||search.trim().length<2} className="rounded border px-3 py-2" onClick={()=>void perform(async()=>setCandidates(await listGraduationCandidates({data:{query:search}})))}>Find issued transcripts</button>
    {candidates.map(candidate=><button key={candidate.transcriptId} className="block w-full rounded border p-2 text-left text-sm" onClick={()=>{setTranscriptId(candidate.transcriptId);setDecisionId("");setApplicablePolicy("");setIssuerId(candidate.issuerId);setRequirementSetId("");setSets([]);setAudit(null);setDiplomas([]);setIssuedDiplomaId("");void perform(async()=>{setDiplomas(await listTranscriptDiplomas({data:{transcriptId:candidate.transcriptId}}));const policy=await getApplicableGraduationPolicy({data:{transcriptId:candidate.transcriptId}});setRequirementSetId(policy.id);setApplicablePolicy(`${policy.academicYear} · version ${policy.version} · entry cohorts ${policy.cohortStart}–${policy.cohortEnd}`)})}}>{candidate.firstName} {candidate.lastName} · Issued {new Date(candidate.issuedAt).toLocaleDateString()}</button>)}
    {transcriptId&&<p className="text-sm">Selected issued transcript. Choose its applicable approved policy below.</p>}
    {applicablePolicy&&<p className="rounded border p-3 text-sm">Applicable institution policy: <strong>{applicablePolicy}</strong></p>}

    <Field label="Graduation decision rationale (required)"><Input value={decisionRationale} onChange={event=>setDecisionRationale(event.target.value)}/></Field>
    <button disabled={busy||!transcriptId||!requirementSetId} className="rounded-lg border px-3 py-2" onClick={()=>void perform(async()=>{setDecisionId("");setAudit(await auditIssuedTranscript({data:{transcriptId,requirementSetId}}))})}>Run credit audit</button>
    {audit&&<div className="space-y-2 rounded-lg border p-3 text-sm"><p>Audit: <strong>{audit.audit.status}</strong> · Earned credits: {audit.audit.totalEarned}</p>
      {audit.audit.deficiencies.map(row=><p key={row.subject}>{row.subject}: {row.earned} of {row.required} ({row.missing} missing)</p>)}
      {audit.audit.blockers.map((blocker,i)=><p key={i} className="text-red-700">{blocker}</p>)}
      <div className="flex gap-2">
       <button disabled={busy||audit.audit.status!=="requirements_met"||decisionRationale.trim().length<12} className="rounded-lg border px-3 py-2 disabled:opacity-50" onClick={()=>void mutation.run(async()=>{const result=await decideGraduation({data:{transcriptId,requirementSetId,decision:"approved",rationale:decisionRationale}});setDecisionId(result.decisionId);},{successMessage:"Graduation approved and recorded.",commandErrorMessage:"Unable to approve graduation."})}>Approve graduation</button>
       <button disabled={busy||decisionRationale.trim().length<12} className="rounded-lg border px-3 py-2" onClick={()=>void mutation.run(async()=>{await decideGraduation({data:{transcriptId,requirementSetId,decision:"denied",rationale:decisionRationale}});setDecisionId("");setAudit(null);},{successMessage:"Graduation denial recorded.",commandErrorMessage:"Unable to record graduation denial."})}>Record denial</button>
      </div>
     </div>}
   </section>
   <section className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">3. Diploma issuance</h2>
    <p className="text-sm">{decisionId?"Graduation decision recorded. Diploma issuance is available below.":"Record an eligible graduation approval above before issuing a diploma."}</p>
    <button disabled={busy||!decisionId} className="rounded-lg border px-3 py-2" onClick={()=>void mutation.run(async()=>{const result=await issueDiploma({data:{decisionId}});setIssuedDiplomaId(result.diplomaId);setDiplomaStatus("current");setDecisionId("");},{successMessage:"Diploma credential recorded.",commandErrorMessage:"Unable to issue diploma.",refresh:async()=>setDiplomas(await listTranscriptDiplomas({data:{transcriptId}}))})}>Issue diploma</button>
    {transcriptId&&<div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-semibold">Recorded diplomas for selected transcript</p>
      <button type="button" disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void perform(async()=>setDiplomas(await listTranscriptDiplomas({data:{transcriptId}})))}>Refresh diploma history</button>
      {diplomas.length===0?<p className="text-sm">No diploma issuance recorded for this transcript.</p>:diplomas.map(row=><button key={row.id} type="button" className="block w-full rounded border p-2 text-left text-sm" onClick={()=>void perform(async()=>{setIssuedDiplomaId(row.id);setRevocationReason("");const result=await getDiplomaFreshness({data:{diplomaId:row.id}});setDiplomaStatus(result.status)})}>Issued {new Date(row.issuedAt).toLocaleDateString()} · {row.revokedAt?"Revoked":"Recorded"} · Inspect</button>)}
    </div>}
    {issuedDiplomaId&&<div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm">Issued diploma status: <strong>{diplomaStatus||"Review required"}</strong></p>
      <button type="button" disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void perform(async()=>{const result=await getDiplomaFreshness({data:{diplomaId:issuedDiplomaId}});setDiplomaStatus(result.status)})}>Inspect diploma status</button>
      <Field label="Revocation reason (required)"><Input value={revocationReason} onChange={event=>setRevocationReason(event.target.value)}/></Field>
      <button type="button" disabled={busy||diplomaStatus==="revoked"||revocationReason.trim().length<12} className="rounded-lg border px-3 py-2" onClick={()=>void mutation.run(async()=>{await revokeDiploma({data:{diplomaId:issuedDiplomaId,reason:revocationReason}});setDiplomaStatus("revoked");},{successMessage:"Diploma revoked and audited.",commandErrorMessage:"Unable to revoke diploma.",refresh:async()=>setDiplomas(await listTranscriptDiplomas({data:{transcriptId}}))})}>Revoke diploma</button>
    </div>}
   </section>
  </div>
 </WorkspaceShell>;
}
