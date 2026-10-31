import { createFileRoute, Link } from "@tanstack/react-router";
import { getActionDetail } from "@/modules/actions/action-detail.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell, WorkspacePanel, StatusBadge } from "@/components/workspace";

export const Route = createFileRoute("/actions/$actionId")({
  loader: ({ params }) => safeLoader(() => getActionDetail({ data: { actionId: params.actionId } }), {
    authMessage: "This action is unavailable in your current staff workspace.",
  })(),
  component: ActionDetailPage,
});

function ActionDetailPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Action" title="Action detail" outcome={outcome}/>;
  const action = outcome.data;
  const statusTone = action.status === "resolved" ? "success"
    : action.status === "waiting" ? "attention"
      : action.status === "in_progress" ? "info" : "neutral";
  return <WorkspaceShell eyebrow="CAN OS · Action" title={action.title}
    breadcrumbs={<Link to={action.workspaceHome} className="underline">Back to workspace</Link>}
    subtitle="Recorded work and follow-through. Changes remain in the owning workflow.">
    <WorkspacePanel title="Action details" className="mt-6">
      <StatusBadge tone={statusTone}><span className="capitalize">{action.status.replaceAll("_", " ")}</span></StatusBadge>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-muted-foreground">Type</dt><dd className="mt-1 capitalize">{action.type.replaceAll("_", " ")}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Priority</dt><dd className="mt-1 capitalize">{action.priority}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Due</dt><dd className="mt-1">{action.dueAt ? new Date(action.dueAt).toLocaleDateString() : "No due date"}</dd></div>
      </dl>
      {action.description && <p className="mt-5 whitespace-pre-wrap text-sm">{action.description}</p>}
      {action.resolutionNote && <div className="mt-5 border-t pt-5"><h3 className="font-semibold">Resolution</h3><p className="mt-2 whitespace-pre-wrap text-sm">{action.resolutionNote}</p></div>}
      {action.resolvedAt && <p className="mt-3 text-sm text-muted-foreground">Resolved {new Date(action.resolvedAt).toLocaleDateString()}</p>}
      {action.canManageOperations && !["resolved", "cancelled"].includes(action.status) &&
        <Link to="/operations" search={{ action: action.id, siteId: action.siteId ?? undefined, programId: action.programId ?? undefined }}
          className="mt-5 inline-block text-sm font-semibold underline">Open owning operations workflow</Link>}
    </WorkspacePanel>
  </WorkspaceShell>;
}
