import {readCanonicalBlueprintConfigurationService,readCanonicalBlueprintReviewService,readCanonicalBlueprintReviewHistoryService,createCanonicalBlueprintConfigurationService,saveCanonicalBlueprintConfigurationService,submitCanonicalBlueprintConfigurationService,decideCanonicalBlueprintReviewService,executeCanonicalBlueprintConfigurationService} from "./blueprint-commands.server";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { getBlueprintPlanningContext } from "./verified-site-planning.server";
import { assertCapability } from "@/domain/command-context";
import {
  createBlueprintConfigurationInputSchema,
  saveBlueprintConfigurationInputSchema,
  submitBlueprintConfigurationInputSchema,
} from "@/domain/blueprint-configuration";
import {
  blueprintReviewReadInputSchema,
  blueprintReviewHistoryInputSchema,
  decideBlueprintReviewInputSchema,
} from "@/domain/blueprint-review";
import { programDiscoveryInputSchema } from "@/domain/program-discovery";
import { getAvailableOfferings } from "@/modules/programs/program-discovery.server";
import { blueprintReferenceCatalogInputSchema } from "@/domain/blueprint-reference-catalog";
import { getBlueprintReferenceCatalog } from "./blueprint-reference-catalog.server";
import { executeBlueprintConfigurationInputSchema } from "@/domain/blueprint-execution";
import { blueprintWorkspaceInputSchema, getCanonicalBlueprintWorkspace } from "./blueprint-workspace.server";
import { getCanonicalBlueprintReviewQueue } from "./blueprint-review-queue.server";
import { blueprintReviewEvidenceInputSchema, listBlueprintReviewEvidence } from "./blueprint-review-evidence.server";

function noStore() {
  setResponseHeader("Cache-Control", "private, no-store");
}

export const readCanonicalBlueprintHome = createServerFn({ method: "GET" })
  .handler(async () => {
    noStore();
    const context = await getBlueprintPlanningContext(getRequest());
    assertCapability(context, "blueprint.read");
    return {
      role: context.role,
      siteIds: context.scope.siteIds ?? [],
      organizationId: context.scope.organizationIds?.[0] ?? null,
      referencesEnabled: true,
    };
  });

export const exploreCanonicalBlueprintReferences = createServerFn({ method: "GET" })
  .validator((value: unknown) => blueprintReferenceCatalogInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    return getBlueprintReferenceCatalog(await getBlueprintPlanningContext(getRequest()), data);
  });

export const discoverCanonicalBlueprintOfferings = createServerFn({ method: "GET" })
  .validator((value: unknown) => programDiscoveryInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    return getAvailableOfferings(await getBlueprintPlanningContext(getRequest()), data);
  });

export const readCanonicalBlueprintWorkspace = createServerFn({ method: "GET" })
  .validator((value: unknown) => blueprintWorkspaceInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    return getCanonicalBlueprintWorkspace(await getBlueprintPlanningContext(getRequest()), data);
  });

export const readCanonicalBlueprintConfiguration=createServerFn({method:"GET"})
 .validator((value:unknown)=>z.object({configurationId:z.string().uuid()}).strict().parse(value))
 .handler(async({data})=>{noStore();return readCanonicalBlueprintConfigurationService(getRequest(),data);});

export const createCanonicalBlueprintConfiguration=createServerFn({method:"POST"})
  .validator((value:unknown)=>createBlueprintConfigurationInputSchema.parse(value))
  .handler(async({data})=>{noStore();return createCanonicalBlueprintConfigurationService(getRequest(),data);});

export const saveCanonicalBlueprintConfiguration=createServerFn({method:"POST"})
  .validator((value:unknown)=>saveBlueprintConfigurationInputSchema.parse(value))
  .handler(async({data})=>{noStore();return saveCanonicalBlueprintConfigurationService(getRequest(),data);});

export const submitCanonicalBlueprintConfiguration=createServerFn({method:"POST"})
  .validator((value:unknown)=>submitBlueprintConfigurationInputSchema.parse(value))
  .handler(async({data})=>{noStore();return submitCanonicalBlueprintConfigurationService(getRequest(),data);});

export const listCanonicalBlueprintReviewEvidence = createServerFn({ method: "GET" })
  .validator((value: unknown) => blueprintReviewEvidenceInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    return listBlueprintReviewEvidence(await getCanonicalCommandContext(getRequest()), data);
  });

export const listCanonicalBlueprintReviews = createServerFn({ method: "GET" })
  .handler(async () => {
    noStore();
    return getCanonicalBlueprintReviewQueue(await getCanonicalCommandContext(getRequest()));
  });

export const readCanonicalBlueprintReview = createServerFn({ method: "GET" })
  .validator((value: unknown) => blueprintReviewReadInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    return readCanonicalBlueprintReviewService(getRequest(),data);
  });

export const readCanonicalBlueprintReviewHistory = createServerFn({ method: "GET" })
  .validator((value: unknown) => blueprintReviewHistoryInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    return readCanonicalBlueprintReviewHistoryService(getRequest(),data);
  });

export const decideCanonicalBlueprintReview=createServerFn({method:"POST"})
  .validator((value:unknown)=>decideBlueprintReviewInputSchema.parse(value))
  .handler(async({data})=>{noStore();return decideCanonicalBlueprintReviewService(getRequest(),data);});

export const executeCanonicalBlueprintConfiguration=createServerFn({method:"POST"})
  .validator((value:unknown)=>executeBlueprintConfigurationInputSchema.parse(value))
  .handler(async({data})=>{noStore();return executeCanonicalBlueprintConfigurationService(getRequest(),data);});
