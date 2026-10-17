import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getSchoolOperationsCommandCenter } from "./command-center-service";
export const getLiveOperationsCommandCenter=createServerFn({method:"GET"})
 .handler(async()=>getSchoolOperationsCommandCenter(await getCommandContext(getRequest())));
