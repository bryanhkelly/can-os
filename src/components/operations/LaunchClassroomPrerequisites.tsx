import { Link } from "@tanstack/react-router";
import type { getLaunchAcademicSetup } from "@/modules/programs/launch-academics.functions";

type Snapshot=Awaited<ReturnType<typeof getLaunchAcademicSetup>>;

/** Read-only classroom prerequisites from an authorized academic snapshot.
 * A satisfied checklist is not Site opening or enrollment authorization.
 */
export function LaunchClassroomPrerequisites({
  data, schoolYearId,
}: {
  data: Snapshot;
  schoolYearId?: string;
}) {
  return <section className="mt-6  border p-4 text-sm" aria-label="Classroom setup guidance">
   <h2 className="font-semibold">Classroom setup prerequisites</h2>
   <ul className="mt-2 list-disc space-y-2 pl-5">
    {!data.terms.length&&<li>Prepare an academic year and its terms using the recommended-year action above.</li>}
    {!data.scheduleOptions.some(option=>option.schoolYearId===schoolYearId)&&<li>No instructional schedule exists for the selected year. <Link to="/operations/school-years" search={{siteId:data.program.siteId??undefined,programId:data.program.id}} className="underline">Configure and review a school-year schedule</Link>.</li>}
    {!data.catalog.some(course=>course.recommendation.recommended)&&<li>No available published course has an accessible first lesson. <Link to="/operations/curriculum" className="underline">Review and publish instruction-ready curriculum</Link>.</li>}
    {!data.teachingStaff.length&&<li>No eligible instructor is assigned to this school. Ask your CAN academic staffing administrator to assign a teacher to this Program, then refresh this workspace. The teacher must submit qualification evidence from their profile for independent review.</li>}
    {!data.academicAuthority.teacherAssignment&&<li>Complete institutional instructional service authorization before assigning teachers.</li>}
    {data.terms.length>0&&data.scheduleOptions.some(option=>option.schoolYearId===schoolYearId)&&data.catalog.some(course=>course.recommendation.recommended)&&data.teachingStaff.length>0&&data.academicAuthority.teacherAssignment&&<li>Reviewed choices are available. The recommended course and a matching schedule are preselected; a sole authorized instructor is suggested but must be reviewed.</li>}
   </ul>
  </section>;
}
