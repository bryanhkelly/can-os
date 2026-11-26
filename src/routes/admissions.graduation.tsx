import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { WorkspaceShell, QueryState, WorkspacePanel, WorkspaceNotice, ActionFooter, EmptyState } from "@/components/workspace";
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
 return <WorkspaceShell eyebrow="Registrar" title="Institutional graduation closeout" subtitle="Approve institutional requirements, audit issued transcripts, decide graduation, and issue diplomas. Each action requires an authorized issuer registrar.">
  <div className="space-y-6 py-6">
   <Button asChild variant="outline"><Link to="/admissions/credential-delivery">Download official credentials</Link></Button>
   <WorkspaceNotice>An issued transcript does not automatically certify graduation. Only institution-approved requirements and a passing credit audit permit graduation approval. Diploma issuance is a separate recorded action.</WorkspaceNotice>
   {message&&<WorkspaceNotice tone="danger">{message}</WorkspaceNotice>}
   <MutationFeedback state={mutation} pendingMessage="Recording graduation changes..."/>
   <WorkspacePanel title="1. Institution-approved requirements">
    <div className="space-y-4">
    <p className="text-sm">Select an institution you are authorized to administer. Its policies remain institution-owned and versioned.</p>
    <QueryState loading={issuersQuery.isPending?"Loading authorized institutions...":undefined}
      error={issuersQuery.isError?mutationErrorMessage(issuersQuery.error,"Unable to load authorized institutions."):undefined}
      onRetry={()=>void issuersQuery.refetch()} retrying={issuersQuery.isFetching}>
      <Field label="Issuing institution"><Select value={issuerId} onChange={e=>{setIssuerId(e.target.value);setSets([]);setRequirementSetId("");setAudit(null);setDecisionId("")}}><option value="">Select authorized institution</option>{issuers.map(issuer=><option key={issuer.id} value={issuer.id}>{issuer.name}</option>)}</Select></Field>
    </QueryState>
    <Field label="Academic year"><Input value={academicYear} onChange={event=>setAcademicYear(event.target.value)}/></Field>
    <Field label="Requirements version"><Input value={version} onChange={event=>setVersion(event.target.value)}/></Field>
    <Field label="Entry year start (YYYY)"><Input value={cohortStart} onChange={event=>setCohortStart(event.target.value)}/></Field>
    <Field label="Entry year end (YYYY)"><Input value={cohortEnd} onChange={event=>setCohortEnd(event.target.value)}/></Field>
    <Field label="Institutional applicability justification"><Input value={applicabilityReason} onChange={event=>setApplicabilityReason(event.target.value)}/></Field>
    <Field label="Supersedes approved policy (optional)"><Select value={supersedesRequirementSetId} onChange={e=>setSupersedesRequirementSetId(e.target.value)}><option value="">New graduation policy</option>{sets.map(set=><option key={set.id} value={set.id}>{set.academicYear} · {set.version}</option>)}</Select></Field>
    <div className="space-y-2"><p className="text-sm font-medium">Required credits by subject</p>{requirements.map((rule,index)=><div key={index} className="flex flex-wrap items-center gap-2"><Input aria-label={"Subject "+(index+1)} className="min-w-0 flex-1" value={rule.subject} onChange={e=>setRequirements(previous=>previous.map((item,i)=>i===index?{...item,subject:e.target.value}:item))}/><Input aria-label={"Minimum units for "+rule.subject} type="number" min="0.01" step="0.01" className="w-28" value={rule.minimumUnits} onChange={e=>setRequirements(previous=>previous.map((item,i)=>i===index?{...item,minimumUnits:e.target.value}:item))}/><Button variant="outline" type="button" disabled={requirements.length===1} size="sm" onClick={()=>setRequirements(previous=>previous.filter((_,i)=>i!==index))}>Remove</Button></div>)}<Button variant="outline" type="button"  onClick={()=>setRequirements(previous=>[...previous,{subject:"",minimumUnits:""}])}>Add subject</Button></div>
    <ActionFooter layout="inline">
     <Button type="button" variant="outline" disabled={busy||!issuerId||!academicYear.trim()||!cohortStart||!cohortEnd||applicabilityReason.trim().length<12||requirements.some(rule=>!rule.subject.trim()||!(Number(rule.minimumUnits)>0))}  onClick={()=>void mutation.run(async()=>{const result=await approveGraduationRequirements({data:{issuerId,academicYear,version,cohortStart,cohortEnd,applicabilityReason,supersedesRequirementSetId:supersedesRequirementSetId||undefined,requirements:requirements.map(rule=>({subject:rule.subject.trim(),minimumUnits:Number(rule.minimumUnits)}))}});setRequirementSetId(result.requirementSetId);setAudit(null);setDecisionId("");},{successMessage:"Requirements version approved.",commandErrorMessage:"Unable to approve requirements.",refresh:async()=>setSets(await listGraduationRequirements({data:{issuerId}}))})}>Approve requirements</Button>
     <Button type="button" variant="outline" disabled={busy||!issuerId}  onClick={()=>void perform(async()=>{setSets(await listGraduationRequirements({data:{issuerId}}))})}>Load approved versions</Button>
    </ActionFooter>

    {sets.some(set=>!set.cohortStart||!set.cohortEnd)&&
     <div className="space-y-3  border p-3">
      <h3 className="font-semibold">Classify a legacy graduation policy</h3>
      <p className="text-sm">Legacy policies without attested entry-year bounds block graduation. Classify each policy from its institutional evidence. Never infer an entry-year range from its academic year. This one-time action is audited; approved credit requirements do not change.</p>
      <Field label="Unclassified policy"><Select value={legacyPolicyId} onChange={e=>setLegacyPolicyId(e.target.value)}><option value="">Select unclassified policy</option>{sets.filter(set=>!set.cohortStart||!set.cohortEnd).map(set=><option key={set.id} value={set.id}>{set.academicYear} · {set.version}</option>)}</Select></Field>
      <Field label="Attested entry year start (YYYY)"><Input value={legacyCohortStart} onChange={event=>setLegacyCohortStart(event.target.value)}/></Field>
      <Field label="Attested entry year end (YYYY)"><Input value={legacyCohortEnd} onChange={event=>setLegacyCohortEnd(event.target.value)}/></Field>
      <Field label="Registrar evidence reference"><Input value={legacyEvidenceReference} onChange={event=>setLegacyEvidenceReference(event.target.value)}/></Field>
      <Field label="Institutional classification justification"><Input value={legacyJustification} onChange={event=>setLegacyJustification(event.target.value)}/></Field>
      <Button variant="outline" type="button"  disabled={busy||!issuerId||!legacyPolicyId||!/^[0-9]{4}$/.test(legacyCohortStart)||!/^[0-9]{4}$/.test(legacyCohortEnd)||legacyCohortStart>legacyCohortEnd||legacyEvidenceReference.trim().length<12||legacyJustification.trim().length<20} onClick={()=>void mutation.run(async()=>{
       await classifyLegacyGraduationRequirements({data:{issuerId,requirementSetId:legacyPolicyId,cohortStart:legacyCohortStart,cohortEnd:legacyCohortEnd,evidenceReference:legacyEvidenceReference,applicabilityReason:legacyJustification}});
       setLegacyPolicyId("");setLegacyCohortStart("");setLegacyCohortEnd("");setLegacyEvidenceReference("");setLegacyJustification("");
      },{successMessage:"Legacy policy entry years classified and audited. Review any remaining unclassified active policies.",commandErrorMessage:"Unable to classify legacy policy.",refresh:async()=>setSets(await listGraduationRequirements({data:{issuerId}}))})}>Attest and classify legacy policy</Button>
     </div>}

   </div></WorkspacePanel>
   <WorkspacePanel title="2. Credit audit and graduation decision">
    <div className="space-y-4">
    <p className="text-sm">First <Link to="/admissions/transcripts" search={{query:""}} className="underline">issue the student's official transcript</Link>, then select the student below.</p>
    <Field label="Find student by first name"><Input value={search} onChange={e=>setSearch(e.target.value)}/></Field>
    <Button type="button" variant="outline" disabled={busy||search.trim().length<2}  onClick={()=>void perform(async()=>setCandidates(await listGraduationCandidates({data:{query:search}})))}>Find issued transcripts</Button>
    {candidates.map(candidate=><Button type="button" variant="outline" key={candidate.transcriptId} className="w-full justify-start text-left" onClick={()=>{setTranscriptId(candidate.transcriptId);setDecisionId("");setApplicablePolicy("");setIssuerId(candidate.issuerId);setRequirementSetId("");setSets([]);setAudit(null);setDiplomas([]);setIssuedDiplomaId("");void perform(async()=>{setDiplomas(await listTranscriptDiplomas({data:{transcriptId:candidate.transcriptId}}));const policy=await getApplicableGraduationPolicy({data:{transcriptId:candidate.transcriptId}});setRequirementSetId(policy.id);setApplicablePolicy(`${policy.academicYear} · version ${policy.version} · entry years ${policy.cohortStart}–${policy.cohortEnd}`)})}}>{candidate.firstName} {candidate.lastName} · Issued {new Date(candidate.issuedAt).toLocaleDateString()}</Button>)}
    {transcriptId&&<p className="text-sm">Selected issued transcript. Choose its applicable approved policy below.</p>}
    {applicablePolicy&&<WorkspaceNotice>Applicable institution policy: <strong>{applicablePolicy}</strong></WorkspaceNotice>}

    <Field label="Graduation decision rationale (required)"><Input value={decisionRationale} onChange={event=>setDecisionRationale(event.target.value)}/></Field>
    <Button type="button" variant="outline" disabled={busy||!transcriptId||!requirementSetId}  onClick={()=>void perform(async()=>{setDecisionId("");setAudit(await auditIssuedTranscript({data:{transcriptId,requirementSetId}}))})}>Run credit audit</Button>
    {audit&&<div className="space-y-2  border p-3 text-sm"><p>Audit: <strong>{audit.audit.status}</strong> · Earned credits: {audit.audit.totalEarned}</p>
      {audit.audit.deficiencies.map(row=><p key={row.subject}>{row.subject}: {row.earned} of {row.required} ({row.missing} missing)</p>)}
      {audit.audit.blockers.map((blocker,i)=><p key={i} className="text-danger">{blocker}</p>)}
      <ActionFooter layout="inline">
       <Button type="button" variant="outline" disabled={busy||audit.audit.status!=="requirements_met"||decisionRationale.trim().length<12}  onClick={()=>void mutation.run(async()=>{const result=await decideGraduation({data:{transcriptId,requirementSetId,decision:"approved",rationale:decisionRationale}});setDecisionId(result.decisionId);},{successMessage:"Graduation approved and recorded.",commandErrorMessage:"Unable to approve graduation."})}>Approve graduation</Button>
       <Button type="button" variant="outline" disabled={busy||decisionRationale.trim().length<12}  onClick={()=>void mutation.run(async()=>{await decideGraduation({data:{transcriptId,requirementSetId,decision:"denied",rationale:decisionRationale}});setDecisionId("");setAudit(null);},{successMessage:"Graduation denial recorded.",commandErrorMessage:"Unable to record graduation denial."})}>Record denial</Button>
      </ActionFooter>
     </div>}
   </div></WorkspacePanel>
   <WorkspacePanel title="3. Diploma issuance">
    <div className="space-y-4">
    <p className="text-sm">{decisionId?"Graduation decision recorded. Diploma issuance is available below.":"Record an eligible graduation approval above before issuing a diploma."}</p>
    <Button type="button" variant="outline" disabled={busy||!decisionId}  onClick={()=>void mutation.run(async()=>{const result=await issueDiploma({data:{decisionId}});setIssuedDiplomaId(result.diplomaId);setDiplomaStatus("current");setDecisionId("");},{successMessage:"Diploma credential recorded.",commandErrorMessage:"Unable to issue diploma.",refresh:async()=>setDiplomas(await listTranscriptDiplomas({data:{transcriptId}}))})}>Issue diploma</Button>
    {transcriptId&&<div className="space-y-2  border p-3">
      <p className="text-sm font-semibold">Recorded diplomas for selected transcript</p>
      <Button variant="outline" type="button" disabled={busy}  onClick={()=>void perform(async()=>setDiplomas(await listTranscriptDiplomas({data:{transcriptId}})))}>Refresh diploma history</Button>
      {diplomas.length===0?<EmptyState title="No diploma issuance recorded for this transcript."/>:diplomas.map(row=><Button variant="outline" key={row.id} type="button" className="w-full justify-start text-left" onClick={()=>void perform(async()=>{setIssuedDiplomaId(row.id);setRevocationReason("");const result=await getDiplomaFreshness({data:{diplomaId:row.id}});setDiplomaStatus(result.status)})}>Issued {new Date(row.issuedAt).toLocaleDateString()} · {row.revokedAt?"Revoked":"Recorded"} · Inspect</Button>)}
    </div>}
    {issuedDiplomaId&&<div className="space-y-2  border p-3">
      <p className="text-sm">Issued diploma status: <strong>{diplomaStatus||"Review required"}</strong></p>
      <Button variant="outline" type="button" disabled={busy}  onClick={()=>void perform(async()=>{const result=await getDiplomaFreshness({data:{diplomaId:issuedDiplomaId}});setDiplomaStatus(result.status)})}>Inspect diploma status</Button>
      <Field label="Revocation reason (required)"><Input value={revocationReason} onChange={event=>setRevocationReason(event.target.value)}/></Field>
      <Button variant="outline" type="button" disabled={busy||diplomaStatus==="revoked"||revocationReason.trim().length<12}  onClick={()=>void mutation.run(async()=>{await revokeDiploma({data:{diplomaId:issuedDiplomaId,reason:revocationReason}});setDiplomaStatus("revoked");},{successMessage:"Diploma revoked and audited.",commandErrorMessage:"Unable to revoke diploma.",refresh:async()=>setDiplomas(await listTranscriptDiplomas({data:{transcriptId}}))})}>Revoke diploma</Button>
    </div>}
   </div></WorkspacePanel>
  </div>
 </WorkspaceShell>;
}
