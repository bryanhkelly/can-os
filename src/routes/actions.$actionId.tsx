import { createFileRoute, Link } from "@tanstack/react-router";
import { getActionDetail } from "@/modules/actions/action-detail.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell, StatusBadge } from "@/components/workspace";

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
  return <WorkspaceShell eyebrow="CAN OS · Action" title={action.title}
    breadcrumbs={<Link to={action.workspaceHome} className="underline">Back to workspace</Link>}
    subtitle="Recorded work and follow-through. Changes remain in the owning workflow.">
    <section className="mt-6 space-y-4 rounded-xl border bg-card p-5">
      <StatusBadge>{action.status.replaceAll("_", " ")}</StatusBadge>
      <p className="text-sm text-muted-foreground">{action.type.replaceAll("_", " ")} · {action.priority} priority</p>
      {action.description && <p className="whitespace-pre-wrap text-sm">{action.description}</p>}
      {action.dueAt && <p className="text-sm">Due {new Date(action.dueAt).toLocaleDateString()}</p>}
      {action.resolutionNote && <div><h2 className="font-semibold">Resolution</h2><p className="mt-2 whitespace-pre-wrap text-sm">{action.resolutionNote}</p></div>}
      {action.resolvedAt && <p className="text-sm">Resolved {new Date(action.resolvedAt).toLocaleDateString()}</p>}
      {action.canManageOperations && !["resolved", "cancelled"].includes(action.status) &&
        <Link to="/operations" search={{ action: action.id, siteId: action.siteId ?? undefined, programId: action.programId ?? undefined }}
          className="inline-block text-sm underline">Open owning operations workflow</Link>}
    </section>
  </WorkspaceShell>;
}
