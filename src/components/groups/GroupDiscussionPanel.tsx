import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ActionDialog, MutationFeedback, WorkspaceNotice, WorkspacePanel, useUnsavedChangesGuard } from "@/components/workspace";
import { DiscussionComposer } from "@/components/learning/DiscussionComposer";
import { formatTimestamp } from "@/modules/calendar/timezone";
import { createCanonicalGroupPost, reportCanonicalGroupPost } from "@/modules/study-groups/canonical-moderation.functions";
import type { GroupPanelRecord, GroupPanelRole, GroupPanelAvailability, GroupPanelRun, GroupPanelMutation } from "./group-panel-contracts";

/** Moderator escalation and unsaved-content protection are preserved. */
export function GroupDiscussionPanel({ group, role, availability, approvedMember, busy, run, mutation }: {
  group: GroupPanelRecord; role: GroupPanelRole; availability: GroupPanelAvailability;
  approvedMember: boolean; busy: boolean; run: GroupPanelRun;
  mutation: GroupPanelMutation;
}) {
  const [draft, setDraft] = useState("");
  const [report, setReport] = useState<{ postId: string; body: string } | null>(null);
  const [reportReason, setReportReason] = useState("");
  // This panel remains mounted across tabs; preserve typed messages and
  // prevent leaving the group before unsent student content is posted.
  useUnsavedChangesGuard(approvedMember && (draft.trim().length > 0 || (report !== null && reportReason.trim().length > 0)));
  if (!approvedMember) return <WorkspacePanel title="Group discussion">
    <WorkspaceNotice>Discussions are visible to approved group members.</WorkspaceNotice>
  </WorkspacePanel>;
  return <WorkspacePanel title="Group discussion"
    description="Posts are visible to approved group members. Report unsafe or inappropriate content for facilitator review. For urgent safety concerns, contact a trusted adult or school staff directly.">
    <div className="space-y-3">
      {group.posts.map(post => <div key={post.id} className="border p-3">
        <p className="text-sm whitespace-pre-wrap">{post.body}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {formatTimestamp(post.createdAt, group.timezone)}
        </p>
        {role === "student" && <Button variant="ghost" size="sm" type="button"
          disabled={busy || !availability.contentEnabled}
          onClick={() => { setReport({ postId: post.id, body: post.body }); setReportReason(""); }}>
          Report</Button>}
      </div>)}
      {group.posts.length === 0 && <p className="text-sm text-muted-foreground">No posts yet.</p>}
      <DiscussionComposer value={draft} onChange={setDraft} label="New post"
        placeholder="Share a question or a study tip" maxLength={3000}
        submitLabel="Post message" pending={mutation.pending} disabled={busy || !availability.contentEnabled}
        onSubmit={body => void run(async () => {
          await createCanonicalGroupPost({ data: { groupId: group.id, body } });
          setDraft(previous => previous === body ? "" : previous);
        }, "Post shared with your group.")} />
    </div>
    {report && <ActionDialog open title="Report study group post"
      description="Explain why this post needs facilitator review. For urgent safety concerns, contact a trusted adult or school staff directly."
      confirmLabel="Send report" pending={mutation.pending} pendingLabel="Sending report…"
      confirmDisabled={busy || !availability.contentEnabled || reportReason.trim().length < 5}
      onClose={() => { setReport(null); setReportReason(""); }}
      onConfirm={() => void mutation.run(() => reportCanonicalGroupPost({ data: {
        groupId: group.id, postId: report.postId, reason: reportReason,
      } }), {
        successMessage: "Your report was sent for facilitator review.",
        commandErrorMessage: "Unable to report this post.",
      }).then(outcome => {
        if (outcome.status === "saved" || outcome.status === "refresh-failed") { setReport(null); setReportReason(""); }
      })}>
      <blockquote className="border bg-muted p-3 text-sm whitespace-pre-wrap">{report.body}</blockquote>
      <Field label="Reason for reporting" className="text-sm" required>
        <Textarea required minLength={5} maxLength={1000} value={reportReason}
          onChange={event => setReportReason(event.target.value)} />
      </Field>
      <MutationFeedback state={mutation} pendingMessage="Sending report..." />
    </ActionDialog>}
  </WorkspacePanel>;
}
