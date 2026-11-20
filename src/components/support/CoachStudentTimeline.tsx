import { Link } from "@tanstack/react-router";
import type { getCoachStudentHistory } from "@/modules/support/coach.functions";

type TimelineEntry = Awaited<ReturnType<typeof getCoachStudentHistory>>["timeline"][number];

/** Renders authorized referral and outreach history without adding clinical
 * data or performing any action on a student's record.
 */
export function CoachStudentTimeline({
  entries, loading, error,
}: {
  entries: readonly TimelineEntry[];
  loading: boolean;
  error?: string;
}) {
  return <>
<h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h3>
                  {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
                  {loading && <p className="mt-3 text-sm" role="status">Loading history…</p>}
                  {!loading && !error && entries.length === 0 && (
                    <p className="mt-3 text-sm text-muted-foreground">No recorded history yet.</p>
                  )}
                  <ol className="mt-3 space-y-3">
                    {entries.map((entry) => (
                      <li key={`${entry.kind}-${entry.id}`} className=" border border-border p-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="font-semibold">{entry.title}</p>
                          {entry.kind==="referral"&&<Link to="/support" search={{referral:entry.id}} className="text-xs underline">Open referral</Link>}
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.occurredAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                          {entry.kind.replaceAll("_", " ")}
                          {entry.outcome ? ` · ${entry.outcome.replaceAll("_", " ")}` : ""}
                          {` · ${entry.status.replaceAll("_", " ")}`}
                        </p>
                        {entry.detail && <p className="mt-2 text-sm text-muted-foreground">{entry.detail}</p>}
                        {entry.stageHistory && entry.stageHistory.length > 0 && (
                          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {entry.stageHistory.map((stage, index) => (
                              <li key={index}>
                                {stage.stage.replaceAll("_", " ")} · {new Date(stage.occurredAt).toLocaleDateString()}
                                {stage.note ? ` — ${stage.note}` : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ol>
  </>;
}
