import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getPartnerWebsitePreview } from "./site-website-preview.server";
import {AuthorizationError} from "@/domain/command-context";
import { z } from "zod";

/** Signed-in Site partner, explicit site role assignment; never an anonymous
 * tenant-host preview, publisher approval API or family-data endpoint. */
export const getPartnerWebsitePreviewView = createServerFn({ method: "GET" })
  .validator((value:unknown)=>z.object({siteId:z.string().uuid().optional()}).strict().parse(value??{}))
  .handler(async ({data}) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor=await getCommandContext(getRequest());
    if(data.siteId&&actor.grantSiteId!==data.siteId)throw new AuthorizationError("intended church website Site");
    return getPartnerWebsitePreview(actor);
  });

import {
  siteLocalContentLimits, siteLocalImageConsentStates, siteLocalImageMaxBase64Length,
  siteLocalThemes,
} from "@/domain/site-local-content";
import { publishPartnerLocalContent } from "./site-local-content.server";

const localFields = Object.fromEntries(
  Object.entries(siteLocalContentLimits).map(([name, max]) => [
    name, z.string().max(max),
  ]),
) as Record<keyof typeof siteLocalContentLimits, z.ZodString>;
const localContentSchema = z.object({
  ...localFields,
  branding: z.object({
    theme: z.enum(siteLocalThemes),
    heroImage: z.object({
      dataUrl: z.string().max(siteLocalImageMaxBase64Length + 32),
      altText: z.string().max(180),
      rightsConfirmed: z.boolean(),
      childImageConsent: z.enum(siteLocalImageConsentStates),
    }).strict().nullable(),
  }).strict(),
}).strict();

export const publishChurchWebsiteContent = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    expectedRevision: z.number().int().nonnegative(),
    siteId:z.string().uuid().optional(),
    content: localContentSchema,
  }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor=await getCommandContext(getRequest());
    if(data.siteId&&actor.grantSiteId!==data.siteId)throw new AuthorizationError("intended church website Site");
    return publishPartnerLocalContent(actor, {
      operation: "save", expectedRevision: data.expectedRevision,
      content: data.content,
    });
  });

export const restoreChurchWebsiteContent = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    expectedRevision: z.number().int().nonnegative(),
    restoreRevision: z.number().int().positive(),
    siteId:z.string().uuid().optional(),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor=await getCommandContext(getRequest());
    if(data.siteId&&actor.grantSiteId!==data.siteId)throw new AuthorizationError("intended church website Site");
    return publishPartnerLocalContent(actor, {
      operation: "restore", expectedRevision: data.expectedRevision,
      restoreRevision: data.restoreRevision,
    });
  });
