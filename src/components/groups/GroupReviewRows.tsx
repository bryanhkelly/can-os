import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { StudyGroupRecord } from "@/domain/study-group-display";

type Member = StudyGroupRecord["pendingMembers"][number];
type Report = StudyGroupRecord["reports"][number];

type GroupReviewContext = {
  groupId: string;
  groupTitle?: string;
  variant?: "directory" | "detail";
  busy: boolean;
};

export function GroupMembershipRequestRow({
  member, groupId, groupTitle, variant = "detail", busy, membershipEnabled, onDecision,
}: GroupReviewContext & {
  member: Member;
  membershipEnabled: boolean;
  onDecision: (groupId: string, studentPersonId: string, approve: boolean) => void | Promise<unknown>;
}) {
  return <div className={variant === "directory"
    ? "flex flex-wrap items-center justify-between gap-3 border-b py-3"
    : "mt-2 flex flex-wrap items-center justify-between gap-3 border p-3"}>
    <div>
      <p className="text-sm font-medium">{member.studentName}
        {groupTitle && <> · <Link to="/groups/$groupId" params={{groupId}}
          className="underline">{groupTitle}</Link></>}
      </p>
      <p className="text-xs text-muted-foreground">
        {member.guardianReady ? "Guardian permission recorded" : "Awaiting guardian permission"}
      </p>
    </div>
    <div className="flex gap-2">
      <Button variant="outline" size="sm" type="button"
        disabled={busy || !membershipEnabled}
        onClick={() => void onDecision(groupId, member.studentPersonId, false)}>
        Decline
      </Button>
      <Button size="sm" type="button"
        disabled={busy || !membershipEnabled || !member.guardianReady}
        onClick={() => void onDecision(groupId, member.studentPersonId, true)}>
        Approve
      </Button>
    </div>
  </div>;
}

/** Shared content-report review, usable in both the group and network
 * moderator worklists. Reports are never themselves authorizations to hide.
 */
export function GroupModerationReportRow({
  report, groupId, groupTitle, variant = "detail", busy, moderationEnabled, onResolve,
}: GroupReviewContext & {
  report: Report;
  moderationEnabled: boolean;
  onResolve: (reportId: string, hidePost: boolean) => void | Promise<unknown>;
}) {
  return <div className={variant === "directory" ? "border-b py-3" : "border p-3"}>
    {groupTitle && <p className="text-xs font-semibold">
      <Link to="/groups/$groupId" params={{groupId}} className="underline">{groupTitle}</Link>
    </p>}
    <p className="mt-2 text-sm">Reason: {report.reason}</p>
    <blockquote className="mt-2 border bg-muted p-3 text-sm whitespace-pre-wrap">
      {report.postBody ?? "The reported post is unavailable."}
    </blockquote>
    {report.postHidden && <p className="mt-1 text-xs text-muted-foreground">Post already hidden</p>}
    <div className="mt-2 flex gap-2">
      <Button variant={variant === "directory" ? "outline" : "destructive"}
        size="sm" type="button" disabled={busy || !moderationEnabled}
        onClick={() => void onResolve(report.id, true)}>
        {variant === "directory" ? "Hide and resolve" : "Hide post"}
      </Button>
      <Button variant="outline" size="sm" type="button"
        disabled={busy || !moderationEnabled}
        onClick={() => void onResolve(report.id, false)}>
        {variant === "directory" ? "Resolve only" : "Retain post"}
      </Button>
    </div>
  </div>;
}
