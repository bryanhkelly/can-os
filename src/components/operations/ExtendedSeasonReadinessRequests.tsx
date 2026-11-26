import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { extendedLearningReadinessTasks } from "@/domain/extended-learning-readiness-tasks";
import type { listExtendedSeasonPlanning } from "@/modules/activities/extended-learning.functions";

type Planning = Awaited<ReturnType<typeof listExtendedSeasonPlanning>>;
type Season = Planning["seasons"][number];
type Assignment = Planning["assignments"][number];
type Operator = Planning["operators"][number];

/** Reusable optional evidence-request display. Assignments collect proof only:
 * no completion state here can authorize opening enrollment.
 */
export function ExtendedSeasonReadinessRequests({
  season, assignments, operators, owner, busy, onOwnerChange, onAssign,
}: {
  season: Season;
  assignments: readonly Assignment[];
  operators: readonly Operator[];
  owner?: string;
  busy: boolean;
  onOwnerChange: (personId:string)=>void;
  onAssign: ()=>void | Promise<void>;
}) {
  if(season.status!=="draft")return null;
  const tasks=assignments.filter(item=>item.seasonId===season.id);
  const available=operators.filter(person=>person.programId===season.programId);
  const existingOwner=tasks[0]?.ownerPersonId??"";
  const operatorId=owner??existingOwner;
  const inputClass="mt-1";
  return <details className="mt-3  border p-3">
                    <summary className="cursor-pointer text-xs font-semibold">Optional evidence requests</summary>
                    <p className="text-xs font-semibold">
                      Evidence requests: {tasks.length}/{extendedLearningReadinessTasks.length} recorded
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      These are evidence-gathering assignments only. A completed task does not
                      demonstrate approval or allow children to register.
                    </p>
                    {!!tasks.length && <ul className="mt-2 list-disc pl-5 text-xs">
                      {tasks.map(task => <li key={task.id}>
                        {extendedLearningReadinessTasks.find(t => t.key === task.requirementKey)?.title ??
                          "Unrecognized requirement"} — {task.status === "resolved"
                            ? "task closed, verification pending" : "evidence requested"}
                      </li>)}
                    </ul>}
                    {season.status === "draft" && <div className="mt-2 flex flex-wrap items-end gap-2">
                      <Label className="min-w-44 flex-1 text-xs">Receiving site operator
                        <Select className={inputClass} value={operatorId}
                          disabled={busy || tasks.length > 0}
                          onChange={event=>onOwnerChange(event.target.value)}>
                          <option value="">Choose active site registrar</option>
                          {available.map(person => <option key={person.personId} value={person.personId}>
                            {person.firstName} {person.lastName}
                          </option>)}
                        </Select>
                      </Label>
                      <Button variant="outline" type="button" 
                        disabled={busy || !operatorId || tasks.length === extendedLearningReadinessTasks.length}
                        onClick={()=>void onAssign()}>
                        {tasks.length ? "Complete missing requests" : "Assign readiness requests"}
                      </Button>
                    </div>}
                    {!available.length && <p className="mt-2 text-xs text-muted-foreground">
                      No active site registrar/operator is currently eligible for these tasks.
                    </p>}
                  </details>;
}
