import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getGuardianEnrollmentChangeOptions, listGuardianEnrollmentChanges,
  requestGuardianEnrollmentChange,
} from "@/modules/enrollment/guardian-enrollment-changes.functions";
import {listPublicTransferDestinations,requestTransferDestinationFamilyStart} from "@/modules/enrollment/guardian-transfer-destination.functions";

export const Route = createFileRoute("/guardian/enrollment-changes")({
 validateSearch:(search:Record<string,unknown>):{student?:string}=>({
  student:typeof search.student==="string"?search.student:undefined,
 }),
 component:GuardianEnrollmentChanges,
});

type Choice=Awaited<ReturnType<typeof getGuardianEnrollmentChangeOptions>>[number];
type Case=Awaited<ReturnType<typeof listGuardianEnrollmentChanges>>["items"][number];
type Kind="withdrawal"|"transfer"|"family_change";
type TransferDestination=Awaited<ReturnType<typeof listPublicTransferDestinations>>[number];

function GuardianEnrollmentChanges(){
 const {student}=Route.useSearch();
 const [choices,setChoices]=useState<Choice[]>([]);
 const [requests,setRequests]=useState<Case[]>([]);
 const [destinations,setDestinations]=useState<TransferDestination[]>([]);
 const [destinationChoices,setDestinationChoices]=useState<Record<string,string>>({});
 const [destinationConfirmations,setDestinationConfirmations]=useState<Record<string,boolean>>({});
 const [selected,setSelected]=useState("");
 const [kind,setKind]=useState<Kind>("withdrawal");
 const [reason,setReason]=useState("");
 const [destinationSchoolName,setDestinationSchoolName]=useState("");
 const [destinationSchoolContactEmail,setDestinationSchoolContactEmail]=useState("");
 const [intendedLastDay,setIntendedLastDay]=useState("");
 const [recordsReleaseAuthorized,setRecordsReleaseAuthorized]=useState(false);
 const [attempted,setAttempted]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const mutation=useMutationFeedback(refresh);
 const busy=mutation.pending||mutation.refreshFailed;
 async function refresh(){
  const [options,records,published]=await Promise.all([
    getGuardianEnrollmentChangeOptions(),
    listGuardianEnrollmentChanges({data:{}}),
    listPublicTransferDestinations(),
  ]);
  setChoices(options);setRequests(records.items);setDestinations(published);
  const first=options.find(choice=>choice.studentPersonId===student)??options[0];
  setSelected(current=>options.some(choice=>choice.studentPersonId+":"+choice.programId===current)
    ?current:first?first.studentPersonId+":"+first.programId:"");
 }
 useEffect(()=>{
  let active=true;
  // Separate unmount guard: a family should not see another child's data
  // while the verified parent request is loading.
  setLoading(true);setError("");setChoices([]);setRequests([]);setSelected("");
  Promise.all([
    getGuardianEnrollmentChangeOptions(),
    listGuardianEnrollmentChanges({data:{}}),
    listPublicTransferDestinations(),
  ]).then(([options,records,published])=>{
    if(!active)return;
    setChoices(options);setRequests(records.items);setDestinations(published);
    const first=options.find(choice=>choice.studentPersonId===student)??options[0];
    setSelected(first?first.studentPersonId+":"+first.programId:"");
  }).catch(()=>{if(active)setError("Unable to verify your current family enrollment. Contact admissions.");})
    .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false};
 },[student]);
 async function submit(event:FormEvent){
  event.preventDefault();
  setAttempted(true);
  const choice=choices.find(choice=>choice.studentPersonId+":"+choice.programId===selected);
  const invalidEmail=!!destinationSchoolContactEmail.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinationSchoolContactEmail.trim());
  if(!choice||reason.trim().length<10||busy||invalidEmail||kind==="transfer"&&(destinationSchoolName.trim().length<3||!recordsReleaseAuthorized))return;
  if(kind==="withdrawal"&&!window.confirm("Request that the school review withdrawal for "+choice.studentName+"? The request does not immediately unenroll the student."))return;
  setError("");
  await mutation.run(async()=>{
   const result=await requestGuardianEnrollmentChange({data:{
    studentPersonId:choice.studentPersonId,programId:choice.programId,kind,reason,
    ...(kind==="transfer"?{
      destinationSchoolName:destinationSchoolName.trim(),recordsReleaseAuthorized,
      ...(destinationSchoolContactEmail.trim()?{destinationSchoolContactEmail:destinationSchoolContactEmail.trim()}:{}),
      ...(intendedLastDay?{intendedLastDay}:{}),
    }:{}),
   }});
   setReason("");setDestinationSchoolName("");setDestinationSchoolContactEmail("");setIntendedLastDay("");setRecordsReleaseAuthorized(false);
  setAttempted(false);
   return result;
  },{successMessage:result=>result.created
    ?"Request sent to the school. Enrollment stays active until the registrar completes the official process."
    :"An open request of this type already exists. The school has your request.",
    commandErrorMessage:"Unable to submit family request"});
 }
 async function requestDestination(item:Case){
   if(busy||item.kind!=="transfer"||item.destinationApplicationId)return;
   const destinationProgramId=destinationChoices[item.id];
   const school=destinations.find(program=>program.id===destinationProgramId);
   if(!school||!destinationConfirmations[item.id])return;
   if(!window.confirm("Send a secure email verification link for "+school.name+"? This requests prospective family application access only; no child record or enrollment is shared."))return;
   setError("");
   await mutation.run(()=>requestTransferDestinationFamilyStart({data:{
       originTransferActionId:item.id,destinationProgramId:school.id,
       requestId:crypto.randomUUID(),confirmedDestination:true,
     }}),{successMessage:result=>result.alreadyHasAccess
       ?"You already have receiving-school account access. Open Apply to school to reuse your verified student's identity and link this transfer."
       :result.requested
       ?"Check your verified family email for a secure sign-in link to "+result.destinationName+". Open it to access the receiving school's application."
       :"A verification link was already requested recently. Check your email before requesting another.",
     commandErrorMessage:"Could not request a receiving-school verification link."});
 }
 const visibleRequests=requests.filter(item=>!selected||item.studentPersonId===selected.split(":")[0]);
 return <WorkspaceShell eyebrow="Family" title="Enrollment and family changes"
   subtitle="Request a withdrawal, transfer or family record correction from your current school. These requests go to the authorized school office; they never automatically remove a student, alter custody or issue a transcript."
   actions={<Link to="/home" search={{student}} className="rounded-lg border px-3 py-2 text-sm">Family home</Link>}>
  {loading&&<p className="mt-6" role="status">Checking verified family enrollment…</p>}
  {error&&<p className="mt-6 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
  <MutationFeedback state={mutation} className="mt-6" pendingMessage="Saving family request..."/>
  {!loading&&choices.length===0&&<p className="mt-6 rounded-lg border p-4 text-sm">No active school enrollment is available for a new request. Contact admissions if your child has already transferred or withdrawn.</p>}
  {choices.length>0&&<form noValidate onSubmit={event=>void submit(event)} className="mt-6 max-w-2xl space-y-4 rounded-xl border bg-card p-5">
   <h2 className="text-lg font-semibold">New request to your school</h2>
   <Field label="Student and school" required>
    <Select
      value={selected} onChange={event=>setSelected(event.target.value)}>
     {choices.map(choice=><option key={choice.studentPersonId+":"+choice.programId}
       value={choice.studentPersonId+":"+choice.programId}>{choice.studentName} · {choice.schoolName}</option>)}
    </Select>
   </Field>
   <Field label="What do you need?">
    <Select
      value={kind} onChange={event=>setKind(event.target.value as Kind)}>
     <option value="withdrawal">Request withdrawal</option>
     <option value="transfer">Request transfer and records coordination</option>
     <option value="family_change">Request family information correction</option>
    </Select>
   </Field>
   {kind==="transfer"&&<fieldset className="space-y-3 rounded-lg border p-4">
    <legend className="px-2 text-sm font-semibold">Destination school coordination</legend>
    <Field label="Destination school name" required
      error={attempted&&destinationSchoolName.trim().length<3?"Enter the destination school's name (at least 3 characters).":undefined}>
      <Input minLength={3} maxLength={160} value={destinationSchoolName}
       onChange={event=>setDestinationSchoolName(event.target.value)}
       placeholder="Name of the school your child will attend"/>
    </Field>
    <Field label="Destination school records contact email (if known)"
      error={attempted&&destinationSchoolContactEmail.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinationSchoolContactEmail.trim())
        ?"Enter a valid email address, or leave this optional field blank.":undefined}>
      <Input type="email" maxLength={254} value={destinationSchoolContactEmail}
       onChange={event=>setDestinationSchoolContactEmail(event.target.value)}
       placeholder="registrar@destination-school.example"/>
    </Field>
    <Field label="Expected last day at current school (if known)">
      <Input type="date" value={intendedLastDay} onChange={event=>setIntendedLastDay(event.target.value)}/>
    </Field>
    <Field label="I authorize my child's current school, through its authorized records office, to release academic records to the named destination school for this transfer. I understand this request does not issue a transcript or enroll my child at the destination."
      required error={attempted&&!recordsReleaseAuthorized?"Authorize records release for the named transfer destination.":undefined}>
      <Checkbox checked={recordsReleaseAuthorized} onChange={event=>setRecordsReleaseAuthorized(event.target.checked)}/>
    </Field>
    <p className="text-xs text-muted-foreground">The records office must verify the recipient and use an approved secure delivery channel. This authorization is tied to the school named above and recorded with your request.</p>
   </fieldset>}
  <Field label="Information for the school office" required
   error={attempted&&reason.trim().length<10?"Enter at least 10 characters describing your request.":undefined}>
   <Textarea minLength={10} maxLength={1500} rows={4}
      value={reason} onChange={event=>setReason(event.target.value)}
    placeholder="What needs to change? Include an intended last school day or destination school when relevant."/>
  </Field>
   <p className="text-xs text-muted-foreground">Do not enter medical details, legal custody documents or payment information here. Send confidential records through the school's authorized process.</p>
   <Button type="submit" disabled={busy}>{busy?"Sending…":"Send request to school"}</Button>
  </form>}
  <section className="mt-8 space-y-3">
   <h2 className="text-lg font-semibold">Your requests and school responses</h2>
   {visibleRequests.map(item=><article key={item.id} className="rounded-lg border bg-card p-4">
    <p className="font-semibold">{item.title} · {item.schoolName}</p>
    <p className="mt-1 text-sm">Status: {item.status.replaceAll("_"," ")} · {new Date(item.createdAt).toLocaleDateString()}</p>
    {item.destinationSchoolName&&<p className="mt-2 text-sm"><strong>Destination:</strong> {item.destinationSchoolName}{item.intendedLastDay?" · Requested last school day "+item.intendedLastDay:""}</p>}
    {item.kind==="transfer"&&<p className="mt-2 text-sm"><strong>Receiving school enrollment:</strong> {item.destinationEnrollmentActivated?
      "Activated in the receiving school's official academic program":
      item.destinationApplicationId?
      "Destination application exists; offer acceptance and actual placement are separate":
      "No linked receiving-school enrollment yet"}</p>}
    {item.kind==="transfer"&&!item.destinationApplicationId&&<div className="mt-3 space-y-3 rounded-lg border p-4 text-sm">
      <p className="font-semibold">Continue at the receiving school</p>
      {item.destinationFamilyStartRequestedAt&&<p className="rounded border p-3 text-sm" role="status">
        Secure sign-in email requested for {item.destinationFamilyStartProgramName??"the receiving school"} on {new Date(item.destinationFamilyStartRequestedAt).toLocaleDateString()}.
        Check your verified email and open its link to start or resume an application. A requested email is not proof of receipt.
      </p>}
      <p>If the destination is a published CAN school, request a secure email verification link. This provides prospective family application access only. The original school handles enrollment exit and records.</p>
      {destinations.length>0&&<>
        <label className="block font-medium">Receiving CAN school
          <select className="mt-1 w-full rounded border bg-background p-3"
            value={destinationChoices[item.id]??""}
            onChange={event=>{
              setDestinationChoices(old=>({...old,[item.id]:event.target.value}));
              setDestinationConfirmations(old=>({...old,[item.id]:false}));
            }}>
            <option value="">Choose a published CAN school</option>
            {destinations.map(program=><option key={program.id} value={program.id}>
              {program.siteName} · {program.name}
            </option>)}
          </select>
        </label>
        {!!destinationChoices[item.id]&&<label className="flex items-start gap-3">
          <input type="checkbox" checked={!!destinationConfirmations[item.id]}
            onChange={event=>setDestinationConfirmations(old=>({...old,[item.id]:event.target.checked}))}
            className="mt-1"/>
          <span>I confirm this is the receiving school I wish to contact. My original transfer request names <strong>{item.destinationSchoolName}</strong>. A different school selection does not change that records-release authorization.</span>
        </label>}
        <button type="button" disabled={busy||!destinationChoices[item.id]||!destinationConfirmations[item.id]}
          onClick={()=>void requestDestination(item)}
          className="rounded bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
          {busy?"Requesting…":"Email a secure receiving-school sign-in link"}
        </button>
      </>}
      <Link to="/launch/family" className="inline-block font-semibold underline">
        Review existing school applications →
      </Link>
      {!destinations.length&&<p className="text-xs text-muted-foreground">No published CAN schools with an active application year are available. Contact the destination school's admissions office or use its official application website.</p>}
    </div>}
    {item.destinationApplicationId&&!item.destinationEnrollmentActivated&&<Link to="/guardian/admission-offers"
      search={{application:item.destinationApplicationId}}
      className="mt-2 inline-block text-xs font-semibold underline">Review receiving-school application and offers →</Link>}
    {item.kind==="transfer"&&<p className="mt-1 text-sm">Academic records: {item.recordsHandoffStatus==="completed"?
      (item.recordsReleasedInternally?
        "Official transcript released inside CAN OS to the authorized receiving school":
        "The originating records office attested external secure delivery; CAN access is not automatic"):
      item.recordsHandoffStatus==="pending"?
      "Origin enrollment exited; verified transcript delivery is still pending":
      "Not yet completed — the origin school must review the transfer"}
    </p>}
    {item.resolutionNote&&<p className="mt-3 text-sm"><strong>School response:</strong> {item.resolutionNote}</p>}
    <p className="mt-2 text-xs text-muted-foreground">Origin-school exit, destination enrollment and transcript release are distinct steps. A completed records handoff reflects a school-recorded secure transfer, not automatic admission or independent delivery verification.</p>
   </article>)}
   {!visibleRequests.length&&!loading&&<p className="rounded-lg border p-4 text-sm">No school change requests are recorded for this family selection.</p>}
  </section>
 </WorkspaceShell>;
}
