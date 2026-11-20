import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DirectoryTable } from "@/components/workspace";
import type { getNoncreditReleaseOperations } from "@/modules/enrollment/noncredit-cohort-operations.functions";

type CohortOperations = Awaited<ReturnType<typeof getNoncreditReleaseOperations>>;
type RosterRecord = CohortOperations["roster"][number];

/** Authorized adult cohort roster and seat-release action controls.
 * The owning cohort workspace performs mutations and refreshes; this
 * component cannot decide participant authority or change enrollment itself.
 */
export function NoncreditParticipantRoster({
  roster, busy, seatTarget, seatReason,
  onStartRelease, onReasonChange, onConfirmRelease, onCancelRelease,
}: {
  roster: readonly RosterRecord[];
  busy: boolean;
  seatTarget: string | null;
  seatReason: string;
  onStartRelease: (registrationId: string) => void;
  onReasonChange: (reason: string) => void;
  onConfirmRelease: (registrationId: string) => void | Promise<void>;
  onCancelRelease: () => void;
}) {
  return <>
<h3 className="mt-7 text-base font-semibold">Participant roster</h3>
      <p className="mt-1 text-xs text-muted-foreground">Named records are visible only to the authorized provider. Classroom pairing is not attendance.</p>
      <DirectoryTable label="Participant roster" caption="Authorized participant records for this release."
        rows={roster} rowKey={person=>person.registrationId}
        empty={<p className="p-4 text-sm text-muted-foreground">No participants registered for this release.</p>}
        columns={[
          {id:"participant",title:"Participant",render:person=>person.displayName},
          {id:"registration",title:"Registration",render:person=><>

                {person.status}
                {person.seatReleased&&<p className="text-xs text-muted-foreground">Seat released</p>}
                {["withdrawn","cancelled"].includes(person.status)&&!person.seatReleased&&
                  person.completionOutcome!=="completed"&&
                  <div className="mt-2">
                    <Button variant="ghost" type="button" className="text-xs text-primary underline"
                      onClick={()=>onStartRelease(person.registrationId)}>
                      Review capacity release
                    </Button>
                    {seatTarget===person.registrationId&&<div className="mt-2 space-y-2 border border-border p-2">
                      <Label className="block text-xs font-medium">Reason for releasing the seat
                        <Textarea value={seatReason} maxLength={500} onChange={event=>onReasonChange(event.target.value)}
                          className="mt-2 min-w-48" rows={2}
                          placeholder="Describe verified withdrawal and seat-release reason"/>
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={busy||seatReason.trim().length<15}
                          onClick={()=>void onConfirmRelease(person.registrationId)}>Confirm release</Button>
                        <Button size="sm" variant="outline" disabled={busy}
                          onClick={onCancelRelease}>Cancel</Button>
                      </div>
                    </div>}
                  </div>}
              
          </>},
          {id:"attendance",title:"Attendance",render:person=>person.attendedLinkedSession?"Present at linked session":"Not verified"},
          {id:"completion",title:"Completion",render:person=>person.completionOutcome??"No final decision"},
        ]}/>
  </>;
}
