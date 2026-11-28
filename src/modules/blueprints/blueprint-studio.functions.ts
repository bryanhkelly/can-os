import {exploreCanonicalBlueprintReferencesService,discoverCanonicalBlueprintOfferingsService,readCanonicalBlueprintWorkspaceService,listCanonicalBlueprintReviewsService,listCanonicalBlueprintReviewEvidenceService} from "./blueprint-catalog-read.server";
import {readCanonicalBlueprintHomeService,readCanonicalBlueprintConfigurationService,readCanonicalBlueprintReviewService,readCanonicalBlueprintReviewHistoryService,createCanonicalBlueprintConfigurationService,saveCanonicalBlueprintConfigurationService,submitCanonicalBlueprintConfigurationService,decideCanonicalBlueprintReviewService,executeCanonicalBlueprintConfigurationService} from "./blueprint-commands.server";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
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
import { blueprintReferenceCatalogInputSchema } from "@/domain/blueprint-reference-catalog";
import { executeBlueprintConfigurationInputSchema } from "@/domain/blueprint-execution";
import { blueprintWorkspaceInputSchema } from "./blueprint-workspace.server";
import { blueprintReviewEvidenceInputSchema } from "./blueprint-review-evidence.server";

function noStore() {
  setResponseHeader("Cache-Control", "private, no-store");
}

export const readCanonicalBlueprintHome=createServerFn({method:"GET"}).handler(async()=>{noStore();return readCanonicalBlueprintHomeService(getRequest());});

export const exploreCanonicalBlueprintReferences = createServerFn({ method: "GET" })
  .validator((value: unknown) => blueprintReferenceCatalogInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    return exploreCanonicalBlueprintReferencesService(getRequest(),data);
  });

export const discoverCanonicalBlueprintOfferings = createServerFn({ method: "GET" })
  .validator((value: unknown) => programDiscoveryInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    return discoverCanonicalBlueprintOfferingsService(getRequest(),data);
  });

export const readCanonicalBlueprintWorkspace = createServerFn({ method: "GET" })
  .validator((value: unknown) => blueprintWorkspaceInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    return readCanonicalBlueprintWorkspaceService(getRequest(),data);
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
    return listCanonicalBlueprintReviewEvidenceService(getRequest(),data);
  });

export const listCanonicalBlueprintReviews = createServerFn({ method: "GET" })
  .handler(async () => {
    noStore();
    return listCanonicalBlueprintReviewsService(getRequest());
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
