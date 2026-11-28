import {z} from "zod";
import {getCanonicalCommandContext} from "@/modules/identity/canonical-command-context.server";
import {getBlueprintPlanningContext} from "./verified-site-planning.server";
import {AuthorizationError} from "@/domain/command-context";
import {requireBlueprintSiteScope} from "@/domain/blueprint-studio-scope";
import {createBlueprintConfigurationInputSchema,saveBlueprintConfigurationInputSchema,submitBlueprintConfigurationInputSchema} from "@/domain/blueprint-configuration";
import {decideBlueprintReviewInputSchema} from "@/domain/blueprint-review";
import {executeBlueprintConfigurationInputSchema} from "@/domain/blueprint-execution";
import {createBlueprintConfiguration,getBlueprintConfiguration,saveBlueprintConfiguration,submitBlueprintConfiguration} from "./blueprint-configuration.server";
import {decideBlueprintReview,getBlueprintReview,getBlueprintReviewHistory} from "./blueprint-review.server";
import {executeBlueprintConfiguration} from "./blueprint-execution.server";
export async function createCanonicalBlueprintConfigurationService(request:Request,raw:unknown){
    const data=createBlueprintConfigurationInputSchema.parse(raw);
    const context = await getBlueprintPlanningContext(request);
    requireBlueprintSiteScope(context, data.version.config);
    return createBlueprintConfiguration(context, data);
}

export async function saveCanonicalBlueprintConfigurationService(request:Request,raw:unknown){
    const data=saveBlueprintConfigurationInputSchema.parse(raw);
    const context = await getBlueprintPlanningContext(request);
    const siteId = requireBlueprintSiteScope(context, data.version.config);
    const existing = await getBlueprintConfiguration(context, data.configurationId);
    if (requireBlueprintSiteScope(context, existing.config) !== siteId) {
      throw new AuthorizationError("Blueprint configuration Site cannot be reassigned");
    }
    return saveBlueprintConfiguration(context, data);
}

export async function submitCanonicalBlueprintConfigurationService(request:Request,raw:unknown){
    const data=submitBlueprintConfigurationInputSchema.parse(raw);
    const context = await getBlueprintPlanningContext(request);
    const existing = await getBlueprintConfiguration(context, data.configurationId);
    requireBlueprintSiteScope(context, existing.config);
    return submitBlueprintConfiguration(context, data);
}

export async function decideCanonicalBlueprintReviewService(request:Request,raw:unknown){
    const data=decideBlueprintReviewInputSchema.parse(raw);
    return decideBlueprintReview(await getCanonicalCommandContext(request), data);
}

export async function executeCanonicalBlueprintConfigurationService(request:Request,raw:unknown){
    const data=executeBlueprintConfigurationInputSchema.parse(raw);
    return executeBlueprintConfiguration(await getCanonicalCommandContext(request), data);
}

export async function readCanonicalBlueprintConfigurationService(request:Request,raw:unknown){
 const data=z.object({configurationId:z.string().uuid()}).strict().parse(raw);
    const context = await getBlueprintPlanningContext(request);
    const detail = await getBlueprintConfiguration(context, data.configurationId);
    requireBlueprintSiteScope(context, detail.config);
    return detail;
}
export async function readCanonicalBlueprintReviewService(request:Request,raw:unknown){
 return getBlueprintReview(await getBlueprintPlanningContext(request),raw);
}
export async function readCanonicalBlueprintReviewHistoryService(request:Request,raw:unknown){
 return getBlueprintReviewHistory(await getBlueprintPlanningContext(request),raw);
}
