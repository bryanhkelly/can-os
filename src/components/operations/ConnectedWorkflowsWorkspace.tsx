import { Link, useRouter } from "@tanstack/react-router";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { activateLaunch } from "@/modules/programs/launch.functions";
import { reconcileExpiredAdmissionOffers } from "@/modules/enrollment/admission-offer-reconciliation.functions";
import { getWorkflowIntegration } from "@/modules/operations/workflow-integration.functions";


function Metric({label,value}:{label:string;value:number|string}) {
  return <div className="rounded-lg border bg-background px-3 py-3">
    <p className="text-2xl font-semibold tabular-nums">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{label}</p>
  </div>;
}

export function ConnectedWorkflowsWorkspace({data,error}: {data: Awaited<ReturnType<typeof getWorkflowIntegration>> | null;error:string}) {
  const router = useRouter();
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;
  async function activate(programId: string) {
    await mutation.run(
      () => activateLaunch({ data: { programId } }),
      {
        successMessage: "Program activated after canonical readiness validation.",
        commandErrorMessage: "Program activation could not be completed.",
        refreshErrorMessage: "The Program was activated, but current workflow records could not be loaded. Retry the refresh before taking another action.",
      },
    );
  }
  async function reconcile(programId: string) {
    await mutation.run(
      () => reconcileExpiredAdmissionOffers({ data: { programId } }),
      {
        successMessage: result => result.expired + " elapsed offer(s) reconciled.",
        commandErrorMessage: "Could not reconcile elapsed offers.",
        refreshErrorMessage: "Elapsed offers were reconciled, but current workflow records could not be loaded. Retry the refresh before taking another action.",
      },
    );
  }
  return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
    <div className="mx-auto max-w-6xl">
      <Link to="/operations" search={{siteId:undefined,programId:undefined}} className="text-xs underline">← Operations</Link>
      <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Operations</p>
      <h1 className="mt-2 font-serif text-4xl">Connected school workflows</h1>
      <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
        One authorized view of the host launch, admissions-to-enrollment,
        learning intervention, and attendance-excuse lifecycles. Every metric
        comes from the canonical domain records; use the linked workspaces to act.
      </p>
      {error && <p role="alert" className="mt-6 rounded-lg border p-4 text-sm">{error}</p>}
      <MutationFeedback state={mutation} pendingMessage="Updating connected workflows…" className="mt-6"/>
      {data && data.programs.length === 0 && <p className="mt-6 rounded-lg border p-4 text-sm">
        No programs are accessible to your active registrar grant.
      </p>}
      {data && <div className="mt-8 space-y-8">
        {data.programs.map(program => <article key={program.id} className="rounded-2xl border bg-card p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl"><Link to="/operations/launch/$programId" params={{programId:program.id}} search={{siteId:program.siteId??undefined,programId:undefined}} className="hover:underline">{program.name}</Link></h2>
              <p className="mt-1 text-xs capitalize text-muted-foreground">
                {program.type.replaceAll("_"," ")} · {program.status}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/operations/launch/$programId" params={{programId:program.id}}
                search={{siteId:undefined,programId:undefined}}
                className="rounded-lg border px-3 py-2 text-xs font-semibold underline">
                Open program setup
              </Link>
              {program.status !== "active" && program.launch.journeyStatus === "ready" &&
                <button type="button" disabled={busy}
                  onClick={() => void activate(program.id)}
                  className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
                  {mutation.pending ? "Updating…" : "Activate through canonical validation"}
                </button>}
            </div>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">GF23 / GF3 · Launch readiness</h3>
                <Link to="/operations/school-years" search={{siteId:program.siteId??undefined,programId:program.id}} className="text-xs underline">School-year studio</Link>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="Active year" value={program.launch.hasActiveSchoolYear ? "Yes" : "No"} />
                <Metric label="Active sections" value={program.launch.activeSections} />
                <Metric label="Blocking journey items" value={program.launch.outstandingRequirements} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Journey: {program.launch.journeyStatus ?? "not configured"}. Counts do not replace
                section staffing, qualification, instructional-capacity or final activation validation.
              </p>
            </section>
            <section className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">GF22 / GF2 · Admissions to enrollment</h3>
                <Link to="/admissions/families" search={{siteId:program.siteId??undefined,programId:program.id}} className="text-xs underline">Family readiness</Link>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="Applications" value={program.enrollment.applications} />
                <Metric label="Offers awaiting response" value={program.enrollment.offersAwaitingResponse} />
                <Metric label="Accepted offers awaiting activation" value={program.enrollment.acceptedAwaitingActivation} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {program.enrollment.acceptedApplications} accepted applications;{" "}
                {program.enrollment.activeProgramEnrollments} active program enrollments across school years.
                Activation remains governed by the enrollment/seat-pool transaction.
              </p>
              {program.enrollment.expiredOffersAwaitingReconciliation > 0 && <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-xs text-muted-foreground">{program.enrollment.expiredOffersAwaitingReconciliation} elapsed offer(s) awaiting reconciliation.</span>
                <button type="button" className="rounded border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  disabled={busy} onClick={() => void reconcile(program.id)}>
                  {mutation.pending ? "Updating…" : "Expire elapsed offers"}
                </button>
              </div>}
            </section>
            <section className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">GF1 · Learning and intervention</h3>
                <Link to="/operations" search={{siteId:program.siteId??undefined,programId:program.id}} className="text-xs underline">Actions queue</Link>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="Latest missing attempts" value={program.learning.missingLatestAttempts} />
                <Metric label="Late work to grade" value={program.learning.lateAwaitingGrade} />
                <Metric label="Open program Actions" value={program.learning.openProgramActions} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Latest assignment attempts only; interventions and grading remain
                in their authorized teacher, family and support workspaces.
              </p>
            </section>
            <section className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">GF4 · Attendance and excuses</h3>
                <Link to="/staff/attendance" className="text-xs underline">Review attendance</Link>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="Expected student-days" value={program.attendance.coverage.expectedDays} />
                <Metric label="Unmarked expected days" value={program.attendance.coverage.unmarkedExpectedDays} />
                <Metric label="Record completion" value={program.attendance.coverage.recordCompletionPercent === null
                  ? "—" : program.attendance.coverage.recordCompletionPercent + "%"} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Expected onsite days: {program.attendance.coverage.windowStart} to
                {" "}{program.attendance.coverage.windowThrough}, derived from each active school
                year, its calendar and effective onsite schedule, and the student's active enrollment.
                Unmarked days are <strong>not</strong> automatically absences.
              </p>
              {program.attendance.outsideConfiguredExpectations > 0 &&
                <div role="alert" className="mt-3 rounded-lg border border-amber-500 p-3 text-sm">
                  <p className="font-semibold">
                    {program.attendance.outsideConfiguredExpectations} recorded onsite mark(s)
                    {" "}no longer match configured expected student-days.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    These historical records are preserved. Review the school calendar,
                    schedule and student enrollment before reconciling; changing configuration
                    never silently deletes or reclassifies recorded attendance.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <Link to="/operations/school-years" search={{siteId:undefined,programId:undefined}} className="text-xs underline">Review calendar and schedule</Link>
                    <Link to="/staff/attendance" className="text-xs underline">Open attendance</Link>
                  </div>
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer">Recorded occurrences needing review</summary>
                    <ul className="mt-2 space-y-1">
                      {program.attendance.reconciliationCases.map(entry=>
                        <li key={entry.attendanceEventId}>
                          {entry.occurrenceKey.slice(0,10)} · {entry.status}
                          {" "}· student {entry.studentProfileId.slice(0,8)}…
                        </li>)}
                    </ul>
                  </details>
                </div>}
              {program.attendance.coverage.configuration !== "configured" &&
                <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Coverage limitation: {program.attendance.coverage.configuration.replaceAll("_"," ")}
                  {program.attendance.coverage.daysWithoutCalendarConfiguration > 0
                    ? " · " + program.attendance.coverage.daysWithoutCalendarConfiguration + " scheduled dates lack calendar entries"
                    : ""}. The denominator may be incomplete.
                </p>}
              <p className="mt-2 text-xs text-muted-foreground">
                Last {data.windowDays} rolling days in the attendance event log:
                {" "}{program.attendance.recordedOccurrences} effective recorded occurrences,
                including {program.attendance.absent} absent,
                {" "}{program.attendance.excused} excused and
                {" "}{program.attendance.tardy} tardy.
                {program.attendance.pendingExcuses} excuse(s) await review.
                This event-log window is separate from the completed-day expected denominator.
              </p>
            </section>
          </div>
        </article>)}
      </div>}
    </div>
  </main>;
}
