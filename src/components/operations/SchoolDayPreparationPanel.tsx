import { OnsiteRoomPlanningPanel } from "./OnsiteRoomPlanningPanel";
import type { getOnsiteSchoolDayPreparation } from "@/modules/operations/onsite-day-preparation.functions";

type Preparation=Awaited<ReturnType<typeof getOnsiteSchoolDayPreparation>>;

/** Preparation and operation share their canonical roster and staffing sources.
 * No future attendance, arrival, release or day-review commands appear here. */
export function SchoolDayPreparationPanel({preparation,onChanged}:{preparation:Preparation;onChanged:()=>void}){
  const students=new Set(preparation.students.map(student=>student.studentProfileId));
  const needingCoverage=preparation.blocks.filter(block=>!block.assignedPlan);
  return <section className="mt-7" aria-label="Prepare the school day">
    <h2 className="font-serif text-2xl font-semibold">Prepare {preparation.date}</h2>
    <p className="mt-2 text-sm text-muted-foreground">Review who is expected, where each Section meets and which adults are planned to supervise. Complete room and adult plans below, then return to Operate today when the day arrives.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <p className="rounded border p-3 text-sm">Expected placed students<strong className="mt-1 block text-2xl">{students.size}</strong></p>
      <p className="rounded border p-3 text-sm">Scheduled instructional blocks<strong className="mt-1 block text-2xl">{preparation.blocks.length}</strong></p>
      <p className="rounded border p-3 text-sm">Blocks needing coverage review<strong className="mt-1 block text-2xl">{needingCoverage.length}</strong></p>
    </div>
    {preparation.projectionTruncated&&<p role="alert" className="mt-3 rounded border p-3 text-sm">The staffing projection is incomplete. These counts cannot establish complete coverage.</p>}
    {preparation.programs.filter(program=>program.configuration!=="configured").map(program=><p key={program.id} role="status" className="mt-3 rounded border p-3 text-sm">
      {program.name}: {program.configuration.replaceAll("_"," ")}. Ask the school registrar to complete the canonical school year, calendar, schedule or placement before relying on this preview.
    </p>)}
    {preparation.unplacedStudents.length>0&&<section className="mt-5 rounded border p-4" aria-label="Students awaiting Section placement">
      <h3 className="font-semibold">Students awaiting Section placement</h3>
      <p className="mt-1 text-sm">These enrolled children are excluded from the supervised attendance roster until placement is completed. Ask the school registrar to place each child.</p>
      <ul className="mt-2 list-inside list-disc text-sm">{preparation.unplacedStudents.map(student=><li key={student.programId+":"+student.studentProfileId}>
        {student.studentName} · {preparation.programs.find(program=>program.id===student.programId)?.name}
      </li>)}</ul>
    </section>}
    <h3 className="mt-6 font-semibold">Scheduled Sections and expected students</h3>
    {!preparation.blocks.length&&<p className="mt-2 text-sm">No instructional blocks were found for this date. Check the calendar and Section schedules; an empty preview does not establish that the school is ready.</p>}
    <div className="mt-3 space-y-3">{preparation.blocks.map(block=>{
      const members=preparation.sectionMemberships.filter(student=>student.sectionId===block.sectionId&&student.programId===block.programId);
      return <article key={block.sectionId+":"+(block.periodId??"missing")} className="rounded-lg border p-4">
        <h4 className="font-semibold">{block.sectionTitle} · {block.periodLabel??"Schedule incomplete"}</h4>
        <p className="mt-1 text-sm">{block.programName} · {block.startsAtLocal??"—"}–{block.endsAtLocal??"—"} · {preparation.timezone}</p>
        <p className="mt-2 text-sm">Primary: {block.facilitatorName??"Assignment needs attention"} · Backup: {block.backupFacilitatorName??"Assignment needs attention"}</p>
        <p className="mt-1 text-sm">Reviewed planned room: {block.roomLabel??"Room plan needs review"}</p>
        {block.gaps.length>0&&<p className="mt-2 text-sm">Needs attention: {block.gaps.map(gap=>gap.replaceAll("_"," ")).join("; ")}</p>}
        <p className="mt-2 text-sm font-semibold">Expected students ({members.length})</p>
        {members.length?<ul className="mt-1 list-inside list-disc text-sm">{members.map(student=><li key={student.studentProfileId}>{student.studentName}</li>)}</ul>:
          <p className="mt-1 text-sm text-muted-foreground">No current enrolled students matched this scheduled Section.</p>}
      </article>;
    })}</div>
    {preparation.programs.filter(program=>preparation.blocks.some(block=>block.programId===program.id&&block.requiresSectionDelegation))
      .map(program=><OnsiteRoomPlanningPanel key={program.id} programId={program.id} initialDate={preparation.date} onChanged={onChanged}/>)}
    <p className="mt-5 text-xs text-muted-foreground">{preparation.note}</p>
  </section>;
}
