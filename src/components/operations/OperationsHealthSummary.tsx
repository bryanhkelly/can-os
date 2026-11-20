import type { getLiveOperationsCommandCenter } from "@/modules/operations/command-center.functions";
import { OperationsIssueList } from "./OperationsIssueList";

type OperationsHealth = Awaited<ReturnType<typeof getLiveOperationsCommandCenter>>;

/** Operations exception summaries reuse canonical verified issue data.
 * These are observational signals, never an independent approval engine.
 */
export function OperationsHealthSummary({ commandCenterData }: {
  commandCenterData: OperationsHealth | null;
}) {
  return <>
  {commandCenterData&&<section aria-label="Operations exception summary" className="mt-8">
    <h2 className="font-serif text-3xl font-semibold">Operational health</h2>
    <p className="mt-2 text-sm text-muted-foreground">Prioritize verified staffing and capacity exceptions before routine school monitoring. Readiness approvals remain controlled by their owning workflows.</p>
    <div className="mt-5 grid gap-4 md:grid-cols-3">
      <div className=" border border-destructive/40 bg-card p-5">
        <h3 className="text-sm font-semibold">Needs intervention</h3>
        <p className="mt-2 text-3xl font-semibold">{commandCenterData.issues.length}</p>
        <p className="mt-2 text-xs text-muted-foreground">Reported staffing and capacity exceptions</p>
      </div>
      <div className=" border bg-card p-5">
        <h3 className="text-sm font-semibold">Watching</h3>
        <p className="mt-2 text-sm text-muted-foreground">Use the existing action workspace and live program details to review emerging concerns. No inferred warning counts.</p>
      </div>
      <div className=" border bg-muted/30 p-5">
        <h3 className="text-sm font-semibold">Active sections</h3>
        <p className="mt-2 text-sm text-muted-foreground">{commandCenterData.summary.sections} active sections in scope. Individual readiness is not inferred from this count.</p>
      </div>
    </div>
    <OperationsIssueList issues={commandCenterData.issues} variant="summary" />
  </section>}
  {commandCenterData&&<section className="mt-7  border border-border/70 bg-card p-6 shadow-sm">
    <h2 className="font-serif text-2xl">Live school operations</h2>
    <div className="mt-3 flex flex-wrap gap-4 text-sm">
    <span>{commandCenterData.summary.sections} active sections</span>
    <span>{commandCenterData.summary.unstaffed} without verified instructional staffing</span>
    <span>{commandCenterData.summary.underCapacity} capacity gaps</span>
    <span>{commandCenterData.summary.waitlisted} open section waitlist entries</span>
    </div>
    <OperationsIssueList issues={commandCenterData.issues} variant="detail" />
   </section>}
  </>;
}
