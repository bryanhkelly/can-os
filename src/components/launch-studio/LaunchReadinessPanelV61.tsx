import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StatusBadge, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import { listLaunches } from "@/modules/programs/launch.functions";
import { readCanonicalBlueprintWorkspace } from "@/modules/blueprints/blueprint-studio.functions";
import { readLaunchSitePublication } from "@/modules/sites/launch-site-publication.functions";
import { getNoncreditEnrollmentPublisher } from "@/modules/enrollment/noncredit-enrollment-publication.functions";

/** Existing authorities own every status. This is a read-only cross-workflow
 * projection, not a new readiness checklist, approval or enrollment toggle. */
type Launches = Awaited<ReturnType<typeof listLaunches>>["launches"];
type Solutions = Awaited<ReturnType<typeof readCanonicalBlueprintWorkspace>>;
type Publication = Awaited<ReturnType<typeof readLaunchSitePublication>>;
type NoncreditPublisher = Awaited<ReturnType<typeof getNoncreditEnrollmentPublisher>>;
type ReadState<T> = { state: "loading" } | { state: "unavailable" } | { state: "ready"; value: T };

export function LaunchReadinessPanelV61({ siteId, context }: {
  siteId: string; context: "prepare" | "open";
}) {
  const [reload, setReload] = useState(0);
  const [programs, setPrograms] = useState<ReadState<Launches>>({state:"loading"});
  const [solutions, setSolutions] = useState<ReadState<Solutions>>({state:"loading"});
  const [publication, setPublication] = useState<ReadState<Publication>>({state:"loading"});
  const [noncredit, setNoncredit] = useState<ReadState<NoncreditPublisher>>({state:"loading"});

  useEffect(() => {
    let active = true;
    setPrograms({state:"loading"});
    setSolutions({state:"loading"});
    setPublication({state:"loading"});
    if (context === "open") setNoncredit({state:"loading"});
    // Each authority resolves independently. A slow or unavailable enrollment
    // reader must never delay already authorized Program and Solution evidence.
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
      .then(result => {if(active)setPublication({state:"ready",value:result});})
      .catch(() => {if(active)setPublication({state:"unavailable"});});
    if(context==="open") {
      void getNoncreditEnrollmentPublisher()
        .then(result => {if(active)setNoncredit({state:"ready",value:result});})
        .catch(() => {if(active)setNoncredit({state:"unavailable"});});
    }
    return ()=>{active=false;};
  },[siteId,reload,context]);

  const pending = [programs,solutions,publication,...(context==="open"?[noncredit]:[])].some(item=>item.state==="loading");
  return <WorkspacePanel title={context==="open" ? "Saved readiness and receiving Programs" : "Readiness from existing workspaces"}
    description="Each status comes from its owning workflow. A saved plan, completed requirement, website or Program status never grants Offering-level enrollment authorization.">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {pending ? "Reading current authorized records…" : "Latest requested Site-scoped records"}
      </p>
      <Button type="button" size="sm" variant="outline"
        onClick={()=>setReload(value=>value+1)}>Refresh readiness</Button>
    </div>
    <div className="mt-4 grid gap-4">
      <section className="border bg-background p-4" aria-label="Solution planning state">
        <h3 className="text-sm font-semibold">Solution plans</h3>
        {solutions.state==="loading" && <p role="status" className="mt-2 text-sm">Loading Solution plans…</p>}
        {solutions.state==="unavailable" && <WorkspaceNotice tone="attention" className="mt-3">
          Solution planning records are unavailable or your current account cannot view them. No status is inferred.
        </WorkspaceNotice>}
        {solutions.state==="ready" && (solutions.value.configurations.length
          ? <ul className="mt-3 space-y-2">{solutions.value.configurations.map(plan=>{
              const model = solutions.value.templates.find(template =>
                template.blueprintVersionId === plan.blueprintVersionId);
              return <li key={plan.configurationId}
                className="flex flex-wrap items-center justify-between gap-3 border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{plan.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {model ? model.title + " · v" + model.versionNo + " · " : ""}
                    Saved revision {plan.revision}
                  </p>
                  {model ? <>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {model.components.filter(item => item.requirementMode === "required").length}
                      {" "}required components in the published Solution. These are not verified Site readiness.
                    </p>
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer font-medium text-primary">
                        View published Solution requirements
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {model.components.map(component => <li key={component.id}
                          className="border-l-2 border-border pl-3">
                          <span className="font-medium capitalize">
                            {component.key.replaceAll("_", " ")}
                          </span>
                          <span className="text-muted-foreground">
                            {" · "}{component.requirementMode}
                          </span>
                          {component.description && <p className="mt-1 leading-5 text-muted-foreground">
                            {component.description}
                          </p>}
                        </li>)}
                      </ul>
                    </details>
                  </> : <p className="mt-1 text-xs text-muted-foreground">
                    This saved Solution version is not available for preview. Review the plan for details.
                  </p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="neutral">{plan.lifecycle==="frozen"?"Submitted for review":"Private planning draft"}</StatusBadge>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/launch/site" search={{siteId, module:"program-catalog",
                      solutionPlanId:plan.configurationId}}>
                      {plan.lifecycle==="frozen" ? "Review plan" : "Continue plan"}
                    </Link>
                  </Button>
                </div>
              </li>;
            })}</ul>
          : <p className="mt-2 text-sm text-muted-foreground">
              No saved Solution plans for this Site.{" "}
              <Link to="/launch/site" search={{siteId, module:"program-catalog"}}
                className="font-semibold text-primary underline">Open Program Catalog</Link> to begin.
            </p>)}
      </section>
      <section className="border bg-background p-4" aria-label="Program readiness state">
        <h3 className="text-sm font-semibold">Program launch requirements</h3>
        {programs.state==="loading" && <p role="status" className="mt-2 text-sm">Loading Program requirements…</p>}
        {programs.state==="unavailable" && <WorkspaceNotice tone="attention" className="mt-3">
          Program launch requirements could not be verified. Review the authorized Program workspace directly.
        </WorkspaceNotice>}
        {programs.state==="ready" && (programs.value.length
          ? <ul className="mt-3 space-y-3">{programs.value.map(program=>{
              const blockers=program.requirements.filter(item=>item.blocking && item.status!=="complete");
              return <li key={program.id} className="border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">{program.name}</h4>
                  <StatusBadge tone={blockers.length?"attention":"neutral"}>{program.status}</StatusBadge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {blockers.length
                    ? blockers.length + (blockers.length===1?" blocking requirement":" blocking requirements") + " not complete"
                    : "No incomplete blocking requirements returned by this Program journey. Independent opening and enrollment checks still apply."}
                </p>
                {blockers.length>0 && <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                  {blockers.slice(0,5).map(item=><li key={item.id}>{item.title} · {item.status}</li>)}
                  {blockers.length>5 && <li>{blockers.length-5} additional blockers in the Program workspace</li>}
                </ul>}
              </li>;
            })}</ul>
          : <p className="mt-2 text-sm text-muted-foreground">No authorized Program launch journeys returned for this Site. This does not determine Offering availability.</p>)}
      </section>
      <section className="border bg-background p-4" aria-label="Website publication state">
        <h3 className="text-sm font-semibold">Site website publication</h3>
        {publication.state==="loading" && <p role="status" className="mt-2 text-sm">Loading publication state…</p>}
        {publication.state==="unavailable" && <WorkspaceNotice tone="attention" className="mt-3">
          Site publication cannot be verified for your current account.
        </WorkspaceNotice>}
        {publication.state==="ready" && <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{publication.value.address?.host ?? "No authorized public address reserved"}</p>
          <StatusBadge tone="neutral">{publication.value.address?.status==="published"
            ? "Publication recorded; reachability unverified" : "Not published"}</StatusBadge>
        </div>}
      </section>
      {context==="open" && <section className="border bg-background p-4"
        aria-label="Independently authorized noncredit enrollment releases">
        <h3 className="text-sm font-semibold">Noncredit Offering enrollment</h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          The existing publisher service alone determines candidate availability and issued
          enrollment releases. A candidate is not an active registration.
        </p>
        {noncredit.state==="loading" && <p role="status" className="mt-2 text-sm">
          Checking authorized noncredit Offering records…
        </p>}
        {noncredit.state==="unavailable" && <WorkspaceNotice tone="attention" className="mt-3">
          Current noncredit enrollment authority could not be verified for this account.
          This does not mean an Offering is approved or unavailable.
        </WorkspaceNotice>}
        {noncredit.state==="ready" && (() => {
          const candidates=noncredit.value.candidates.filter(item=>
            [...item.siteOptions,...item.digitalSiteOptions].some(site=>site.id===siteId));
          const releases=noncredit.value.published.filter(item=>item.siteId===siteId);
          return <div className="mt-3 space-y-4">
            <p className="text-xs text-muted-foreground">
              {candidates.length} publisher candidates · {releases.length} recorded enrollment releases
            </p>
            {releases.length>0 && <ul className="space-y-2">
              {releases.map(item=><li key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 border p-3">
                <p className="min-w-0 text-sm font-medium">{item.title}</p>
                <StatusBadge tone="neutral">Recorded status: {item.status}</StatusBadge>
              </li>)}
            </ul>}
            {candidates.length>0 && <ul className="space-y-2">
              {candidates.map(item=><li key={[item.deploymentId,item.adoptionId,
                item.trainingVersionId,item.courseVersionId].join(":")} className="border p-3">
                <p className="text-sm font-medium">{item.trainingTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Authorized provider candidate. Final enrollment publication still requires
                  the receiving service to validate current release, capacity and consent.
                </p>
              </li>)}
            </ul>}
            {!releases.length && !candidates.length && <p className="text-sm text-muted-foreground">
              No noncredit publisher candidates or issued enrollment releases for this Site.
              Other academic and Class enrollment systems are independent.
            </p>}
            <Button asChild variant="outline" size="sm">
              <Link to="/programs/noncredit/enrollment" search={{publicSiteId:siteId}}>
                Manage independently authorized noncredit enrollment
              </Link>
            </Button>
          </div>;
        })()}
      </section>}
    </div>
    <p className="mt-4 text-xs leading-5 text-muted-foreground">
      {context==="open"
        ? "Each Offering must be authorized to enroll in its receiving service. Nothing here activates a Class, admission or enrollment."
        : "Use these records to identify next work. Facilities, staff, jurisdiction and safeguarding remain independently governed."}
    </p>
  </WorkspacePanel>;
}
