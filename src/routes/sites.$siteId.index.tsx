import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, CalendarDays, ClipboardCheck, Globe2 } from "lucide-react";
import { getSiteToday } from "@/modules/operations/site-today.functions";
import { StatCard, WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import { OpeningHandoffs } from "@/components/operations/OpeningHandoffs";
import { SiteTodayPriorities } from "@/components/operations/SiteTodayPriorities";
import { SiteOwnedActionResolution } from "@/components/operations/SiteOwnedActionResolution";

export const Route = createFileRoute("/sites/$siteId/")({
  loader: ({ params }) =>
    safeLoader(
      () => getSiteToday({ data: { siteId: params.siteId } }),
      { authMessage: "You do not have access to this school site." },
    )(),
  component: SiteTodayPage,
});

const openingBlockerLabels: Record<string, string> = {
  operating_agreement: "the CAN–church service agreement is not current",
  opening_evidence: "required independently verified opening evidence is missing or expired",
  site_director: "no current verified site director is appointed",
};

const ownerResolvableTypes = new Set([
  "onsite_coverage_gap",
  "onsite_pickup_denied_follow_up",
  "onsite_pickup_uncollected_child",
]);

function SiteTodayPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Site Operations"
    title="Site Today" outcome={outcome} />;
  const data: Awaited<ReturnType<typeof getSiteToday>> = outcome.data;
  const localTime = (date: string) => new Intl.DateTimeFormat("en-US", {
    timeZone: data.site.timezone, hour: "numeric", minute: "2-digit",
  }).format(new Date(date));
  const staffingExceptions=data.schoolDay.staffing.blocks.filter(block=>
    !block.assignedPlan||block.substitution||block.missingAdultReports>0||
    ["cannot_cover","stale_after_delegation","not_reported"].includes(block.dutyStatus));
  const studentExceptions=data.schoolDay.students.filter(student=>
    !["present","tardy"].includes(student.status)||!!student.guardianExplanationStatus||
    student.healthVisitCount>0||student.incidentCount>0||student.activeEmergencyHold||
    student.activeCustodyHold||student.deniedPickupAttempts>0||!!student.uncollectedActionId);
  const blockedOpenings=data.schoolOpenings.filter(opening=>opening.blocked);
  const ownedFollowUps=data.actions.filter(action=>
    action.ownerPersonId===data.viewerPersonId&&ownerResolvableTypes.has(action.type));
  return <WorkspaceShell eyebrow="CAN OS · Site Operations" title={data.site.name}
    subtitle={data.site.organizationName + " · " + data.localDate + " · " + data.site.timezone}
    actions={<div className="flex flex-wrap gap-2">
      <Link className="rounded-lg border px-3 py-2 text-sm" to="/sites/$siteId/publish"
        params={{siteId:data.site.id}}>Public site setup →</Link>
      <Link className="rounded-lg border px-3 py-2 text-sm" to="/operations"
        search={{siteId:undefined,programId:undefined}}>All operations →</Link>
    </div>}>
    <WorkflowIntro eyebrow="Site operations" title="A clear view of your school day." description="Review readiness, outstanding work and the schedule from your authorized site records." actions={<><Link to="/readiness" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><ClipboardCheck className="size-4" /> School readiness <ArrowUpRight className="size-4" /></Link>{data.canOpenOnsiteDay&&<Link to="/site/day" className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"><CalendarDays className="size-4" /> Onsite day</Link>}<Link to="/sites/$siteId/publish" params={{siteId:data.site.id}} className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"><Globe2 className="size-4" /> Public website</Link></>} />
    <nav aria-label="School operating areas" className="mt-6 flex flex-wrap gap-2 text-sm">
      {([
        ["Operations", "/operations"], ["Launch", "/operations/launch"],
        ["Readiness", "/readiness"], ["Admissions", "/admissions"],
        ["People", "/profiles"], ["Ask CAN", "/ask"],
      ] as const).map(([name, href]) => <Link key={href} to={href} search={{siteId:["/operations","/operations/launch","/admissions"].includes(href)?data.site.id:undefined,programId:undefined}}
        className="rounded-full border px-3 py-1.5 hover:bg-muted">{name}</Link>)}
    </nav>
    {blockedOpenings.length>0&&
      <section role="alert" aria-label="School opening authorization"
        className="mt-6 border-l-4 border-destructive bg-muted/40 px-5 py-4">
        <h2 className="font-semibold">School opening is not currently authorized</h2>
        <p className="mt-1 text-sm">
          A church-hosted school at this site is not approved to operate right now. The supervised
          day below remains a historical record — it never authorizes operation. Contact the church
          registrar and your CAN school-opening officer.
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {blockedOpenings.map(opening=>{
            const program=data.programs.find(item=>item.id===opening.programId);
            return <li key={opening.programId}>
              <span className="font-medium">{program?.name??"School program"}: </span>
              {opening.status==="suspended"?"opening suspended by CAN":
                opening.status==="approved"?"approval prerequisites no longer hold":
                opening.status==="unconfigured"?"no approved school configuration exists":
                "opening not yet approved"}
              {opening.blockers.length>0&&" — "+opening.blockers.map(blocker=>
                openingBlockerLabels[blocker]??blocker).join("; ")}
            </li>;
          })}
        </ul>
      </section>}
    <SiteTodayPriorities items={data.attentionItems} siteId={data.site.id} siteTimezone={data.site.timezone}
      ownedActionIds={ownedFollowUps.map(action => `action:${action.id}`)}
      staffingExceptionCount={staffingExceptions.length}
      studentExceptionCount={studentExceptions.length}/>
    <OpeningHandoffs handoffs={data.openingHandoffs}/>
    <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Active enrollment" value={data.enrollment.count} hint={data.enrollment.note}/>
      <StatCard label="Attendance recorded" value={data.attendance.count ? data.attendance.count : "No records"} hint={data.attendance.note}/>
      <StatCard label="Present records" value={data.attendance.count ? data.attendance.present : "—"} hint="Today’s recorded attendance observations"/>
      <StatCard label="Open actions" value={data.actions.length} hint="Scoped outstanding site actions"/>
    </div>
    <section aria-label="Supervised school day" className="mt-8 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl">Supervised school day</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">One source-derived view of staff coverage, onsite attendance, family explanations, health and incident activity, and dismissal evidence. Learning activity is not physical attendance.</p>
        </div>
        {data.canOpenOnsiteDay&&<Link to="/site/day" className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted">Operate onsite day →</Link>}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Staffing gaps",data.schoolDay.staffing.unassignedOrConflicting+data.schoolDay.staffing.missingAdultReports,"Unassigned blocks and missing adult check-ins"],
          ["Substitutions",data.schoolDay.staffing.substitutions,"Current adult differs from earlier duty evidence"],
          ["Emergency exceptions",data.schoolDay.exceptions.emergencyHolds+data.schoolDay.exceptions.openIncidents,"Active emergency holds and open incidents"],
          ["Dismissal follow-up",data.schoolDay.exceptions.uncollectedFollowUps,"Open uncollected-child actions"],
        ].map(([label,value,note])=><div key={label} className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 font-serif text-2xl">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{note}</p>
        </div>)}
      </div>
      {data.schoolDay.projectionTruncated&&<p role="alert" className="mt-4 rounded-lg border border-destructive p-3 text-sm">Some source listings were capped. This is not a complete school-day review; resolve the source-data volume before attestation.</p>}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div id="staffing-exceptions" tabIndex={-1}>
          <h3 className="font-semibold">Staff coverage and check-in</h3>
          <p className="mt-1 text-xs text-muted-foreground">{data.schoolDay.staffing.unacknowledged} blocks awaiting duty response · {data.schoolDay.staffing.coverageExceptions} coverage exceptions · {data.schoolDay.staffing.witnessedBlocks} independently witnessed blocks</p>
          <div className="mt-3 space-y-2">
            {staffingExceptions.slice(0,20).map(block=><article key={block.sectionId+":"+(block.periodId??"missing")} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{block.sectionTitle} · {block.periodLabel??"Schedule missing"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{block.facilitatorName??"No verified facilitator"} · {block.dutyStatus.replaceAll("_"," ")}</p>
              <ul className="mt-2 list-inside list-disc text-xs">
                {!block.assignedPlan&&<li>Assignment needs review: {block.gaps.map(gap=>gap.replaceAll("_"," ")).join(", ")}</li>}
                {block.substitution&&<li>Staffing substitution: earlier duty evidence names a different adult.</li>}
                {block.missingAdultReports>0&&<li>{block.missingAdultReports} required adult arrival report(s) missing.</li>}
                {block.requiredAdultReports>0&&<li>{block.reportedAdultCount} of {block.requiredAdultReports} arrival reports; independent witness {block.witnessedBothAdults?"recorded":"not recorded"}.</li>}
              </ul>
            </article>)}
            {!staffingExceptions.length&&<p className="rounded-lg border p-3 text-sm text-muted-foreground">No current staffing or check-in exceptions in the authorized plan.</p>}
          </div>
        </div>
        <div id="student-exceptions" tabIndex={-1}>
          <h3 className="font-semibold">Student attendance, exceptions and dismissal</h3>
          <p className="mt-1 text-xs text-muted-foreground">{data.schoolDay.exceptions.pendingGuardianExplanations} pending family explanations · {data.schoolDay.exceptions.healthVisits} health visits · {data.schoolDay.exceptions.sentHome} sent home · {data.schoolDay.exceptions.incidents} incidents</p>
          <div className="mt-3 space-y-2">
            {studentExceptions.slice(0,30).map(student=><article key={student.programId+":"+student.studentProfileId} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-medium">{student.studentName}</p>
                <span className="text-xs capitalize text-muted-foreground">{student.status.replaceAll("_"," ")}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{student.programName} · {student.sectionTitle??"Program roster"}</p>
              <ul className="mt-2 list-inside list-disc text-xs">
                {student.guardianExplanationStatus&&<li>Guardian explanation: {student.guardianExplanationStatus}.</li>}
                {student.healthVisitCount>0&&<li>{student.healthVisitCount} health-office visit(s) linked to this school day.</li>}
                {student.incidentCount>0&&<li>{student.incidentCount} incident record(s) linked to this school day.</li>}
                {student.activeEmergencyHold&&<li>Emergency pickup hold is active; do not release.</li>}
                {student.activeCustodyHold&&<li>Custody review hold is active; do not release.</li>}
                {student.deniedPickupAttempts>0&&<li>{student.deniedPickupAttempts} denied pickup attempt(s) recorded.</li>}
                {["present","tardy"].includes(student.status)&&<li>Dismissal: {student.dismissalStatus.replaceAll("_"," ")}.</li>}
                {student.uncollectedActionId&&<li><Link to="/operations" search={{siteId:data.site.id,programId:undefined,action:student.uncollectedActionId}} className="underline">Review supervised uncollected-child follow-up →</Link></li>}
              </ul>
            </article>)}
            {!studentExceptions.length&&<p className="rounded-lg border p-3 text-sm text-muted-foreground">No student attendance, explanation, health, incident or dismissal exceptions are currently linked.</p>}
          </div>
        </div>
      </div>
      <p className="mt-5 text-xs text-muted-foreground">{data.schoolDay.note}</p>
    </section>
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section>
        {ownedFollowUps.length>0&&        <SiteOwnedActionResolution actions={ownedFollowUps} timezone={data.site.timezone}/>}
        <h2 className="mt-8 font-serif text-2xl">Today's schedule</h2>
        <div className="mt-4 space-y-3">
          {data.events.map(event => <article key={event.id} className="flex items-start gap-4 rounded-xl border bg-card p-4">
            <p className="w-20 shrink-0 text-sm font-semibold">{localTime(event.startsAt)}</p>
            <div><h3 className="font-medium"><Link to="/calendar" search={{date:dateKeyInTimezone(event.startsAt,data.site.timezone),event:event.id}} className="hover:underline">{event.title}</Link></h3>
              <p className="text-xs capitalize text-muted-foreground">{event.type.replaceAll("_", " ")}</p></div>
          </article>)}
          {!data.events.length && <p className="rounded-xl border p-5 text-sm text-muted-foreground">No scheduled site events recorded for today.</p>}
        </div>
      </section>
      <aside>
        <h2 className="font-serif text-2xl">Programs</h2>
        <div className="mt-4 space-y-3">
          {data.programs.map(program => <article key={program.id} className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold"><Link to="/operations/launch/$programId" params={{programId:program.id}} search={{siteId:data.site.id,programId:undefined}} className="hover:underline">{program.name}</Link></h3>
            <p className="mt-2 text-xs text-muted-foreground">Grades {program.gradeRange.min}–{program.gradeRange.max} · {program.status.replaceAll("_", " ")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{program.type.replaceAll("_", " ")}</p>
          </article>)}
          {!data.programs.length && <p className="rounded-xl border p-4 text-sm text-muted-foreground">No programs visible in your scope.</p>}
        </div>
        <div className="mt-6 rounded-xl border bg-card p-4">
          <h3 className="font-medium">Attendance overview</h3>
          <p className="mt-2 text-sm">Present: {data.attendance.present} · Absent: {data.attendance.absent} · Tardy: {data.attendance.tardy}</p>
          <p className="mt-2 text-xs text-muted-foreground">{data.attendance.note}. This is not a verified school-wide attendance rate.</p>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Refreshed at {localTime(data.asOf)}. Metrics are derived from canonical records; no fixture totals are substituted.</p>
      </aside>
    </div>
  </WorkspaceShell>;
}
