import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/workspace";
import { listLaunches } from "@/modules/programs/launch.functions";
import { readCanonicalBlueprintWorkspace } from "@/modules/blueprints/blueprint-studio.functions";
import { readLaunchSitePublication } from "@/modules/sites/launch-site-publication.functions";
import { getNoncreditEnrollmentPublisher } from "@/modules/enrollment/noncredit-enrollment-publication.functions";
import { readSiteProgramsAudiencesV61 } from "@/modules/programs/site-programs-audiences-v61.functions";
import { projectProgramOfferingJourneys } from "@/domain/program-offering-journey-v61";
import { projectSiteSolutionPreparationV61 } from "@/domain/site-solution-preparation-v61";
import { SolutionPreparationSummaryV61 } from "./SolutionPreparationSummaryV61";

/** Existing authorities own every status. This is a read-only cross-workflow
 * projection, not a new readiness checklist, approval or enrollment toggle. */
import type {
  ReadinessRecord, LaunchReadinessPrograms, LaunchReadinessSolutions,
  LaunchReadinessPublication, LaunchReadinessNoncredit, LaunchReadinessIntent,
} from "./launch-readiness-types-v61";
import { ProgramOfferingJourneyReadinessV61 } from "./ProgramOfferingJourneyReadinessV61";
import { ProgramRequirementsReadinessV61 } from "./ProgramRequirementsReadinessV61";
import { SitePublicationReadinessV61 } from "./SitePublicationReadinessV61";
import { NoncreditPublisherReadinessV61 } from "./NoncreditPublisherReadinessV61";

type LaunchReadinessPanelV61Props = {
  siteId: string; context: "prepare" | "open";
};

/** New Site or stage means a new evidence-reader session, not cached
 * permissions, previews, or statuses from the previous Site. */
export function LaunchReadinessPanelV61(props: LaunchReadinessPanelV61Props) {
  return <LaunchReadinessPanelScoped key={props.siteId+":"+props.context} {...props}/>;
}

function LaunchReadinessPanelScoped({ siteId, context }: LaunchReadinessPanelV61Props) {
  const [reload, setReload] = useState(0);
  const [programs, setPrograms] = useState<ReadinessRecord<LaunchReadinessPrograms>>({state:"loading"});
  const [savedIntent, setSavedIntent] = useState<ReadinessRecord<LaunchReadinessIntent>>({state:"loading"});
  const [solutions, setSolutions] = useState<ReadinessRecord<LaunchReadinessSolutions>>({state:"loading"});
  const [publication, setPublication] = useState<ReadinessRecord<LaunchReadinessPublication>>({state:"loading"});
  const [noncredit, setNoncredit] = useState<ReadinessRecord<LaunchReadinessNoncredit>>({state:"loading"});

  useEffect(() => {
    let active = true;
    setPrograms({state:"loading"});
    setSavedIntent({state:"loading"});
    setSolutions({state:"loading"});
    setPublication({state:"loading"});
    if (context === "open") setNoncredit({state:"loading"});
    // Each authority resolves independently. A slow or unavailable enrollment
    // reader must never delay already authorized Program and Solution evidence.
    void readSiteProgramsAudiencesV61({data:{siteId}})
      .then(result => {
        if(active)setSavedIntent(result.siteId===siteId
          ? {state:"ready",value:result} : {state:"unavailable"});
      })
      .catch(() => {if(active)setSavedIntent({state:"unavailable"});});
    void listLaunches({data:{includeActive:true,siteId}})
      .then(result => {
        if(active)setPrograms({state:"ready",value:result.launches.filter(item=>item.siteId===siteId)});
      })
      .catch(() => {if(active)setPrograms({state:"unavailable"});});
    void readCanonicalBlueprintWorkspace({data:{siteId}})
      .then(result => {
        if(active)setSolutions(result.siteId === siteId
          ? {state:"ready",value:result} : {state:"unavailable"});
      })
      .catch(() => {if(active)setSolutions({state:"unavailable"});});
    void readLaunchSitePublication({data:{siteId}})
      .then(result => {if(active)setPublication(result.siteId===siteId
        ? {state:"ready",value:result} : {state:"unavailable"});})
      .catch(() => {if(active)setPublication({state:"unavailable"});});
    if(context==="open") {
      void getNoncreditEnrollmentPublisher()
        .then(result => {if(active)setNoncredit({state:"ready",value:result});})
        .catch(() => {if(active)setNoncredit({state:"unavailable"});});
    }
    return ()=>{active=false;};
  },[siteId,reload,context]);

  const pending = [programs,savedIntent,solutions,publication,...(context==="open"?[noncredit]:[])].some(item=>item.state==="loading");
  const pilotJourneys = solutions.state==="ready" && savedIntent.state==="ready"
    ? projectProgramOfferingJourneys({
        programCodes:savedIntent.value.intent.programCodes ?? [],
        templates:solutions.value.templates,
        plans:solutions.value.configurations,
        siteId,
        ...(context==="open" && noncredit.state==="ready"
          ? {candidates:noncredit.value.candidates,releases:noncredit.value.published}
          : {}),
      })
    : null;
  const solutionPreparation=solutions.state==="ready"
    ? projectSiteSolutionPreparationV61({
        siteId,templates:solutions.value.templates,
        configurations:solutions.value.configurations,
        ...(context==="open"&&noncredit.state==="ready"
          ? {candidates:noncredit.value.candidates,releases:noncredit.value.published}:{}),
      })
    : null;
  return <WorkspacePanel title={context==="open" ? "Readiness status" : "Your preparation checklist"}
    description="See what's ready and what still needs attention. Registration opens separately for each approved offering.">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {pending ? "Checking your latest progress…" : "Your current preparation status"}
      </p>
      <Button type="button" size="sm" variant="outline"
        onClick={()=>setReload(value=>value+1)}>Refresh readiness</Button>
    </div>
    <div className="mt-4 grid gap-4">
      <ProgramOfferingJourneyReadinessV61 siteId={siteId} context={context}
        savedIntent={savedIntent} solutions={solutions} noncredit={noncredit}
        pilotJourneys={pilotJourneys} />
      {solutionPreparation!==null
        ? <SolutionPreparationSummaryV61 siteId={siteId} plans={solutionPreparation}
            open={context==="open"}/>
        : <p role="status" className="border p-3 text-sm">
            Solution information is {solutions.state==="loading"?"loading":"unavailable"}.
            Try refreshing to check the latest requirements.
          </p>}
      <ProgramRequirementsReadinessV61 programs={programs} />
      <SitePublicationReadinessV61 publication={publication} />
      {context==="open" && <NoncreditPublisherReadinessV61 siteId={siteId} noncredit={noncredit}/>}
    </div>
    <p className="mt-4 text-xs leading-5 text-muted-foreground">
      {context==="open"
        ? "Each offering must be approved before people can register. This checklist doesn't open registration."
        : "Use this checklist to see what's next. Some activities need additional facilities, staff, safety, or local approvals."}
    </p>
  </WorkspacePanel>;
}
