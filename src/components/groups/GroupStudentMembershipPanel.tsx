import { Button } from "@/components/ui/button";
import { WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import { requestCanonicalGroupMembership, leaveCanonicalGroup } from "@/modules/study-groups/canonical-membership.functions";
import type { GroupPanelRecord, GroupPanelAvailability, GroupPanelRun } from "./group-panel-contracts";

/** Student membership always remains subject to guardian and facilitator approval. */
export function GroupStudentMembershipPanel({ group, availability, hasEnrollmentGuardian, busy, run }: {
  group: GroupPanelRecord; availability: GroupPanelAvailability;
  hasEnrollmentGuardian: boolean | null; busy: boolean; run: GroupPanelRun;
}) {
  const status = group.membershipStatus;
  return <WorkspacePanel title="Your membership"
    description="Participation requires guardian permission and facilitator approval.">
    <div className="space-y-3">
      {hasEnrollmentGuardian === false && <WorkspaceNotice tone="danger">
        A linked guardian is required to request study group membership. Ask your school to verify your guardian relationship.
      </WorkspaceNotice>}
      {status === "pending" && <WorkspaceNotice>
        Participation requires current guardian permission and facilitator approval. Check with your guardian and facilitator about this pending request.
      </WorkspaceNotice>}
      {status !== "approved" && status !== "pending" && <WorkspaceNotice>
        Request membership to access group discussions and sessions.
      </WorkspaceNotice>}
      <div className="flex flex-wrap gap-2">
        {!status || status === "left" || status === "declined"
          ? <Button variant="outline" size="sm" type="button" disabled={busy || !availability.membershipEnabled || hasEnrollmentGuardian !== true}
              onClick={() => void run(() => requestCanonicalGroupMembership({ data: { groupId: group.id } }),
                "Membership requested. A guardian and the facilitator must approve.")}>Request to join</Button>
          : <Button variant="outline" size="sm" type="button" disabled={busy || !availability.membershipEnabled}
              onClick={() => void run(() => leaveCanonicalGroup({ data: { groupId: group.id } }),
                status === "pending" ? "Membership request withdrawn." : "You left the study group.")}>
              {status === "pending" ? "Withdraw request" : "Leave group"}</Button>}
      </div>
    </div>
  </WorkspacePanel>;
}
