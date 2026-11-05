import { getLiveOperationsCommandCenter, getLiveFullFlowOperations } from "@/modules/operations/command-center.functions";
import { getReleaseHealth } from "@/modules/operations/release-health.functions";
import { getOperationsActions } from "@/modules/operations/action-workspace.functions";
import { OperationsWorkspace } from "@/components/operations/OperationsWorkspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { supplementaryRead } from "@/lib/supplementary-read";

export const loadOperationsHome = (deps: { siteId?: string; programId?: string }) => safeLoader(async () => {
  const operations = await getOperationsActions({ data: deps });
  const [health, commandCenter, dashboard, launches] = await Promise.all([
    supplementaryRead(() => getReleaseHealth(), () => false),
    supplementaryRead(() => getLiveOperationsCommandCenter({ data: deps }), () => false),
    supplementaryRead(() => getLiveFullFlowOperations({ data: deps }), () => false),
    supplementaryRead(() => import("@/modules/programs/launch.functions").then(module => module.listLaunches()),
      data => data.launches.length === 0),
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
