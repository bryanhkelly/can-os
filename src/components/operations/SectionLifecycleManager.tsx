import {useState} from "react";
import {useRouter} from "@tanstack/react-router";
import {
 getSectionLifecycle,setSectionLifecycleState,updateSectionLifecycleSchedule,replaceLifecycleTeacher,
 transitionLifecycleEnrollment,queueLifecycleWaitlist,resolveLifecycleWaitlist
} from "@/modules/programs/section-lifecycle.functions";
type Snapshot=Awaited<ReturnType<typeof getSectionLifecycle>>;
export function SectionLifecycleManager({sections,staff}:{sections:Snapshot;staff:{personId:string;first:string;last:string}[]}){
 const router=useRouter();
 const [reason,setReason]=useState("");
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 async function run(id:string,operation:()=>Promise<unknown>,success:string){
  if(reason.trim().length<5){setError("Provide an explanation (at least 5 characters) for the operational record.");return;}
  setBusy(id);setError("");setMessage("");
  try{await operation();await router.invalidate();setMessage(success);setReason("");}
  catch(e){setError(e instanceof Error?e.message:"Lifecycle change failed");}
  finally{setBusy("");}
 }
 return <section className="mt-9 space-y-4" aria-label="Operational lifecycle">
  <h2 className="font-serif text-2xl">School operations · lifecycle management</h2>
  <p className="text-sm text-muted-foreground">Manage staffing transitions, schedule corrections, section closure and enrollment exceptions. Every change is audited. Sections cannot close with active students or reserved instruction.</p>
  <label className="block text-sm">Reason for operational change
   <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} maxLength={1000}
    placeholder="Document the decision and any necessary student/teacher follow-up"
    className="mt-1 block w-full rounded border bg-background p-2"/>
  </label>
  {error&&<p role="alert" className="rounded border p-3 text-sm text-red-600">{error}</p>}
  {message&&<p role="status" className="rounded border p-3 text-sm">{message}</p>}
  {sections.map(section=><LifecycleSection key={section.id} section={section} staff={staff}
   busy={Boolean(busy)} reason={reason} run={run}/>)}
 </section>;
}
function LifecycleSection({section,staff,busy,reason,run}:{
 section:Snapshot[number];staff:{personId:string;first:string;last:string}[];
 busy:boolean;reason:string;run:(id:string,operation:()=>Promise<unknown>,success:string)=>Promise<void>
}){
 const [newTeacher,setNewTeacher]=useState("");
 const [outgoing,setOutgoing]=useState("");
 const [student,setStudent]=useState("");
 const [start,setStart]=useState(section.startsAt?.slice(0,16)??"");
 const [end,setEnd]=useState(section.endsAt?.slice(0,16)??"");
 const [schedule,setSchedule]=useState(section.scheduleTemplateId??"");
 const [enrollmentId,setEnrollmentId]=useState("");
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
    <label className="mt-2 block text-xs">Outgoing teacher
     <select value={outgoing} onChange={e=>setOutgoing(e.target.value)} className="mt-1 w-full rounded border bg-background p-2">
      <option value="">Select outgoing instructor</option>
      {section.teachers.map(t=><option key={t.personId} value={t.personId}>{staff.find(p=>p.personId===t.personId)?.first??t.personId} {staff.find(p=>p.personId===t.personId)?.last??""}</option>)}
     </select>
    </label>
    <label className="mt-2 block text-xs">Replacement teacher
     <select value={newTeacher} onChange={e=>setNewTeacher(e.target.value)} className="mt-1 w-full rounded border bg-background p-2">
      <option value="">Select replacement</option>
      {staff.filter(p=>!section.teachers.some(t=>t.personId===p.personId)).map(p=><option key={p.personId} value={p.personId}>{p.first} {p.last}</option>)}
     </select>
    </label>
    <button type="button" disabled={busy||!section.active||!outgoing||!newTeacher}
     onClick={()=>void run(section.id,()=>replaceLifecycleTeacher({data:{sectionId:section.id,oldPersonId:outgoing,newPersonId:newTeacher,reason}}),"Instructor replacement recorded.")}
     className="mt-3 rounded border px-3 py-2 text-xs disabled:opacity-50">Replace instructor</button>
   </div>
   <div className="rounded-lg border p-3">
    <h4 className="font-semibold text-sm">Schedule changes</h4>
    <label className="mt-2 block text-xs">Start <input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}
      className="mt-1 w-full rounded border bg-background p-2"/></label>
    <label className="mt-2 block text-xs">End <input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}
      className="mt-1 w-full rounded border bg-background p-2"/></label>
    <label className="mt-2 block text-xs">Schedule template ID (optional)
     <input value={schedule} onChange={e=>setSchedule(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/>
    </label>
    <button type="button" disabled={busy||!section.active} onClick={()=>void run(section.id,
      ()=>updateSectionLifecycleSchedule({data:{sectionId:section.id,scheduleTemplateId:schedule||null,
        startsAt:start?new Date(start).toISOString():null,endsAt:end?new Date(end).toISOString():null,reason}}),
      "Schedule updated.")} className="mt-3 rounded border px-3 py-2 text-xs disabled:opacity-50">Save schedule</button>
   </div>
   <div className="rounded-lg border p-3">
    <h4 className="font-semibold text-sm">Enrollment transition</h4>
    <label className="mt-2 block text-xs">Enrolled student ID
      <select value={enrollmentId} onChange={e=>setEnrollmentId(e.target.value)} className="mt-1 w-full rounded border bg-background p-2">
       <option value="">Choose enrollment</option>
       {section.students.map(e=><option key={e.id} value={e.id}>{e.studentProfileId}</option>)}
      </select>
    </label>
    <label className="mt-2 block text-xs">Outcome
     <select value={enrollmentStatus} onChange={e=>setEnrollmentStatus(e.target.value as "withdrawn"|"transferred")} className="mt-1 w-full rounded border bg-background p-2">
      <option value="withdrawn">Withdrawn</option><option value="transferred">Transferred</option>
     </select>
    </label>
    <button type="button" disabled={busy||!enrollmentId} onClick={()=>void run(section.id,
      ()=>transitionLifecycleEnrollment({data:{enrollmentId,status:enrollmentStatus,reason}}),"Enrollment status updated.")}
      className="mt-3 rounded border px-3 py-2 text-xs disabled:opacity-50">Record transition</button>
   </div>
   <div className="rounded-lg border p-3">
    <h4 className="font-semibold text-sm">Waitlist and closure</h4>
    <label className="mt-2 block text-xs">Student profile ID for waitlist
     <input value={student} onChange={e=>setStudent(e.target.value)} placeholder="Student UUID"
       className="mt-1 w-full rounded border bg-background p-2"/>
    </label>
    <button type="button" disabled={busy||!section.active||!student} onClick={()=>void run(section.id,
      ()=>queueLifecycleWaitlist({data:{sectionId:section.id,studentProfileId:student,reason}}),"Student placed on waitlist.")}
      className="mt-2 rounded border px-3 py-2 text-xs disabled:opacity-50">Add to waitlist</button>
    {section.waitlist.map(w=><div key={w.id} className="mt-2 flex justify-between gap-2 rounded border p-2 text-xs">
     <span>{w.subjectId}</span><button disabled={busy} onClick={()=>void run(section.id,
       ()=>resolveLifecycleWaitlist({data:{actionId:w.id,reason}}),"Waitlist item resolved.")} className="underline">Resolve</button>
    </div>)}
    <button type="button" disabled={busy} onClick={()=>void run(section.id,
     ()=>setSectionLifecycleState({data:{sectionId:section.id,active:!section.active,reason}}),
     section.active?"Section closed.":"Section reopened.")}
     className="mt-4 block rounded border border-amber-500 px-3 py-2 text-xs disabled:opacity-50">
     {section.active?"Close section":"Reopen section"}
    </button>
   </div>
  </div>
 </article>;
}
