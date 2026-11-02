import { createFileRoute, redirect } from "@tanstack/react-router";
import { getLiveOperationsCommandCenter, getLiveFullFlowOperations } from "@/modules/operations/command-center.functions";
import { getLaunchEntry } from "@/modules/programs/launch.functions";
import { getReleaseHealth } from "@/modules/operations/release-health.functions";
import { getOperationsActions } from "@/modules/operations/action-workspace.functions";
import { OperationsWorkspace } from "@/components/operations/OperationsWorkspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/operations/")({
  validateSearch: (search: Record<string, unknown>): { siteId?: string; programId?: string; action?: string } => ({
    siteId: typeof search.siteId === "string" ? search.siteId : undefined,
    programId: typeof search.programId === "string" ? search.programId : undefined,
    action: typeof search.action === "string" ? search.action : undefined,
  }),
  beforeLoad: async ({ search }) => {
    if (search.action) return;
    // Resume is a convenience, not a prerequisite for operating an existing school.
    const entry = await getLaunchEntry({ data: { siteId: search.siteId, programId: search.programId } }).catch(() => null);
    if (entry) throw redirect({ to: "/operations/launch", search: entry, replace: true });
  },
  loaderDeps: ({ search }) => ({ siteId: search.siteId, programId: search.programId }),
  loader: ({ deps }) => safeLoader(async () => {
    const operations = await getOperationsActions({ data: deps });
    const [health, commandCenter, dashboard, launches] = await Promise.all([
      getReleaseHealth().catch(() => null),
      getLiveOperationsCommandCenter({ data: deps }).catch(() => null),
      getLiveFullFlowOperations({ data: deps }).catch(() => null),
      import("@/modules/programs/launch.functions").then(module => module.listLaunches()).catch(() => null),
    ]);
    return { operations, health, commandCenter, dashboard, launches, authError: "" };
  })(),
  component: OperationsPage,
});

function OperationsPage() {
  const result = Route.useLoaderData();
  if (!result.ok) {
    return <LoaderFailure title="Site Today" eyebrow="CAN OS · Operations" outcome={result} />;
  }
  return <OperationsWorkspace data={result.data} selected={Route.useSearch()} />;
}
