import { Button } from "@/components/ui/button";
import type { getCoachCaseload } from "@/modules/support/coach.functions";

type CaseloadStudent = Awaited<ReturnType<typeof getCoachCaseload>>["students"][number];

/** Read-only, source-authorized specialist caseload picker.
 * The owner verifies scope and loads the selected student's records.
 */
export function CoachCaseloadList({
  students, selected, onSelect,
}: {
  students: readonly CaseloadStudent[];
  selected: string | null;
  onSelect: (studentProfileId: string) => void;
}) {
  return <section>
              <div className="space-y-3">
                {students.map((student) => (
                  <Button type="button" variant={selected === student.studentProfileId ? "secondary" : "outline"}
                    aria-pressed={selected === student.studentProfileId}
                    key={student.studentProfileId}
                    onClick={() => onSelect(student.studentProfileId)}
                    className="h-auto w-full flex-col items-stretch text-left"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="text-base font-semibold">{student.name}</h2>
                      <span className="text-xs text-muted-foreground">
                        {student.gradeLevel ? `Grade ${student.gradeLevel}` : "Grade —"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {student.openReferrals > 0 && (
                        <span className=" bg-muted px-2 py-1">
                          {student.openReferrals} open referral{student.openReferrals === 1 ? "" : "s"}
                          {student.latestReferralStage ? ` · ${student.latestReferralStage.replaceAll("_", " ")}` : ""}
                        </span>
                      )}
                      {student.hasOpenPlan && (
                        <span className=" bg-muted px-2 py-1">Support plan</span>
                      )}
                      {student.openInsights > 0 && (
                        <span className=" bg-muted px-2 py-1">
                          {student.openInsights} insight{student.openInsights === 1 ? "" : "s"}
                        </span>
                      )}
                      {student.openActions > 0 && (
                        <span className=" bg-muted px-2 py-1">
                          {student.openActions} open action{student.openActions === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Last activity {new Date(student.lastActivityAt).toLocaleString()}
                    </p>
                  </Button>
                ))}
              </div>
            </section>;
}
