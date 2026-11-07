import { useSchoolConfigurationNavigation } from "@/components/launch-studio/SchoolConfigurationContext";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { LaunchGuidanceTask } from "@/domain/launch-guidance";
import type { listLaunches } from "@/modules/programs/launch.functions";

type Launch = Awaited<ReturnType<typeof listLaunches>>["launches"][number];

export function LaunchTaskDestination({ launch, task, hubMode=false }: { hubMode?:boolean;launch: Launch; task: LaunchGuidanceTask }) {
  const navigation=useSchoolConfigurationNavigation();
  if(hubMode && (task.requiresRegistrarReview || task.action === "academics" || task.action === "review"))
    return <Button asChild><Link to={navigation.modulePath} params={{module:"academics"}} search={{siteId:launch.siteId??undefined,programId:launch.id}}>Review academic configuration</Link></Button>;
  if (task.requiresRegistrarReview) {
    return <Button asChild><Link to="/launch/school/$programId" params={{programId:launch.id}}
      search={{siteId:launch.siteId??undefined,programId:undefined}}
      >
      Review requirement details
    </Link></Button>;
  }
  if (task.action === "academics" || task.action === "review") {
    return <Button asChild><Link to="/launch/school/$programId" params={{ programId: launch.id }}
      search={{ siteId: launch.siteId ?? undefined, programId: undefined }}
      >
      Open guided setup
    </Link></Button>;
  }
  if (task.action === "admissions") {
    return <Button asChild><Link to="/admissions/intake" search={{ siteId: launch.siteId ?? undefined, programId: launch.id }}
      >
      Open family intake
    </Link></Button>;
  }
  return null;
}

