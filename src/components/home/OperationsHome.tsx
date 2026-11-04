import { getLiveOperationsCommandCenter, getLiveFullFlowOperations } from "@/modules/operations/command-center.functions";
import { getReleaseHealth } from "@/modules/operations/release-health.functions";
import { getOperationsActions } from "@/modules/operations/action-workspace.functions";
import { OperationsWorkspace } from "@/components/operations/OperationsWorkspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const loadOperationsHome = (deps: { siteId?: string; programId?: string }) => safeLoader(async () => {
  const operations = await getOperationsActions({ data: deps });
  const [health, commandCenter, dashboard, launches] = await Promise.all([
    getReleaseHealth().catch(() => null),
    getLiveOperationsCommandCenter({ data: deps }).catch(() => null),
    getLiveFullFlowOperations({ data: deps }).catch(() => null),
    import("@/modules/programs/launch.functions").then(module => module.listLaunches()).catch(() => null),
  ]);
  return { operations, health, commandCenter, dashboard, launches, authError: "" };
})();

export function OperationsHome({ result, selected }: {
  result: Awaited<ReturnType<typeof loadOperationsHome>>;
  selected: { siteId?: string; programId?: string; action?: string };
}) {
  if (!result.ok) {
    return <LoaderFailure title="Site Today" eyebrow="Operations" outcome={result} />;
  }
  return <OperationsWorkspace data={result.data} selected={selected} />;
}
