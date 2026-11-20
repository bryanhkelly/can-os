import { Link } from "@tanstack/react-router";
import { StatusBadge, WorkspaceNotice } from "@/components/workspace";
import type { ProgramOfferingJourney } from "@/domain/program-offering-journey-v61";
import type { LaunchReadinessContext, ReadinessRecord, LaunchReadinessIntent, LaunchReadinessSolutions, LaunchReadinessNoncredit } from "./launch-readiness-types-v61";

/** Presentation only: no independent readiness authorization, storage or commands. */
export function ProgramOfferingJourneyReadinessV61({ siteId,context,savedIntent,solutions,noncredit,pilotJourneys }: {
  siteId: string; context: LaunchReadinessContext;
  savedIntent: ReadinessRecord<LaunchReadinessIntent>;
  solutions: ReadinessRecord<LaunchReadinessSolutions>;
  noncredit: ReadinessRecord<LaunchReadinessNoncredit>;
  pilotJourneys: ProgramOfferingJourney[] | null;
}) {
  return <section className="border bg-background p-4" aria-label="Program to Offering delivery journey">
        <h3 className="text-sm font-semibold">Program → Solution → Course delivery</h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Site-specific training journeys from the existing published Program catalog,
          saved Blueprint configurations and independently authorized noncredit publisher.
          A Course registration and the Classes a learner attends are separate actions.
        </p>
        {(savedIntent.state==="loading" || solutions.state==="loading") &&
          <p role="status" className="mt-3 text-sm">Reading your saved Programs and published Solutions…</p>}
        {(savedIntent.state==="unavailable" || solutions.state==="unavailable") &&
          <WorkspaceNotice tone="attention" className="mt-3">
            Your saved Program-to-Solution journey could not be verified for this Site.
            No pilot status is inferred from unavailable records.
          </WorkspaceNotice>}
        {pilotJourneys?.length===0 && <p className="mt-3 text-sm">
          No Program references are selected for this Site.{" "}
          <Link to="/launch/site" search={{siteId,module:"programs-audiences"}}
            className="font-semibold text-primary underline">Select a Program in Establish</Link> first.
        </p>}
        {pilotJourneys && pilotJourneys.length>0 && <ul className="mt-4 space-y-3">
          {pilotJourneys.map(journey=><li key={journey.programCode}
            className="border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">
                {journey.solution?.title ?? journey.programCode.replaceAll("_"," ").replaceAll("."," ")}
              </h4>
              <StatusBadge tone={journey.offeringPublished?"neutral":"attention"}>
                {journey.offeringPublished?"Published learning product":"Learning product not published"}
              </StatusBadge>
            </div>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Program</dt>
                <dd className="text-sm font-medium">Selected in Establish</dd></div>
              <div><dt className="text-xs text-muted-foreground">Solution</dt>
                <dd className="text-sm font-medium">{journey.solution
                  ? "Published recipe v"+journey.solution.versionNo : "No published matching Solution"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Site operating plan</dt>
                <dd className="text-sm font-medium">{journey.savedPlan
                  ? (journey.savedPlan.lifecycle==="frozen"?"Submitted for review":"Saved private plan")
                  : "Not configured for this Site"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Noncredit enrollment</dt>
                <dd className="text-sm font-medium">
                  {context==="prepare"||noncredit.state!=="ready"
                    ? "Provider authorization not verified here"
                    : (journey.publisherCandidateCount??0)>0
                      ? "Publisher-eligible at this Site"
                      : "No authorized Course release candidate"}
                </dd></div>
            </dl>
            {journey.facilitatedFourSessions && <p className="mt-3 text-xs leading-5 text-muted-foreground">
              This Solution calls for four dated Classes. Schedule and attach them to
              the authorized Course registration, then record independent attendance.
              The four dates may be consecutive or separated by holidays.
            </p>}
            {context==="open"&&noncredit.state==="ready"&&<p className="mt-3 text-xs text-muted-foreground">
              {journey.releasedCount??0} recorded enrollment releases
              {" · "}{journey.openRegistrationCount??0} within a current published registration window.
              Registration does not prove attendance, assessment or completion.
            </p>}
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              <Link to="/launch/site" search={{siteId,module:"program-catalog",
                ...(journey.savedPlan ? {solutionPlanId:journey.savedPlan.configurationId} : {})}}
                className="font-semibold text-primary underline">
                {journey.savedPlan?"Continue Site Solution":"Configure Solution"}
              </Link>
              {journey.facilitatedFourSessions&&<Link to="/canonical/lab/facilitated" search={{siteId}}
                className="font-semibold text-primary underline">Manage dated Classes</Link>}
              {journey.solution?.offeringCode && <Link to="/programs/noncredit/enrollment"
                search={{publicSiteId:siteId,offeringCode:journey.solution.offeringCode}}
                className="font-semibold text-primary underline">
                Review this Offering's enrollment
              </Link>}
            </div>
          </li>)}
        </ul>}
      </section>;
}
