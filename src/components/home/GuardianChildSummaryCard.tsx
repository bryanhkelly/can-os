import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { PersonMark, StatusBadge } from "@/components/workspace";
import { plural, agree } from "@/lib/format";
import type { getFamilyHome } from "@/modules/family/family-home.functions";

const guardianChildActionClass = buttonVariants({ variant: "outline", size: "lg" }) + " h-auto whitespace-normal";

export type GuardianChild = Awaited<ReturnType<typeof getFamilyHome>>["children"][number];

/** Read-only guardian child card, from an authorized family-home response.
 * All child links route to independently verified guardian workspaces.
 */
export function GuardianChildSummaryCard({ child }: { child: GuardianChild }) {
  return <article className=" border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div className="flex items-start gap-3">
        <PersonMark name={`${child.displayName} ${child.lastName}`}/>
        <div>
        <h3 className="text-lg font-semibold"><Link to="/guardian/students" search={{student:child.studentPersonId}} className="hover:underline focus-visible:outline-2">{child.displayName} {child.lastName}</Link></h3>
        <p className="mt-1 text-xs text-muted-foreground">{child.awaitingSections ? "Program enrollment active; classes not assigned yet" : `${child.sectionCount} active ${child.sectionCount === 1 ? "class" : "classes"}`}</p>
        </div>
       </div>
       <StatusBadge tone={child.status==="on_track"?"success":"attention"}>
        {child.status === "awaiting_courses" ? "Enrolled · awaiting classes" : child.status === "on_track" ? "On track" : "Needs attention"}
       </StatusBadge>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
       <div className=" bg-muted p-2"><dt className="text-xs text-muted-foreground"><Link to="/guardian/students" search={{student:child.studentPersonId}} className="underline focus-visible:outline-2">Overdue</Link></dt><dd className="text-lg font-semibold">{child.missingCount}</dd></div>
       <div className=" bg-muted p-2"><dt className="text-xs text-muted-foreground"><Link to="/guardian/attendance" search={{student:child.studentPersonId}} className="underline focus-visible:outline-2">Absences</Link></dt><dd className="text-lg font-semibold">{child.unexcusedAbsences}</dd></div>
       <div className=" bg-muted p-2"><dt className="text-xs text-muted-foreground"><Link to="/guardian/attendance" search={{student:child.studentPersonId}} className="underline focus-visible:outline-2">Tardies</Link></dt><dd className="text-lg font-semibold">{child.unexcusedTardies}</dd></div>
       <div className=" bg-muted p-2"><dt className="text-xs text-muted-foreground"><Link to="/guardian/students" search={{student:child.studentPersonId}} className="underline focus-visible:outline-2">Next due</Link></dt><dd className="text-sm font-semibold">{child.nextDueAt ? new Intl.DateTimeFormat("en-US",{dateStyle:"medium",...(child.nextDueTimezone?{timeZone:child.nextDueTimezone}:{})}).format(new Date(child.nextDueAt)) : "—"}</dd></div>
      </dl>
      <p className="mt-4 text-sm text-muted-foreground">{child.missingCount>0?`${plural(child.missingCount,"overdue assignment")} ${agree(child.missingCount,"needs","need")} follow-through.`:child.workNeedsAttentionCount>0?`${plural(child.workNeedsAttentionCount,"assignment")} to complete or revise.`:child.unexcusedAbsences>0||child.unexcusedTardies>0?"Unexcused attendance marks remain. Check Attendance for the school's review status.":child.awaitingSections?"Your school is arranging class placement.":"No overdue unfinished work or unexcused attendance cases in this summary."}</p>
      {child.workToReview.length>0&&<div className="mt-4  border p-3">
       <p className="text-sm font-semibold">Schoolwork to review · {child.workNeedsAttentionCount}</p>
       <ul className="mt-2 space-y-2">{child.workToReview.map(work=><li key={work.assessmentId} className="text-sm">
        <Link to="/guardian/students" search={{student:child.studentPersonId,section:work.sectionId,assessment:work.assessmentId}} className="font-semibold underline focus-visible:outline-2">{work.title}</Link>
        <span className="ml-2 text-xs text-muted-foreground">{work.revisionLimitReached?"School follow-up needed · no revision attempts remain":work.status==="returned"?"Revision requested":work.status==="draft"?"Draft in progress":"Not submitted"}</span>
       </li>)}</ul>
      </div>}
      <nav className="mt-4 flex flex-wrap gap-2 text-sm" aria-label={`${child.displayName} links`}>
      <Link to="/guardian/students" search={{student:child.studentPersonId}} className={guardianChildActionClass}>Students</Link>
       <Link to="/guardian/attendance" search={{student:child.studentPersonId}} className={guardianChildActionClass}>Attendance</Link>
       <Link to="/guardian/attendance" search={{student:child.studentPersonId}} hash="pickup" className={guardianChildActionClass}>Pickup &amp; safety</Link>
       <Link to="/guardian/health" search={{student:child.studentPersonId}} className={guardianChildActionClass}>Health &amp; clearance</Link>
       <Link to="/guardian/enrollment-changes" search={{student:child.studentPersonId}} className={guardianChildActionClass}>Transfer &amp; family changes</Link>
       <Link to="/guardian/report-cards" search={{student:child.studentPersonId}} className={guardianChildActionClass}>Report cards</Link>
       <Link to="/guardian/admission-offers" search={{student:child.studentPersonId}} className={guardianChildActionClass}>Offers</Link>
      </nav>
     </article>;
}
