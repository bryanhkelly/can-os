import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { AuthorizationError } from "@/domain/command-context";
import { requireBlueprintSiteScope } from "@/domain/blueprint-studio-scope";
import {
  createBlueprintConfigurationInputSchema,
  saveBlueprintConfigurationInputSchema,
  submitBlueprintConfigurationInputSchema,
} from "@/domain/blueprint-configuration";
import {
  blueprintReviewReadInputSchema,
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
import {
  createBlueprintConfiguration,
  getBlueprintConfiguration,
  saveBlueprintConfiguration,
  submitBlueprintConfiguration,
} from "./blueprint-configuration.server";
import { decideBlueprintReview, getBlueprintReview } from "./blueprint-review.server";
import { executeBlueprintConfiguration } from "./blueprint-execution.server";

function noStore() {
  setResponseHeader("Cache-Control", "private, no-store");
}

export const readCanonicalBlueprintHome = createServerFn({ method: "GET" })
  .handler(async () => {
    noStore();
    const context = await getCanonicalCommandContext(getRequest());
    return {
      role: context.role,
      siteIds: context.scope.siteIds ?? [],
      organizationId: context.scope.organizationIds?.[0] ?? null,
      referencesEnabled: process.env.CAN_CANONICAL_CATALOG_ENABLED === "true",
    };
  });

export const exploreCanonicalBlueprintReferences = createServerFn({ method: "GET" })
  .validator((value: unknown) => blueprintReferenceCatalogInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    return getBlueprintReferenceCatalog(await getCanonicalCommandContext(getRequest()), data);
  });

export const discoverCanonicalBlueprintOfferings = createServerFn({ method: "GET" })
  .validator((value: unknown) => programDiscoveryInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    return getAvailableOfferings(await getCanonicalCommandContext(getRequest()), data);
  });

export const readCanonicalBlueprintWorkspace = createServerFn({ method: "GET" })
  .validator((value: unknown) => blueprintWorkspaceInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    return getCanonicalBlueprintWorkspace(await getCanonicalCommandContext(getRequest()), data);
  });

export const readCanonicalBlueprintConfiguration = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ configurationId: z.string().uuid() }).strict().parse(value))
  .handler(async ({ data }) => {
    noStore();
    const context = await getCanonicalCommandContext(getRequest());
    const detail = await getBlueprintConfiguration(context, data.configurationId);
    requireBlueprintSiteScope(context, detail.config);
    return detail;
  });

export const createCanonicalBlueprintConfiguration = createServerFn({ method: "POST" })
  .validator((value: unknown) => createBlueprintConfigurationInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    const context = await getCanonicalCommandContext(getRequest());
    requireBlueprintSiteScope(context, data.version.config);
    return createBlueprintConfiguration(context, data);
  });

export const saveCanonicalBlueprintConfiguration = createServerFn({ method: "POST" })
  .validator((value: unknown) => saveBlueprintConfigurationInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    const context = await getCanonicalCommandContext(getRequest());
    const siteId = requireBlueprintSiteScope(context, data.version.config);
    const existing = await getBlueprintConfiguration(context, data.configurationId);
    if (requireBlueprintSiteScope(context, existing.config) !== siteId) {
      throw new AuthorizationError("Blueprint configuration Site cannot be reassigned");
    }
    return saveBlueprintConfiguration(context, data);
  });

export const submitCanonicalBlueprintConfiguration = createServerFn({ method: "POST" })
  .validator((value: unknown) => submitBlueprintConfigurationInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    const context = await getCanonicalCommandContext(getRequest());
    const existing = await getBlueprintConfiguration(context, data.configurationId);
    requireBlueprintSiteScope(context, existing.config);
    return submitBlueprintConfiguration(context, data);
  });

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
    return getBlueprintReview(await getCanonicalCommandContext(getRequest()), data);
  });

export const decideCanonicalBlueprintReview = createServerFn({ method: "POST" })
  .validator((value: unknown) => decideBlueprintReviewInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    return decideBlueprintReview(await getCanonicalCommandContext(getRequest()), data);
  });

export const executeCanonicalBlueprintConfiguration = createServerFn({ method: "POST" })
  .validator((value: unknown) => executeBlueprintConfigurationInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    return executeBlueprintConfiguration(await getCanonicalCommandContext(getRequest()), data);
  });
