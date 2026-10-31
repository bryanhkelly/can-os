import { Link } from "@tanstack/react-router";
import type { LaunchGuidanceTask } from "@/domain/launch-guidance";
import type { listLaunches } from "@/modules/programs/launch.functions";

type Launch = Awaited<ReturnType<typeof listLaunches>>["launches"][number];

export function LaunchTaskDestination({ launch, task }: { launch: Launch; task: LaunchGuidanceTask }) {
  if (task.requiresRegistrarReview) {
    return <Link to="/operations/launch/$programId" params={{programId:launch.id}}
      search={{siteId:launch.siteId??undefined,programId:undefined}}
      className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2 text-sm font-semibold">
      Review requirement details
    </Link>;
  }
  if (task.action === "academics" || task.action === "review") {
    return <Link to="/operations/launch/$programId" params={{ programId: launch.id }}
      search={{ siteId: launch.siteId ?? undefined, programId: undefined }}
      className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
      Open guided setup
    </Link>;
  }
  if (task.action === "admissions") {
    return <Link to="/admissions/intake" search={{ siteId: launch.siteId ?? undefined, programId: launch.id }}
      className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
      Open family intake
    </Link>;
  }
  return null;
}

