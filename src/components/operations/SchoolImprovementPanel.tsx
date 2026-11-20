import { Link } from "@tanstack/react-router";

/** Site-scoped operating review routines. Links do not record completion
 * or alter independent readiness/authorization state.
 */
export function SchoolImprovementPanel({ selected }: {
  selected: { siteId?: string; programId?: string };
}) {
  return <section aria-label="School improvement and planning" className="mt-7  border border-border/70 bg-card p-5 shadow-sm">
    <p className="text-xs font-bold uppercase tracking-widest text-primary">Sustain · Review and plan</p>
    <h2 className="mt-2 font-serif text-2xl font-semibold">Keep your school moving forward</h2>
    <p className="mt-2 text-sm text-muted-foreground">Use the existing school records for recurring review. These links are suggested routines, not proof that a review or compliance requirement is complete.</p>
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <article className=" border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weekly · Operational review</p>
        <h3 className="mt-2 font-semibold">Resolve open issues</h3>
        <p className="mt-2 text-sm text-muted-foreground">Review assigned actions, staffing exceptions and unresolved follow-ups.</p>
        <a href="#operations-actions" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline">Review action queue →</a>
      </article>
      <article className=" border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Monthly · School health</p>
        <h3 className="mt-2 font-semibold">Review evidence and insights</h3>
        <p className="mt-2 text-sm text-muted-foreground">Inspect observed signals, accept follow-up actions, or dismiss with a recorded reason.</p>
        <Link to="/operations/insights" search={{siteId:selected.siteId,programId:selected.programId}}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline">Open insights →</Link>
      </article>
      <article className=" border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Term / Annual · Planning</p>
        <h3 className="mt-2 font-semibold">Prepare the next school period</h3>
        <p className="mt-2 text-sm text-muted-foreground">Review saved school years, calendars and academic requirements before configuring new periods.</p>
        <Link to="/operations/school-years" search={{siteId:selected.siteId,programId:selected.programId}}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline">Review school years →</Link>
      </article>
    </div>
    <p className="mt-4 text-xs text-muted-foreground">Reenrollment is not represented as a completed workflow here. Use authorized admissions and enrollment records to review returning families; do not infer renewal from previous enrollment.</p>
  </section>;
}
