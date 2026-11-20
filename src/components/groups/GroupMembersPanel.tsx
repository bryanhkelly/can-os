import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field";
import { WorkspacePanel } from "@/components/workspace";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { decideCanonicalGroupMembership, inviteCanonicalGroupMembers, listCanonicalGroupInvitees } from "@/modules/study-groups/canonical-membership.functions";
import type { GroupPanelRecord, GroupPanelAvailability, GroupPanelRun } from "./group-panel-contracts";

/** Invitations and membership decisions are distinct and rechecked by server commands. */
export function GroupMembersPanel({ group, availability, busy, run }: {
  group: GroupPanelRecord; availability: GroupPanelAvailability; busy: boolean; run: GroupPanelRun;
}) {
  const [inviting, setInviting] = useState(false);
  const [selectedInviteeIds, setSelectedInviteeIds] = useState<string[]>([]);
  const [inviteAttempted, setInviteAttempted] = useState(false);
  const [inviteeLoad, setInviteeLoad] = useState<{
    loaded: boolean;
    invitees: Awaited<ReturnType<typeof listCanonicalGroupInvitees>>;
    error: string;
  }>({ loaded: false, invitees: [], error: "" });
  useEffect(() => {
    let active = true;
    if (!inviting) return () => { active = false; };
    setInviteeLoad({ loaded: false, invitees: [], error: "" });
    listCanonicalGroupInvitees({ data: { groupId: group.id } })
      .then(invitees => { if (active) setInviteeLoad({ loaded: true, invitees, error: "" }); })
      .catch(error => {
        if (active) setInviteeLoad({
          loaded: true, invitees: [],
          error: mutationErrorMessage(error, "Unable to load eligible students."),
        });
      });
    return () => { active = false; };
  }, [inviting, group.id]);
  return <WorkspacePanel title="Members and invitations"
    description="Invited students still need guardian permission and facilitator approval to join."
    actions={<Button variant="outline" size="sm" type="button" disabled={busy || !availability.membershipEnabled}
      onClick={() => { setSelectedInviteeIds([]); setInviteAttempted(false); setInviting(open => !open); }}>
      {inviting ? "Close invitations" : "Invite students"}</Button>}>
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Pending requests</h3>
        {group.pendingMembers.map(member => <div key={member.id}
          className="mt-2 flex flex-wrap items-center justify-between gap-3 border p-3">
          <div>
            <p className="text-sm font-medium">{member.studentName}</p>
            <p className="text-xs text-muted-foreground">
              {member.guardianReady ? "Guardian permission recorded" : "Awaiting guardian permission"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" type="button" disabled={busy || !availability.membershipEnabled}
              onClick={() => void run(() => decideCanonicalGroupMembership({ data: {
                groupId: group.id, studentPersonId: member.studentPersonId, approve: false,
              } }), "Membership declined.")}>Decline</Button>
            <Button variant="default" size="sm" type="button" disabled={busy || !availability.membershipEnabled || !member.guardianReady}
              onClick={() => void run(() => decideCanonicalGroupMembership({ data: {
                groupId: group.id, studentPersonId: member.studentPersonId, approve: true,
              } }), "Membership approved.")}>Approve</Button>
          </div>
        </div>)}
        {group.pendingMembers.length === 0 &&
          <p className="mt-2 text-xs text-muted-foreground">No pending memberships.</p>}
      </div>
      {inviting && <form noValidate className="space-y-3 border p-4" onSubmit={event => {
        event.preventDefault();
        setInviteAttempted(true);
        if (!selectedInviteeIds.length) return;
        void run(async () => {
          await inviteCanonicalGroupMembers({ data: {
            groupId: group.id, studentPersonIds: selectedInviteeIds,
          } });
          setSelectedInviteeIds([]); setInviting(false); setInviteAttempted(false);
        }, "Invitations sent. Students still need guardian permission and facilitator approval to join.");
      }}>
        <p className="text-xs text-muted-foreground">
          Invitations notify students; they must request membership before joining.
        </p>
        {!inviteeLoad.loaded && <p role="status" className="text-xs text-muted-foreground">Loading eligible students...</p>}
        {inviteeLoad.error && <p role="alert" className="text-xs text-destructive">{inviteeLoad.error}</p>}
        {inviteeLoad.loaded && !inviteeLoad.error && inviteeLoad.invitees.length === 0 &&
          <p className="text-xs text-muted-foreground">No eligible students are available to invite.</p>}
        {inviteeLoad.invitees.map(student => <Label key={student.personId} className="flex min-h-10 items-center gap-3 border border-border bg-card px-3 py-2">
          <Checkbox disabled={busy} checked={selectedInviteeIds.includes(student.personId)}
            onChange={event => setSelectedInviteeIds(ids => event.target.checked
              ? [...ids, student.personId]
              : ids.filter(id => id !== student.personId))} />
          <span>{student.firstName} {student.lastName}</span>
        </Label>)}
        {inviteAttempted && !selectedInviteeIds.length &&
          <FieldError>Select at least one student to invite.</FieldError>}
        <Button type="submit" disabled={busy || !inviteeLoad.loaded}>
          {busy ? "Sending invitations..." : "Send invitations"}
        </Button>
      </form>}
      <div>
        <h3 className="text-sm font-semibold">Members</h3>
        <ul className="mt-2 space-y-1">
          {group.roster.map(student => <li key={student.personId} className="text-sm">{student.studentName}</li>)}
        </ul>
        {group.roster.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No approved members yet.</p>}
      </div>
    </div>
  </WorkspacePanel>;
}
