import { Link } from "@tanstack/react-router";
import { RecordFacts, WorkspacePanel, QueryState, StatusBadge, WorkspaceLinkNavigation, WorkspaceNotice } from "@/components/workspace";
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
  return <WorkspacePanel headingLevel="h3" title="From ideas to available experiences">
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Follow each program idea from choosing a solution to planning activities and
          preparing registration. Each step has its own requirements.
        </p>
        {(savedIntent.state==="loading" || solutions.state==="loading") &&
          <QueryState loading="Checking your programs and solutions…"/>}
        {(savedIntent.state==="unavailable" || solutions.state==="unavailable") &&
          <WorkspaceNotice tone="attention" className="mt-3">
            We couldn't check the latest details for your programs. Try refreshing before deciding what's ready.
          </WorkspaceNotice>}
        {pilotJourneys?.length===0 && <p className="mt-3 text-sm">
          You haven't chosen a program yet.{" "}
          <Link to="/launch/site" search={{siteId,module:"programs-audiences"}}
            className="font-semibold text-primary underline">Select a Program in Shape</Link> first.
        </p>}
        {pilotJourneys && pilotJourneys.length>0 && <ul className="mt-4 space-y-3">
          {pilotJourneys.map(journey=><li key={journey.programCode}
            className="border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">
                {journey.solution?.title ?? journey.programCode.replaceAll("_"," ").replaceAll("."," ")}
              </h4>
              <StatusBadge tone={journey.offeringPublished?"neutral":"attention"}>
                {journey.offeringPublished?"Available learning content":"Content not yet published"}
              </StatusBadge>
            </div>
            <RecordFacts className="mt-3" items={[
              {label:"Program",value:"Selected in Shape"},
              {label:"Solution",value:journey.solution
                ? "Available solution v"+journey.solution.versionNo : "Choose a solution"},
              {label:"Your site plan",value:journey.savedPlan
                ? (journey.savedPlan.lifecycle==="frozen"?"Submitted for review":"Saved private plan")
                : "Not planned yet"},
              {label:"Noncredit enrollment",value:context==="prepare"||noncredit.state!=="ready"
                ? "Check registration requirements"
                : (journey.publisherCandidateCount??0)>0
                  ? "Eligible for registration setup"
                  : "Registration setup not available yet"},
            ]}/>
            {journey.facilitatedFourSessions && <p className="mt-3 text-xs leading-5 text-muted-foreground">
              This solution includes four scheduled sessions. Choose dates, connect them
              to the approved registration, and record attendance for each one.
            </p>}
            {context==="open"&&noncredit.state==="ready"&&<p className="mt-3 text-xs text-muted-foreground">
              {journey.releasedCount??0} recorded enrollment releases
              {" · "}{journey.openRegistrationCount??0} within a current published registration window.
              Registration does not prove attendance, assessment or completion.
            </p>}
            <WorkspaceLinkNavigation label="Program delivery actions" surface="plain" className="mt-3 text-xs">
              <Link to="/launch/site" search={{siteId,module:"program-catalog",
                ...(journey.savedPlan ? {solutionPlanId:journey.savedPlan.configurationId} : {})}}
                className="font-semibold text-primary underline">
                {journey.savedPlan?"Continue this plan":"Plan this solution"}
              </Link>
              {journey.facilitatedFourSessions&&<Link to="/canonical/lab/facilitated" search={{siteId}}
                className="font-semibold text-primary underline">Manage dated Classes</Link>}
              {journey.solution?.offeringCode && context==="open" &&
                noncredit.state==="ready" && (journey.publisherCandidateCount??0)>0 &&
                <Link to="/programs/noncredit/enrollment"
                  search={{publicSiteId:siteId,offeringCode:journey.solution.offeringCode}}
                  className="font-semibold text-primary underline">
                  Manage approved registration for this Site (provider only)
                </Link>}
            </WorkspaceLinkNavigation>
          </li>)}
        </ul>}
      </WorkspacePanel>;
}
