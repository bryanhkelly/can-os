import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { DomainError } from "@/domain/errors";
import {
  createBlueprintConfigurationInputSchema,
  saveBlueprintConfigurationInputSchema,
  submitBlueprintConfigurationInputSchema,
} from "@/domain/blueprint-configuration";
import {
  blueprintReviewReadInputSchema,
  decideBlueprintReviewInputSchema,
} from "@/domain/blueprint-review";
import { executeBlueprintConfigurationInputSchema } from "@/domain/blueprint-execution";
import { blueprintWorkspaceInputSchema, getCanonicalBlueprintWorkspace } from "./blueprint-workspace.server";
import {
  createBlueprintConfiguration,
  getBlueprintConfiguration,
  saveBlueprintConfiguration,
  submitBlueprintConfiguration,
} from "./blueprint-configuration.server";
import { decideBlueprintReview, getBlueprintReview } from "./blueprint-review.server";
import { executeBlueprintConfiguration } from "./blueprint-execution.server";

/** These commands remain disabled until the production RLS roles and acceptance tests exist. */
export function requireCanonicalBlueprintWriteEnabled(): void {
  if (process.env.CAN_CANONICAL_BLUEPRINT_WRITE_ENABLED !== "true") {
    throw new DomainError("UNAVAILABLE", "Canonical Blueprint authoring is not yet enabled.");
  }
}

function noStore() {
  setResponseHeader("Cache-Control", "private, no-store");
}

export const readCanonicalBlueprintWorkspace = createServerFn({ method: "GET" })
  .validator((value: unknown) => blueprintWorkspaceInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    requireCanonicalBlueprintWriteEnabled();
    return getCanonicalBlueprintWorkspace(await getCommandContext(getRequest()), data);
  });

export const readCanonicalBlueprintConfiguration = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ configurationId: z.string().uuid() }).strict().parse(value))
  .handler(async ({ data }) => {
    noStore();
    requireCanonicalBlueprintWriteEnabled();
    return getBlueprintConfiguration(await getCommandContext(getRequest()), data.configurationId);
  });

export const createCanonicalBlueprintConfiguration = createServerFn({ method: "POST" })
  .validator((value: unknown) => createBlueprintConfigurationInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    requireCanonicalBlueprintWriteEnabled();
    return createBlueprintConfiguration(await getCommandContext(getRequest()), data);
  });

export const saveCanonicalBlueprintConfiguration = createServerFn({ method: "POST" })
  .validator((value: unknown) => saveBlueprintConfigurationInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    requireCanonicalBlueprintWriteEnabled();
    return saveBlueprintConfiguration(await getCommandContext(getRequest()), data);
  });

export const submitCanonicalBlueprintConfiguration = createServerFn({ method: "POST" })
  .validator((value: unknown) => submitBlueprintConfigurationInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    requireCanonicalBlueprintWriteEnabled();
    return submitBlueprintConfiguration(await getCommandContext(getRequest()), data);
  });

export const readCanonicalBlueprintReview = createServerFn({ method: "GET" })
  .validator((value: unknown) => blueprintReviewReadInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    requireCanonicalBlueprintWriteEnabled();
    return getBlueprintReview(await getCommandContext(getRequest()), data);
  });

export const decideCanonicalBlueprintReview = createServerFn({ method: "POST" })
  .validator((value: unknown) => decideBlueprintReviewInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    requireCanonicalBlueprintWriteEnabled();
    return decideBlueprintReview(await getCommandContext(getRequest()), data);
  });

export const executeCanonicalBlueprintConfiguration = createServerFn({ method: "POST" })
  .validator((value: unknown) => executeBlueprintConfigurationInputSchema.parse(value))
  .handler(async ({ data }) => {
    noStore();
    requireCanonicalBlueprintWriteEnabled();
    return executeBlueprintConfiguration(await getCommandContext(getRequest()), data);
  });
