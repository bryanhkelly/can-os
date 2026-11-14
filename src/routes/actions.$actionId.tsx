import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { resolveMissingWorkFollowUp } from "@/modules/learning/teacher-missing-work.functions";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { getActionDetail } from "@/modules/actions/action-detail.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { PageFrame, RecordHeader, RecordLayout, WorkspacePanel, StatusBadge } from "@/components/workspace";

export const Route = createFileRoute("/actions/$actionId")({
  loader: ({ params }) => safeLoader(() => getActionDetail({ data: { actionId: params.actionId } }), {
    authMessage: "This action is unavailable in your current staff workspace.",
  })(),
  component: ActionDetailPage,
});

function ActionDetailPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="Action" title="Action detail" outcome={outcome}/>;
  const action = outcome.data;
  const statusTone = action.status === "resolved" ? "success"
    : action.status === "waiting" ? "attention"
      : action.status === "in_progress" ? "info" : "neutral";
  return <PageFrame>
    <RecordLayout header={<RecordHeader eyebrow="Action" title={action.title}
      breadcrumbs={<Link to={action.workspaceHome} className="underline">Back to workspace</Link>}
      subtitle="Recorded work and follow-through. Changes remain in the owning workflow."
      status={<StatusBadge tone={statusTone}><span className="capitalize">{action.status.replaceAll("_", " ")}</span></StatusBadge>} />}
    main={<WorkspacePanel title="Action details">
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-muted-foreground">Type</dt><dd className="mt-1 capitalize">{action.type.replaceAll("_", " ")}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Priority</dt><dd className="mt-1 capitalize">{action.priority}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Due</dt><dd className="mt-1">{action.dueAt ? new Date(action.dueAt).toLocaleDateString() : "No due date"}</dd></div>
      </dl>
      {action.description && <p className="mt-5 whitespace-pre-wrap text-sm">{action.description}</p>}
      {action.resolutionNote && <div className="mt-5 border-t pt-5"><h3 className="font-semibold">Resolution</h3><p className="mt-2 whitespace-pre-wrap text-sm">{action.resolutionNote}</p></div>}
      {action.resolvedAt && <p className="mt-3 text-sm text-muted-foreground">Resolved {new Date(action.resolvedAt).toLocaleDateString()}</p>}
      {action.canReviewClass && action.sectionId && <nav aria-label="Related academic work" className="mt-5 flex flex-wrap gap-4 text-sm font-semibold">
        <Link to="/classes" search={{ section: action.sectionId }} className="underline">Open class</Link>
        <Link to="/teacher/gradebook" search={{ section: action.sectionId }} className="underline">Review academic work</Link>
        <Link to="/calendar" search={{ section: action.sectionId }} className="underline">View class calendar</Link>
      </nav>}
      {action.canResolveMissingWork && !["resolved", "cancelled"].includes(action.status) &&
        <TeacherMissingWorkResolution actionId={action.id} />}
      {action.canManageOperations && !["resolved", "cancelled"].includes(action.status) &&
        <Link to="/home" search={{ action: action.id, siteId: action.siteId ?? undefined, programId: action.programId ?? undefined }}
          className="mt-5 inline-block text-sm font-semibold underline">Open owning operations workflow</Link>}
    </WorkspacePanel>} />
  </PageFrame>;
}

function TeacherMissingWorkResolution({actionId}:{actionId:string}) {
  const router=useRouter();
  const [note,setNote]=useState("");
  const mutation=useMutationFeedback(()=>router.invalidate());
  const busy=mutation.pending||mutation.refreshFailed;
  async function resolve(){
    await mutation.run(()=>resolveMissingWorkFollowUp({data:{
      actionId,resolutionNote:note.trim(),
    }}),{
      successMessage:value=>value.resolved
        ?"Follow-up resolved and recorded in the Action history.":"Follow-up was already resolved.",
      commandErrorMessage:"Unable to resolve the follow-up.",
    });
  }
  return <section className="mt-6 border-t pt-5" aria-label="Resolve teacher follow-up">
    <h3 className="font-semibold">Resolve this follow-up</h3>
    <p className="mt-2 text-sm text-muted-foreground">
      Record the outcome of your outreach or the student's response before resolving.
      This note stays with the canonical Action.
    </p>
    <label className="mt-4 block text-sm font-semibold">
      Resolution note
      <textarea value={note} maxLength={1000} rows={3} disabled={busy}
        onChange={event=>setNote(event.target.value)}
        className="mt-2 w-full rounded-lg border bg-background p-3 text-sm"
        placeholder="Document the follow-up outcome"/>
    </label>
    <button type="button" disabled={busy||note.trim().length<5}
      onClick={()=>void resolve()}
      className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
      Resolve follow-up
    </button>
    <MutationFeedback state={mutation} className="mt-3" pendingMessage="Resolving follow-up..."/>
  </section>;
}
