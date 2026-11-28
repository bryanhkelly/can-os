import {getIdentityContext} from "./command-context.server";
import {getCanonicalCommandContext} from "./canonical-command-context.server";
import {getBlueprintPlanningContext} from "@/modules/blueprints/verified-site-planning.server";
import {AuthorizationError} from "@/domain/command-context";
import {createCanonicalBlueprintConfigurationService,saveCanonicalBlueprintConfigurationService,submitCanonicalBlueprintConfigurationService,decideCanonicalBlueprintReviewService,executeCanonicalBlueprintConfigurationService} from "@/modules/blueprints/blueprint-commands.server";
import {recordNativeDeploymentReadinessService} from "@/modules/programs/native-deployment-readiness.server";
import {placeNativeDeploymentSiteService} from "@/modules/programs/native-deployment-placement.server";
import {approveNativeOfferingAdoptionService} from "@/modules/programs/native-offering-adoption-command.server";
export type WorkflowMode="planning"|"canonical"|"can";
/** Existing independent native reviewer credentials remain distinct from CAN.
 * No fallback, new role, token or grant is manufactured by this adapter. */
export async function resolveGovernedWorkflow(request:Request,mode:WorkflowMode){
 if(request.method!=="POST")throw new AuthorizationError("explicit mutation");
 const context=await (mode==="planning"?getBlueprintPlanningContext(request):mode==="canonical"?getCanonicalCommandContext(request):getIdentityContext(request));
 if(!context.actorPersonId)throw new AuthorizationError("verified Person");
 return {
  createCanonicalBlueprintConfiguration:async(raw:unknown)=>{if(mode!=="planning")throw new AuthorizationError("governed workflow context");return createCanonicalBlueprintConfigurationService(request,raw);},
  saveCanonicalBlueprintConfiguration:async(raw:unknown)=>{if(mode!=="planning")throw new AuthorizationError("governed workflow context");return saveCanonicalBlueprintConfigurationService(request,raw);},
  submitCanonicalBlueprintConfiguration:async(raw:unknown)=>{if(mode!=="planning")throw new AuthorizationError("governed workflow context");return submitCanonicalBlueprintConfigurationService(request,raw);},
  decideCanonicalBlueprintReview:async(raw:unknown)=>{if(mode!=="canonical")throw new AuthorizationError("governed workflow context");return decideCanonicalBlueprintReviewService(request,raw);},
  executeCanonicalBlueprintConfiguration:async(raw:unknown)=>{if(mode!=="canonical")throw new AuthorizationError("governed workflow context");return executeCanonicalBlueprintConfigurationService(request,raw);},
  recordNativeDeploymentReadiness:async(raw:unknown)=>{if(mode!=="can")throw new AuthorizationError("governed workflow context");return recordNativeDeploymentReadinessService(request,raw);},
  placeNativeDeploymentSite:async(raw:unknown)=>{if(mode!=="canonical")throw new AuthorizationError("governed workflow context");return placeNativeDeploymentSiteService(request,raw);},
  approveNativeOfferingAdoption:async(raw:unknown)=>{if(mode!=="canonical")throw new AuthorizationError("governed workflow context");return approveNativeOfferingAdoptionService(request,raw);},
 };
}
