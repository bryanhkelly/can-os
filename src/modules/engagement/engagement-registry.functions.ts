import { createServerFn } from "@tanstack/react-start";
import {
  createEngagementDefinitionInput,
  createEngagementGoLinkInput,
  listEngagementGoLinksInput,
  retireEngagementDefinitionInput,
  revokeEngagementGoLinkInput,
  listSiteEngagementDefinitionsInput,
  prepareEngagementEmailDraftInput,
  listOwnerEngagementDestinationsInput,
  listOwnerEngagementDefinitionsInput,
} from "./engagement-registry.inputs";

/** Browser-safe RPC declarations. Database operations and authorization stay in the server implementation. */

export const createEngagementDefinition = createServerFn({ method: "POST" })
  .validator((input: unknown) => createEngagementDefinitionInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./engagement-registry.server");
    return implementation.createEngagementDefinition(data);
  });

export const createEngagementGoLink = createServerFn({ method: "POST" })
  .validator((input: unknown) => createEngagementGoLinkInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./engagement-registry.server");
    return implementation.createEngagementGoLink(data);
  });

export const listEngagementGoLinks = createServerFn({ method: "GET" })
  .validator((input: unknown) => listEngagementGoLinksInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./engagement-registry.server");
    return implementation.listEngagementGoLinks(data);
  });

export const retireEngagementDefinition = createServerFn({ method: "POST" })
  .validator((input: unknown) => retireEngagementDefinitionInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./engagement-registry.server");
    return implementation.retireEngagementDefinition(data);
  });

export const revokeEngagementGoLink = createServerFn({ method: "POST" })
  .validator((input: unknown) => revokeEngagementGoLinkInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./engagement-registry.server");
    return implementation.revokeEngagementGoLink(data);
  });

export const listSiteEngagementDefinitions = createServerFn({ method: "GET" })
  .validator((input: unknown) => listSiteEngagementDefinitionsInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./engagement-registry.server");
    return implementation.listSiteEngagementDefinitions(data);
  });

export const prepareEngagementEmailDraft = createServerFn({ method: "GET" })
  .validator((input: unknown) => prepareEngagementEmailDraftInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./engagement-registry.server");
    return implementation.prepareEngagementEmailDraft(data);
  });

export const listOwnerEngagementDestinations = createServerFn({ method: "GET" })
  .validator((input: unknown) => listOwnerEngagementDestinationsInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./engagement-registry.server");
    return implementation.listOwnerEngagementDestinations(data);
  });

export const listOwnerEngagementDefinitions = createServerFn({ method: "GET" })
  .validator((input: unknown) => listOwnerEngagementDefinitionsInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./engagement-registry.server");
    return implementation.listOwnerEngagementDefinitions(data);
  });
