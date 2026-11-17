import type { CompletionBlocker, CompletionReadiness } from "@/domain/verified-completion";

const descriptions: Record<CompletionBlocker,string> = {
  inactive_participation: "This enrollment is not eligible for a completion decision.",
  policy_unavailable: "An independently approved and published completion policy is required.",
  policy_not_pinned: "The applicable policy version has not been pinned to this participation.",
  lessons_incomplete: "Required Course lessons are not all recorded.",
  attendance_unverified: "Independently verified attendance requirements are not satisfied.",
  assessment_not_passed: "No current independently finalized passing assessment satisfies this Course.",
};

/** Design system 6.1, display-only. An operator action must use a separate
 * capability-bound server command; a learner cannot self-award from this view.
 * The data supplied to this component must come from a scoped server projection.
 */
export function VerifiedCompletionChecklist({
  readiness, audience, decision, decisionAt,
}: {
  readiness: CompletionReadiness;
  audience: "learner" | "operator";
  decision: "completed" | "not_yet_completed" | "voided" | null;
  decisionAt?: string | null;
}) {
  const verified = decision === "completed";
  const visualStatus = verified
    ? "Verified completion"
    : decision === "voided"
      ? "Completion voided"
      : readiness.readyForIndependentReview
        ? "Ready for independent review"
        : "Requirements outstanding";
  const checks = [
    ["Course lessons", `${readiness.completedLessons} of ${readiness.totalLessons} recorded`],
    ["Verified attendance", `${readiness.verifiedSessions} distinct verified sessions`],
    ["Independent assessment", `${readiness.passingResultIds.length} finalized passing result(s)`],
  ] as const;

  return <section aria-label="Verified learning completion" className="border border-border bg-card p-5 space-y-4">
    <header className="border-b border-border pb-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        CAN OS · Completion
      </p>
      <h2 className="font-serif text-2xl">Learning outcomes</h2>
      <p className="text-sm text-muted-foreground">
        Progress and verified completion are separate. A completed lesson,
        attendance record or submitted assessment never automatically grants
        a certificate, grade, credential or academic credit.
      </p>
    </header>
    <div className="grid gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">Completion status</span>
      <strong className="text-lg">{visualStatus}</strong>
      {decisionAt && verified && <span className="text-xs text-muted-foreground">
        Authorized decision recorded {new Date(decisionAt).toLocaleDateString()}
      </span>}
    </div>
    <dl className="divide-y divide-border border-y border-border">
      {checks.map(([label,value])=><div key={label} className="grid grid-cols-2 gap-4 py-3">
        <dt className="text-sm font-medium">{label}</dt>
        <dd className="text-sm text-muted-foreground text-right">{value}</dd>
      </div>)}
    </dl>
    {readiness.blockers.length > 0 && <div className="space-y-2">
      <h3 className="font-semibold text-sm">
        {audience === "operator" ? "Verification blockers" : "What remains"}
      </h3>
      <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
        {readiness.blockers.map(blocker=>
          <li key={blocker}>{descriptions[blocker]}</li>)}
      </ul>
    </div>}
    {audience==="operator" && <p className="text-sm border-t border-border pt-4 text-muted-foreground">
      {readiness.readyForIndependentReview
        ? "Evidence is ready for a separately authorized decision. No decision or award has been issued from this checklist."
        : "Resolve verification blockers using the original evidence authorities. Do not record a completion or issue an award from this view."}
    </p>}
    <p className="text-xs text-muted-foreground">
      A policy-approved completion decision and a separately authorized award
      are different records. Issued awards may later be revoked without deleting history.
    </p>
  </section>;
}
