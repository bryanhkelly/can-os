import { Link } from "@tanstack/react-router";
import { QueryState, StatCard } from "@/components/workspace";
import { plural } from "@/lib/format";
import type { getLiveFullFlowOperations } from "@/modules/operations/command-center.functions";

type FullFlow = Awaited<ReturnType<typeof getLiveFullFlowOperations>>;

/** Reusable read-only institutional operating record. Counts reflect the
 * authorized source and are not enrollment, opening or safeguarding approvals.
 * All decisions and mutations remain in their canonical workspaces.
 */
export function FullFlowOperationalRecord({
  record, onRetry,
}: {
  record: FullFlow | null;
  onRetry: () => void;
}) {
  const dashboardData = record;
  const retrySupplementaryReads = onRetry;
  return <section className="mt-7  border bg-card p-5" aria-label="FullFlow operational record">
   <h2 className="font-serif text-2xl">Connected school operational record</h2>
   <p className="mt-2 text-sm text-muted-foreground">Live records from the same authorized school programs, curriculum releases, enrollments, classrooms, grades and guardian follow-ups. Numbers are not simulated readiness approvals.</p>
  {dashboardData===null ? <QueryState error="The connected school record could not be loaded. Launch and grading status cannot be verified from this screen." onRetry={retrySupplementaryReads}/> : <>
   <p className="mt-2 text-xs text-muted-foreground">Refreshed {new Date(dashboardData.asOf).toLocaleString()}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-5">
       {[["Active students",dashboardData.totals.activeProgramStudents],
         ["Awaiting class placement",dashboardData.programs.reduce((sum,p)=>sum+Math.max(0,p.counts.activeProgramStudents-p.counts.placedStudents),0)],
         ["Class placements",dashboardData.totals.placedStudents],
         ["Graded submissions",dashboardData.totals.gradedWork],
         ["Guardian questions open",dashboardData.totals.unresolvedGuardianResponses]]
       .map(([label,value])=><StatCard key={label} label={String(label)} value={value}/>)}
    </div>
    <div className="mt-5 space-y-4">
    {dashboardData.programs.map(program=><article key={program.id} className=" border p-4">
      <div id={`academic-activity-${program.id}`} className="scroll-mt-6" />
      <div className="flex flex-wrap items-center justify-between gap-2">
       <h3 className="font-semibold">{program.name} <span className="text-xs font-normal text-muted-foreground">· {program.status.replaceAll("_"," ")} · {program.type.replaceAll("_"," ")}</span></h3>
       <Link className="text-sm underline" to="/launch/school/$programId" params={{programId:program.id}} search={{siteId:undefined,programId:undefined}}>Review program →</Link>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
       <div><dt className="text-xs text-muted-foreground">Curriculum &amp; teaching</dt>
        <dd>{program.counts.adoptedCurriculumPacks} adopted packs · {program.counts.publishedSections} published sections · {program.counts.staffedSections}/{program.counts.sections} staffed sections</dd></div>
       <div><dt className="text-xs text-muted-foreground">Admissions &amp; enrollment</dt>
        <dd>{program.counts.applications} applications · {program.counts.acceptedApplications} accepted · {program.counts.activeProgramStudents} active students · {program.counts.placedStudents} class placements</dd>
        {program.counts.activeProgramStudents>program.counts.placedStudents&&<dd className="mt-2 font-semibold">
          {plural(program.counts.activeProgramStudents-program.counts.placedStudents, "student")} awaiting a class.{" "}
          <Link to="/admissions" search={{siteId:program.siteId??undefined,programId:program.id}}
            className="underline">Place enrolled students →</Link>
        </dd>}</div>
       <div><dt className="text-xs text-muted-foreground">Learning &amp; responses</dt>
        <dd>{program.counts.publishedAssessments} assessments · {program.counts.submittedWork} awaiting grading · {program.counts.gradedWork} graded · {program.counts.unresolvedGuardianResponses} open family questions</dd></div>
      </dl>
      <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer underline">Academic authority and stable record IDs</summary>
       <p className="mt-2 break-all">Program: {program.id}</p>
       <p className="break-all">Academic provider: {program.academicProviderOrganizationId}</p>
       <p className="break-all">Credit issuer: {program.creditIssuingOrganizationId}</p>
      </details>
     </article>)}
    {!dashboardData.programs.length&&<p className=" border p-4 text-sm">No programs match your current school and verified access scope.</p>}
    </div>
   </>}
  </section>;
}
