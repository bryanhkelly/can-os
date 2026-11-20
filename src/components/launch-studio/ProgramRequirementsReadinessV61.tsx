import { StatusBadge, WorkspaceNotice } from "@/components/workspace";
import type { ReadinessRecord, LaunchReadinessPrograms } from "./launch-readiness-types-v61";

/** Presentation only: no independent readiness authorization, storage or commands. */
export function ProgramRequirementsReadinessV61({ programs }: {
  programs: ReadinessRecord<LaunchReadinessPrograms>;
}) {
  return <section className="border bg-background p-4" aria-label="Program readiness state">
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
      </section>;
}
