import { createFileRoute } from "@tanstack/react-router";
import { getWorkflowIntegration } from "@/modules/operations/workflow-integration.functions";
import { ConnectedWorkflowsWorkspace } from "@/components/operations/ConnectedWorkflowsWorkspace";

export const Route = createFileRoute("/operations/workflows")({
  loader: async () => {
    try { return { data: await getWorkflowIntegration(), error: "" }; }
    catch { return { data: null, error: "An authorized registrar session is required to see connected workflows." }; }
  },
  component: () => <ConnectedWorkflowsWorkspace {...Route.useLoaderData()} />,
});
