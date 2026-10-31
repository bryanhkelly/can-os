import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/workspace";
import {
  getGuardianEnrollmentChangeOptions, listGuardianEnrollmentChanges,
  requestGuardianEnrollmentChange,
} from "@/modules/enrollment/guardian-enrollment-changes.functions";

export const Route = createFileRoute("/guardian/enrollment-changes")({
 validateSearch:(search:Record<string,unknown>):{student?:string}=>({
  student:typeof search.student==="string"?search.student:undefined,
 }),
 component:GuardianEnrollmentChanges,
});

type Choice=Awaited<ReturnType<typeof getGuardianEnrollmentChangeOptions>>[number];
type Case=Awaited<ReturnType<typeof listGuardianEnrollmentChanges>>["items"][number];
type Kind="withdrawal"|"transfer"|"family_change";

function GuardianEnrollmentChanges(){
 const {student}=Route.useSearch();
 const [choices,setChoices]=useState<Choice[]>([]);
 const [requests,setRequests]=useState<Case[]>([]);
 const [selected,setSelected]=useState("");
 const [kind,setKind]=useState<Kind>("withdrawal");
 const [reason,setReason]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [notice,setNotice]=useState(""),[error,setError]=useState("");
 async function refresh(){
  const [options,records]=await Promise.all([
    getGuardianEnrollmentChangeOptions(),
    listGuardianEnrollmentChanges({data:{}}),
  ]);
  setChoices(options);setRequests(records.items);
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
  ]).then(([options,records])=>{
    if(!active)return;
    setChoices(options);setRequests(records.items);
    const first=options.find(choice=>choice.studentPersonId===student)??options[0];
    setSelected(first?first.studentPersonId+":"+first.programId:"");
  }).catch(()=>{if(active)setError("Unable to verify your current family enrollment. Contact admissions.");})
    .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false};
 },[student]);
 async function submit(event:FormEvent){
  event.preventDefault();
  const choice=choices.find(choice=>choice.studentPersonId+":"+choice.programId===selected);
  if(!choice||reason.trim().length<10||busy)return;
  if(kind==="withdrawal"&&!window.confirm("Request that the school review withdrawal for "+choice.studentName+"? The request does not immediately unenroll the student."))return;
  setBusy(true);setNotice("");setError("");
  try{
   const result=await requestGuardianEnrollmentChange({data:{
    studentPersonId:choice.studentPersonId,programId:choice.programId,kind,reason,
   }});
   setNotice(result.created
    ?"Request sent to the school. Enrollment stays active until the registrar completes the official process."
    :"An open request of this type already exists. The school has your request.");
   setReason("");
   try{await refresh();}
   catch{setError("Request saved, but its updated status could not be loaded. Reopen this page before submitting again.");}
  }catch(e){setError(e instanceof Error?e.message:"Unable to submit family request");}
  finally{setBusy(false);}
 }
 const visibleRequests=requests.filter(item=>!selected||item.studentPersonId===selected.split(":")[0]);
 return <WorkspaceShell eyebrow="CAN OS · Family" title="Enrollment and family changes"
   subtitle="Request a withdrawal, transfer or family record correction from your current school. These requests go to the authorized school office; they never automatically remove a student, alter custody or issue a transcript."
   actions={<Link to="/guardian" search={{student}} className="rounded-lg border px-3 py-2 text-sm">Family home</Link>}>
  {loading&&<p className="mt-6" role="status">Checking verified family enrollment…</p>}
  {error&&<p className="mt-6 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
  {notice&&<p className="mt-6 rounded-lg border p-4 text-sm" role="status">{notice}</p>}
  {!loading&&choices.length===0&&<p className="mt-6 rounded-lg border p-4 text-sm">No active school enrollment is available for a new request. Contact admissions if your child has already transferred or withdrawn.</p>}
  {choices.length>0&&<form onSubmit={event=>void submit(event)} className="mt-6 max-w-2xl space-y-4 rounded-xl border bg-card p-5">
   <h2 className="text-lg font-semibold">New request to your school</h2>
   <label className="block text-sm font-medium">Student and school
    <select required className="mt-1 w-full rounded-lg border bg-background p-3"
      value={selected} onChange={event=>setSelected(event.target.value)}>
     {choices.map(choice=><option key={choice.studentPersonId+":"+choice.programId}
       value={choice.studentPersonId+":"+choice.programId}>{choice.studentName} · {choice.schoolName}</option>)}
    </select>
   </label>
   <label className="block text-sm font-medium">What do you need?
    <select className="mt-1 w-full rounded-lg border bg-background p-3"
      value={kind} onChange={event=>setKind(event.target.value as Kind)}>
     <option value="withdrawal">Request withdrawal</option>
     <option value="transfer">Request transfer and records coordination</option>
     <option value="family_change">Request family information correction</option>
    </select>
   </label>
   <label className="block text-sm font-medium">Information for the school office
    <textarea required minLength={10} maxLength={1500} rows={4}
      value={reason} onChange={event=>setReason(event.target.value)}
      placeholder="What needs to change? Include an intended last school day or destination school when relevant."
      className="mt-1 w-full rounded-lg border bg-background p-3"/>
   </label>
   <p className="text-xs text-muted-foreground">Do not enter medical details, legal custody documents or payment information here. Send confidential records through the school's authorized process.</p>
   <button type="submit" disabled={busy||reason.trim().length<10}
     className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">{busy?"Sending…":"Send request to school"}</button>
  </form>}
  <section className="mt-8 space-y-3">
   <h2 className="text-lg font-semibold">Your requests and school responses</h2>
   {visibleRequests.map(item=><article key={item.id} className="rounded-lg border bg-card p-4">
    <p className="font-semibold">{item.title} · {item.schoolName}</p>
    <p className="mt-1 text-sm">Status: {item.status.replaceAll("_"," ")} · {new Date(item.createdAt).toLocaleDateString()}</p>
    {item.resolutionNote&&<p className="mt-3 text-sm"><strong>School response:</strong> {item.resolutionNote}</p>}
    <p className="mt-2 text-xs text-muted-foreground">A closed request does not itself confirm that enrollment or academic records changed. Confirm with the school.</p>
   </article>)}
   {!visibleRequests.length&&!loading&&<p className="rounded-lg border p-4 text-sm">No school change requests are recorded for this family selection.</p>}
  </section>
 </WorkspaceShell>;
}
