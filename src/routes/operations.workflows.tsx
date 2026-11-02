import { createFileRoute } from "@tanstack/react-router";
import { getWorkflowIntegration } from "@/modules/operations/workflow-integration.functions";
import { ConnectedWorkflowsWorkspace } from "@/components/operations/ConnectedWorkflowsWorkspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/operations/workflows")({
  loader: () => safeLoader(() => getWorkflowIntegration())(),
  component: WorkflowsPage,
});

function WorkflowsPage() {
  const result = Route.useLoaderData();
  if (!result.ok) {
    return <LoaderFailure title="Connected workflows" eyebrow="CAN OS · Operations" outcome={result} />;
  }
  return <ConnectedWorkflowsWorkspace data={result.data} error="" />;
}
