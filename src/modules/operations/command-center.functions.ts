import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getSchoolOperationsCommandCenter } from "./command-center-service";
import { readFullFlowOperations } from "./full-flow-dashboard.server";
import { setResponseHeader } from "@tanstack/react-start/server";
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

/** Live student-free school journey metrics, constrained by the selected verified grant. */
export const getLiveFullFlowOperations=createServerFn({method:"GET"})
 .validator((value:unknown)=>operationsSelectionSchema.parse(value??{}))
 .handler(async({data})=>{
   const actor=await getCommandContext(getRequest());
   const scope=await resolveOperationsSelection(actor,data);
   setResponseHeader("Cache-Control","private, no-store");
   return readFullFlowOperations({...actor,scope:{...actor.scope,
     siteIds:scope.siteIds,programIds:scope.programIds}});
 });
