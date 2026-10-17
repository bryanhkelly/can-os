import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getSchoolOperationsCommandCenter } from "./command-center-service";
import { operationsSelectionSchema, resolveOperationsSelection } from "./operations-scope.server";

/** The launch readiness summary must use the same verified selection as Actions. */
export const getLiveOperationsCommandCenter=createServerFn({method:"GET"})
 .validator((value:unknown)=>operationsSelectionSchema.parse(value??{}))
 .handler(async({data})=>{
  const actor=await getCommandContext(getRequest());
  const scoped=await resolveOperationsSelection(actor,data);
  return getSchoolOperationsCommandCenter({...actor,scope:{...actor.scope,
   siteIds:scoped.siteIds,programIds:scoped.programIds}});
 });
