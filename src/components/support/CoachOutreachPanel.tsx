import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { CoachStudentTimeline } from "@/components/support/CoachStudentTimeline";
import type { getCoachCaseload, getCoachStudentHistory } from "@/modules/support/coach.functions";

type CaseloadStudent = Awaited<ReturnType<typeof getCoachCaseload>>["students"][number];
type TimelineEntry = Awaited<ReturnType<typeof getCoachStudentHistory>>["timeline"][number];

export const coachOutcomes = [
  { value: "contacted", label: "Contacted" },
  { value: "meeting_scheduled", label: "Meeting scheduled" },
  { value: "escalated", label: "Escalated" },
  { value: "no_response", label: "No response" },
] as const;
export type CoachOutreachOutcome = (typeof coachOutcomes)[number]["value"];

/** Controlled specialist student review and outreach panel.
 * Caseload authority and the outreach command remain with the parent and server.
 */
export function CoachOutreachPanel({
  chosen, timeline, timelineLoading, historyError, note, outcome,
  busy, formError, message, onNoteChange, onOutcomeChange, onSubmit,
}: {
  chosen: CaseloadStudent | null;
  timeline: readonly TimelineEntry[];
  timelineLoading: boolean;
  historyError: string;
  note: string;
  outcome: CoachOutreachOutcome;
  busy: boolean;
  formError: string;
  message: string;
  onNoteChange: (value: string) => void;
  onOutcomeChange: (value: CoachOutreachOutcome) => void;
  onSubmit: () => void | Promise<void>;
}) {
  return <section className="h-fit  border bg-card p-5">
              {!chosen && <p className="text-sm text-muted-foreground">Select a student to see their timeline and log outreach.</p>}
              {chosen && (
                <>
                  <h2 className="font-serif text-2xl">{chosen.name}</h2>
                  <Link to="/staff/students/$personId" params={{personId:chosen.personId}} className="mt-3 inline-block text-sm underline">Open student profile</Link>
                  <p className="mt-3 text-xs text-muted-foreground">School-support records only. Do not enter clinical or private counseling notes.</p>
                  <CoachStudentTimeline entries={timeline} loading={timelineLoading} error={historyError}/>
                  <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Log outreach</h3>
                  <Label className="mt-3 block text-sm font-semibold">
                    Note
                    <Textarea
                      value={note}
                      onChange={(event) => onNoteChange(event.target.value)}
                      rows={4}
                      placeholder="Who did you contact, what was discussed, and what happens next?"
                      className="mt-2"
                    />
                  </Label>
                  <Label className="mt-3 block text-sm font-semibold">
                    Outcome
                    <Select
                      value={outcome}
                      onChange={(event) => onOutcomeChange(event.target.value as CoachOutreachOutcome)}
                      className="mt-2"
                    >
                      {coachOutcomes.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Select>
                  </Label>
                  {formError && <p className="mt-3  border border-danger/40 p-3 text-sm" role="alert">{formError}</p>}
                  {message && <p className="mt-3  border border-success/40 p-3 text-sm" role="status">{message}</p>}
                  <Button type="submit" variant="ghost"
                    disabled={busy || note.trim().length < 3}
                    onClick={() => void onSubmit()}
                    className="mt-4 w-full"
                  >
                    Log outreach
                  </Button>
                </>
              )}
            </section>;
}
