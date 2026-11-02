import { getCapacityCandidates, swapCommittedInstructor } from "@/modules/staffing/educational-capacity.functions";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "@tanstack/react-router";
import {useMutationFeedback, type MutationOutcome} from "@/lib/mutation-feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import {
 getSectionLifecycle,setSectionLifecycleState,updateSectionLifecycleSchedule,replaceLifecycleTeacher,
 transitionLifecycleEnrollment,queueLifecycleWaitlist,resolveLifecycleWaitlist,transferLifecycleEnrollment,promoteLifecycleWaitlist,offerLifecycleWaitlistSeat
} from "@/modules/programs/section-lifecycle.functions";
type Snapshot=Awaited<ReturnType<typeof getSectionLifecycle>>;
type LifecycleRun = (id:string, operation:()=>Promise<unknown>, success:string,
 onReconciled?:()=>void)=>Promise<MutationOutcome<unknown>>;
export function SectionLifecycleWorkspace({programId,staff}:{programId:string;staff:{personId:string;first:string;last:string}[]}){
 const [sections,setSections]=useState<Snapshot>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const reload=async()=>setSections(await getSectionLifecycle({data:{programId}}));
 useEffect(()=>{
  let active=true;
  getSectionLifecycle({data:{programId}}).then(rows=>{if(active)setSections(rows)})
   .catch(()=>{if(active)setError("Unable to load lifecycle records.")})
   .finally(()=>{if(active)setLoading(false)});
  return ()=>{active=false};
 },[programId]);
 return <div>{loading?<p className="mt-6 text-sm">Loading operational lifecycle…</p>:error?
  <p role="alert" className="mt-6 text-sm">{error}</p>:
  <SectionLifecycleManager sections={sections} staff={staff} onChanged={reload}/>}</div>;
}
export function SectionLifecycleManager({sections,staff,onChanged}:{sections:Snapshot;staff:{personId:string;first:string;last:string}[];onChanged:()=>Promise<void>}){
 const router=useRouter();
 const mutation=useMutationFeedback(async()=>{await onChanged();await router.invalidate();});
 const busy=mutation.pending||mutation.refreshFailed;
 const [reason,setReason]=useState("");
 const [validationError,setValidationError]=useState("");
 const resetSavedDraft=useRef<(()=>void)|undefined>(undefined);
 async function retryRefresh(){
  const outcome=await mutation.retryRefresh();
  if(outcome.status==="refreshed"){
   setReason("");
   resetSavedDraft.current?.();
   resetSavedDraft.current=undefined;
  }
  return outcome;
 }
 const run:LifecycleRun=async(id,operation,success,onReconciled)=>{
  void id;
  if(reason.trim().length<5){
   const error=new Error("Provide an explanation (at least 5 characters) for the operational record.");
   setValidationError(error.message);
   return {status:"failed",error};
  }
  setValidationError("");
  const result=await mutation.run(operation,{successMessage:success,commandErrorMessage:"Lifecycle change failed."});
  if(result.status==="saved"){setReason("");onReconciled?.();}
  else if(result.status==="refresh-failed")resetSavedDraft.current=onReconciled;
  return result;
 }
 return <section className="mt-9 space-y-4" aria-label="Operational lifecycle">
  <h2 className="font-serif text-2xl">School operations · lifecycle management</h2>
  <p className="text-sm text-muted-foreground">Manage staffing transitions, schedule corrections, section closure and enrollment exceptions. Every change is audited. Sections cannot close with active students or reserved instruction.</p>
  <MutationFeedback state={{...mutation,retryRefresh}} pendingMessage="Saving lifecycle change..."/>
  <fieldset disabled={busy} aria-busy={mutation.pending} className="space-y-4">
  <Field label="Reason for operational change" error={validationError}>
   <Textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} maxLength={1000}
    placeholder="Document the decision and any necessary student/teacher follow-up"/>
  </Field>
  {sections.map(section=><LifecycleSection key={section.id} section={section} staff={staff}
   busy={busy} reason={reason} allSections={sections} run={run}/>)}
  </fieldset>
 </section>;
}
function LifecycleSection({section,staff,busy,reason,allSections,run}:{
 section:Snapshot[number];staff:{personId:string;first:string;last:string}[];
 busy:boolean;reason:string;allSections:Snapshot;run:LifecycleRun
}){
 const [newTeacher,setNewTeacher]=useState("");
 const [outgoing,setOutgoing]=useState("");
 const [student,setStudent]=useState("");
 const [start,setStart]=useState(section.startsAt?.slice(0,16)??"");
 const [end,setEnd]=useState(section.endsAt?.slice(0,16)??"");
 const [schedule,setSchedule]=useState(section.scheduleTemplateId??"");
 const [enrollmentId,setEnrollmentId]=useState("");
 const [destination,setDestination]=useState("");
 const destinations=allSections.filter(candidate=>candidate.id!==section.id&&candidate.active&&
   candidate.programId===section.programId&&candidate.termId===section.termId);
 const selectedDestination=destinations.some(candidate=>candidate.id===destination)?destination:"";
 const [enrollmentStatus,setEnrollmentStatus]=useState<"withdrawn"|"transferred">("withdrawn");
 return <article className="rounded-xl border bg-card p-5">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h3 className="font-semibold">{section.title} · {section.code}</h3>
   <span className="rounded-full border px-3 py-1 text-xs">{section.active?"Active":"Closed"}</span>
  </div>
  <p className="mt-2 text-xs text-muted-foreground">
   {section.students.length} active section enrollments · {section.teachers.length} instructors · {section.waitlist.length} waiting · {section.allocations.filter(a=>a.status==="held"||a.status==="committed").length} live capacity reservations
  </p>
  <div className="mt-4 grid gap-3 md:grid-cols-2">
   <div className="rounded-lg border p-3">
    <h4 className="font-semibold text-sm">Instructor replacement</h4>
    <Field className="mt-2" label="Outgoing teacher">
     <Select value={outgoing} onChange={e=>setOutgoing(e.target.value)}>
      <option value="">Select outgoing instructor</option>
      {section.teachers.map(t=><option key={t.personId} value={t.personId}>{staff.find(p=>p.personId===t.personId)?.first??t.personId} {staff.find(p=>p.personId===t.personId)?.last??""}</option>)}
     </Select>
    </Field>
    <Field className="mt-2" label="Replacement teacher">
     <Select value={newTeacher} onChange={e=>setNewTeacher(e.target.value)}>
      <option value="">Select replacement</option>
      {staff.filter(p=>!section.teachers.some(t=>t.personId===p.personId)).map(p=><option key={p.personId} value={p.personId}>{p.first} {p.last}</option>)}
     </Select>
    </Field>
    <CapacityReplacement section={section} reason={reason} busy={busy} run={run}/>
    <Button variant="outline" size="sm" disabled={busy||!section.active||!outgoing||!newTeacher}
     onClick={()=>void run(section.id,()=>replaceLifecycleTeacher({data:{sectionId:section.id,oldPersonId:outgoing,newPersonId:newTeacher,reason}}),"Instructor replacement recorded.")}
     className="mt-3">Replace instructor</Button>
   </div>
   <div className="rounded-lg border p-3">
    <h4 className="font-semibold text-sm">Schedule changes</h4>
    <Field className="mt-2" label="Start"><Input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></Field>
    <Field className="mt-2" label="End"><Input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></Field>
    <Field className="mt-2" label="School bell schedule">
     <Select value={schedule} onChange={e=>setSchedule(e.target.value)}>
      <option value="">No bell schedule</option>
      {section.scheduleOptions.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
     </Select>
    </Field>
    <div className="mt-3 rounded border bg-muted p-2 text-xs">
     <strong>Schedule impact preview:</strong> {section.students.length} active enrollments,
     {" "}{section.teachers.length} assigned instructors and
     {" "}{section.allocations.filter(a=>a.status==="held"||a.status==="committed").length} active capacity allocations.
     Calendar and attendance obligations should be reviewed before confirming.
    </div>
    <Button variant="outline" size="sm" disabled={busy||!section.active} onClick={()=>void run(section.id,
      ()=>updateSectionLifecycleSchedule({data:{sectionId:section.id,scheduleTemplateId:schedule||null,
        startsAt:start?new Date(start).toISOString():null,endsAt:end?new Date(end).toISOString():null,reason}}),
      "Schedule updated.")} className="mt-3">Save schedule</Button>
   </div>
   <div className="rounded-lg border p-3">
    <h4 className="font-semibold text-sm">Enrollment transition</h4>
    <Field className="mt-2" label="Enrolled student ID">
      <Select value={enrollmentId} onChange={e=>setEnrollmentId(e.target.value)}>
       <option value="">Choose enrollment</option>
       {section.students.map(e=><option key={e.id} value={e.id}>{e.studentProfileId}</option>)}
      </Select>
    </Field>
    <Field className="mt-2" label="Outcome">
     <Select value={enrollmentStatus} onChange={e=>setEnrollmentStatus(e.target.value as "withdrawn"|"transferred")}>
      <option value="withdrawn">Withdrawn</option><option value="transferred">Transferred</option>
     </Select>
    </Field>
    <Field className="mt-2" label="Transfer destination (same program and term)">
      <Select value={selectedDestination} onChange={e=>setDestination(e.target.value)}>
       <option value="">Choose destination</option>
       {destinations.map(x=><option key={x.id} value={x.id}>{x.title} · {x.code}</option>)}
      </Select>
    </Field>
    {!destinations.length&&<p className="mt-2 text-xs text-muted-foreground">No other active section is available in this program and term.</p>}
    <Button variant="outline" size="sm" disabled={busy||!enrollmentId||!selectedDestination} onClick={()=>void run(section.id,
      ()=>transferLifecycleEnrollment({data:{enrollmentId,destinationSectionId:selectedDestination,reason}}),"Student transferred atomically.")}
      className="mt-2">Transfer student</Button>
    <Button variant="outline" size="sm" disabled={busy||!enrollmentId} onClick={()=>void run(section.id,
      ()=>transitionLifecycleEnrollment({data:{enrollmentId,status:enrollmentStatus,reason}}),"Enrollment status updated.")}
      className="mt-3">Record transition</Button>
   </div>
   <div className="rounded-lg border p-3">
    <h4 className="font-semibold text-sm">Waitlist and closure</h4>
    <Field className="mt-2" label="Student profile ID for waitlist">
     <Input value={student} onChange={e=>setStudent(e.target.value)} placeholder="Student UUID"/>
    </Field>
    <Button variant="outline" size="sm" disabled={busy||!section.active||!student} onClick={()=>void run(section.id,
      ()=>queueLifecycleWaitlist({data:{sectionId:section.id,studentProfileId:student,reason}}),"Student placed on waitlist.")}
      className="mt-2">Add to waitlist</Button>
    {section.waitlist.map(w=><div key={w.id} className="mt-2 flex justify-between gap-2 rounded border p-2 text-xs">
     <span>{w.subjectId} · {w.status}</span>
     {w.status!=="in_progress"&&<Button variant="ghost" size="sm" disabled={busy} onClick={()=>void run(section.id,
       ()=>offerLifecycleWaitlistSeat({data:{actionId:w.id,expiresAt:new Date(Date.now()+3*86400000).toISOString()}}),
       "A three-day waitlist offer was recorded.")}>Offer seat</Button>}
     <Button variant="ghost" size="sm" disabled={busy} onClick={()=>void run(section.id,
       ()=>promoteLifecycleWaitlist({data:{actionId:w.id}}),"Waitlisted student enrolled.")}>Promote</Button><Button variant="ghost" size="sm" disabled={busy} onClick={()=>void run(section.id,
       ()=>resolveLifecycleWaitlist({data:{actionId:w.id,reason}}),"Waitlist item resolved.")}>Resolve</Button>
    </div>)}
    <Button variant={section.active?"destructive":"outline"} size="sm" disabled={busy} onClick={()=>void run(section.id,
     ()=>setSectionLifecycleState({data:{sectionId:section.id,active:!section.active,reason}}),
     section.active?"Section closed.":"Section reopened.")}
     className="mt-4">
     {section.active?"Close section":"Reopen section"}
    </Button>
   </div>
  </div>
 </article>;
}

function CapacityReplacement({section,reason,busy,run}:{section:Snapshot[number];reason:string;busy:boolean;run:LifecycleRun}){
 const [reservationId,setReservationId]=useState("");
 const [offeringId,setOfferingId]=useState("");
 const [candidates,setCandidates]=useState<Awaited<ReturnType<typeof getCapacityCandidates>>>([]);
 useEffect(()=>{
  let alive=true;
  if(!section.demandId)return;
  getCapacityCandidates({data:{demandId:section.demandId}}).then(rows=>{if(alive)setCandidates(rows)}).catch(()=>{if(alive)setCandidates([])});
  return()=>{alive=false};
 },[section.demandId]);
 const reservations=section.allocations.filter(a=>a.status==="committed");
 if(!section.demandId||!reservations.length)return null;
 return <div className="mt-4 rounded-lg border p-3">
  <h4 className="text-sm font-semibold">Replace a committed network instructor</h4>
  <p className="mt-1 text-xs text-muted-foreground">Choose an existing committed allocation and a compatible instructor offering. The replacement and release happen together.</p>
  <Field className="mt-2" label="Existing allocation">
   <Select value={reservationId} onChange={e=>setReservationId(e.target.value)}>
    <option value="">Select allocation</option>
    {reservations.map(r=><option key={r.id} value={r.id}>{r.offeringId}</option>)}
   </Select>
  </Field>
  <Field className="mt-2" label="Available replacement instructor">
   <Select value={offeringId} onChange={e=>setOfferingId(e.target.value)}>
    <option value="">Choose compatible capacity</option>
    {candidates.map(c=><option key={c.offeringId} value={c.offeringId}>{c.instructorName} · {c.remainingSeats} seats</option>)}
   </Select>
  </Field>
  <Button variant="outline" size="sm" disabled={busy||!reservationId||!offeringId||reason.trim().length<5}
    className="mt-3" onClick={()=>void run(section.id,
     ()=>swapCommittedInstructor({data:{reservationId,replacementOfferingId:offeringId,reason}}),
     "Instructor replacement recorded.",()=>{setReservationId("");setOfferingId("");}
    )}>Commit replacement</Button>
 </div>;
}
