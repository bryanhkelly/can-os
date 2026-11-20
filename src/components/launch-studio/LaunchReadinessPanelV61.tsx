import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import { listLaunches } from "@/modules/programs/launch.functions";
import { readCanonicalBlueprintWorkspace } from "@/modules/blueprints/blueprint-studio.functions";
import { readLaunchSitePublication } from "@/modules/sites/launch-site-publication.functions";

/** Existing authorities own every status. This is a read-only cross-workflow
 * projection, not a new readiness checklist, approval or enrollment toggle. */
type Launches = Awaited<ReturnType<typeof listLaunches>>["launches"];
type Solutions = Awaited<ReturnType<typeof readCanonicalBlueprintWorkspace>>;
type Publication = Awaited<ReturnType<typeof readLaunchSitePublication>>;
type ReadState<T> = { state: "loading" } | { state: "unavailable" } | { state: "ready"; value: T };

export function LaunchReadinessPanelV61({ siteId, context }: {
  siteId: string; context: "prepare" | "open";
}) {
  const [reload, setReload] = useState(0);
  const [programs, setPrograms] = useState<ReadState<Launches>>({state:"loading"});
  const [solutions, setSolutions] = useState<ReadState<Solutions>>({state:"loading"});
  const [publication, setPublication] = useState<ReadState<Publication>>({state:"loading"});

  useEffect(() => {
    let active = true;
    setPrograms({state:"loading"});
    setSolutions({state:"loading"});
    setPublication({state:"loading"});
    void Promise.allSettled([
      listLaunches({data:{includeActive:true}}),
      readCanonicalBlueprintWorkspace({data:{siteId}}),
      readLaunchSitePublication({data:{siteId}}),
    ]).then(([launches,plans,website]) => {
      if(!active)return;
      setPrograms(launches.status === "fulfilled"
        ? {state:"ready",value:launches.value.launches.filter(item=>item.siteId===siteId)}
        : {state:"unavailable"});
      setSolutions(plans.status === "fulfilled" && plans.value.siteId === siteId
        ? {state:"ready",value:plans.value} : {state:"unavailable"});
      setPublication(website.status === "fulfilled"
        ? {state:"ready",value:website.value} : {state:"unavailable"});
    });
    return ()=>{active=false;};
  },[siteId,reload]);

  const pending = [programs,solutions,publication].some(item=>item.state==="loading");
  return <WorkspacePanel title={context==="open" ? "Saved readiness and receiving Programs" : "Readiness from existing workspaces"}
    description="Each status comes from its owning workflow. A saved plan, completed requirement, website or Program status never grants Offering-level enrollment authorization.">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {pending ? "Reading current authorized records…" : "Latest requested Site-scoped records"}
      </p>
      <Button type="button" size="sm" variant="outline" disabled={pending}
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
          ? <ul className="mt-3 space-y-2">{solutions.value.configurations.map(plan=><li key={plan.configurationId}
              className="flex flex-wrap items-center justify-between gap-3 border p-3">
              <div className="min-w-0"><p className="text-sm font-medium">{plan.name}</p>
                <p className="text-xs text-muted-foreground">Saved revision {plan.revision}</p></div>
              <StatusBadge tone="neutral">{plan.lifecycle==="frozen"?"Submitted for review":"Private planning draft"}</StatusBadge>
            </li>)}</ul>
          : <p className="mt-2 text-sm text-muted-foreground">No saved Solution configurations for this Site. Open Program Catalog to begin.</p>)}
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
    </div>
    <p className="mt-4 text-xs leading-5 text-muted-foreground">
      {context==="open"
        ? "Each Offering must be authorized to enroll in its receiving service. Nothing here activates a Class, admission or enrollment."
        : "Use these records to identify next work. Facilities, staff, jurisdiction and safeguarding remain independently governed."}
    </p>
  </WorkspacePanel>;
}
