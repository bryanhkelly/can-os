import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { SafeguardingReporter } from "@/components/safeguarding/safeguarding-reporter";
import { SafeguardingResponder } from "@/components/safeguarding/safeguarding-responder";
import { getMySafeguardingWorkspace } from "@/modules/safeguarding/safeguarding.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const loadSafeguardingHome = safeLoader(() => getMySafeguardingWorkspace(), {
  authMessage: "Sign in with an onsite reporting membership or a named safeguarding responder membership.",
});

export const Route = createFileRoute("/safeguarding")({
  validateSearch: (search: Record<string, unknown>): { case?: string } => ({
    case: typeof search.case === "string" ? search.case : undefined,
  }),
  loader: loadSafeguardingHome,
  component: SafeguardingPage,
});

function SafeguardingPage() {
  return <SafeguardingHome outcome={Route.useLoaderData()} search={Route.useSearch()} />;
}
export function SafeguardingHome({ outcome, search }: {
  outcome: Awaited<ReturnType<typeof loadSafeguardingHome>>; search: { case?: string };
}) {
  const [workspace, setWorkspace] = useState(outcome.ok ? outcome.data : null);
  const [reloadError, setReloadError] = useState("");
  if (!outcome.ok) return <LoaderFailure title="Safeguarding" outcome={outcome} />;

  async function reload() {
    setReloadError("");
    try { setWorkspace(await getMySafeguardingWorkspace()); }
    catch (cause) { setReloadError(mutationErrorMessage(cause, "Unable to refresh. Do not assume a recent change was lost.")); }
  }

  return <WorkspaceShell width="wide" eyebrow="Restricted child safety" title="Safeguarding"
    subtitle={workspace?.mode === "reporter" ? `Report a safety concern at ${workspace.site.name}. This is separate from ordinary student support.` : "Respond only to safeguarding cases explicitly assigned to your verified membership."}>
    {reloadError && <p role="alert" className="mb-4 rounded-xl border border-danger/50 bg-danger/10 p-3 text-sm">{reloadError}</p>}
    {workspace?.mode === "reporter" && <SafeguardingReporter workspace={workspace} reload={reload} />}
    {workspace?.mode === "responder" && <SafeguardingResponder workspace={workspace} initialCaseId={search.case} reload={reload} />}
  </WorkspaceShell>;
}
