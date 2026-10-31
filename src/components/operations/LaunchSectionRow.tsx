import { useState } from "react";
import type { getLaunchAcademicSetup } from "@/modules/programs/launch-academics.functions";
type Snapshot = Awaited<ReturnType<typeof getLaunchAcademicSetup>>;

export function LaunchSectionRow({section,staff,busy,authority,assign,saveCredits}:{
 section:Snapshot["sections"][number],staff:Snapshot["teachingStaff"],busy:boolean,
 authority:Snapshot["academicAuthority"],
 assign:(personId:string)=>Promise<void>,
 saveCredits:(credits:number,reason:string)=>Promise<void>
}){
 const [personId,setPersonId]=useState("");
 const [credits,setCredits]=useState(section.creditUnits?.toString()??"");
 const [creditReason,setCreditReason]=useState("");
 const candidate=section.candidates.find(candidate=>candidate.personId===personId);
 return <article className="rounded-lg border bg-card p-4">
  <h3 className="font-semibold">{section.title} · {section.code}</h3>
  <p className="mt-2 text-xs text-muted-foreground">
   {section.teachers.length?section.teachers.map(t=>t.first+" "+t.last).join(", "):"Instructor not yet assigned"}
  </p>
  <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={e=>{
    e.preventDefault();void saveCredits(Number(credits),creditReason);
   }}>
    <label className="text-xs">Recorded credit units
     <input type="number" min="0.01" max="10" step="0.01" required value={credits} disabled={!authority.creditConfiguration}
      onChange={e=>setCredits(e.target.value)} className="mt-1 w-full rounded border bg-background p-2 disabled:opacity-50"/>
    </label>
    <label className="text-xs">Reason for academic credit decision
     <input value={creditReason} minLength={5} maxLength={500} required disabled={!authority.creditConfiguration}
      onChange={e=>setCreditReason(e.target.value)}
      placeholder="Reviewed against this program's course credit requirements"
      className="mt-1 w-full rounded border bg-background p-2 disabled:opacity-50"/>
    </label>
    <button type="submit" disabled={busy||!authority.creditConfiguration||!credits||creditReason.trim().length<5}
      className="rounded border px-3 py-2 text-xs disabled:opacity-50">Record credits</button>
   </form>
   <p className="mt-2 text-xs text-muted-foreground">The school sets actual credit units. Changes are audited and locked after finalized grades.</p>
   <div className="mt-3 grid gap-2 sm:grid-cols-4">
   <div className="rounded border p-2 text-xs"><span className="text-muted-foreground">Enrollment</span><br/>{section.readiness.metrics.activeEnrollment}/{section.readiness.metrics.enrollmentCapacity}</div>
   <div className="rounded border p-2 text-xs"><span className="text-muted-foreground">Forecast</span><br/>{section.readiness.metrics.expectedDemand??"Not set"}</div>
   <div className="rounded border p-2 text-xs"><span className="text-muted-foreground">Reserved seats</span><br/>{section.readiness.metrics.reservedInstructionalSeats}</div>
   <div className="rounded border p-2 text-xs"><span className="text-muted-foreground">Readiness</span><br/>{section.readiness.ready?"Ready":"Needs attention"}</div>
  </div>
  <div className="mt-3 flex flex-wrap gap-2">
   {section.readiness.items.filter(item=>item.state!=="ready").map(item=>
    <span key={item.key} className="rounded border px-2 py-1 text-xs">
     {item.state==="blocked"?"Blocked":"Review"} · {item.message}
    </span>)}
  </div>
  <section className="mt-4 rounded-lg border p-3" aria-label={"First week readiness for "+section.title}>
   <h3 className="text-sm font-semibold">First week: {section.classroom.ready?"ready to teach and learn":"setup incomplete"}</h3>
   <p className="mt-1 text-xs text-muted-foreground">Readiness comes from the pinned lesson, published instructed assessment, independently qualified coverage and live class membership.</p>
   {section.classroom.ready?<p className="mt-2 text-sm">Start with “{section.classroom.firstWeek.lesson!.title}”, then assign “{section.classroom.firstWeek.assessment!.title}” to {section.classroom.activeStudentCount} enrolled {section.classroom.activeStudentCount===1?"student":"students"}.</p>:
    <ul className="mt-2 list-inside list-disc space-y-1 text-xs">{section.classroom.blockers.map(item=><li key={item.key}>{item.message}</li>)}</ul>}
  </section>
  <div className="mt-3 flex flex-wrap items-end gap-2">
   <label className="min-w-48 flex-1 text-xs">Assign instructor<select className="mt-1 block w-full rounded border bg-background p-2 disabled:opacity-50" value={personId} disabled={!authority.teacherAssignment} onChange={e=>setPersonId(e.target.value)}>
    <option value="">Choose teacher</option>{staff.filter(t=>!section.teachers.some(a=>a.personId===t.personId))
      .map(t=><option key={t.personId} value={t.personId}>{t.first} {t.last}</option>)}
   </select></label>
   <button type="button" disabled={busy||!authority.teacherAssignment||!section.active||!personId||!candidate?.eligible} onClick={()=>assign(personId)}
    className="rounded border px-3 py-2 text-sm disabled:opacity-50">Add instructor</button>
  </div>
  {candidate&&<div className="mt-3 text-sm" role="status">
   <p>Instructional coverage: {candidate.from} to {candidate.through} (end exclusive).</p>
   {candidate.eligible?<p>Eligible for this instructional window. Existing co-teachers retain their assignments.</p>:
    <ul className="list-inside list-disc">{candidate.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
  </div>}
 </article>;
}

