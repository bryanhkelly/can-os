import { sitePaletteIds, siteTypographyIds, siteTemplateIds } from "@/domain/site-theme";
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
  siteLocalThemes, normalizeSiteLocalContent,
} from "@/domain/site-local-content";
import { publishPartnerLocalContent } from "./site-local-content.server";

const localFields = {
  welcomeMessage: z.string().max(siteLocalContentLimits.welcomeMessage),
  localDescription: z.string().max(siteLocalContentLimits.localDescription),
  denomination: z.string().max(siteLocalContentLimits.denomination),
  statementOfFaith: z.string().max(siteLocalContentLimits.statementOfFaith),
  spiritualFormation: z.string().max(siteLocalContentLimits.spiritualFormation),
  churchHistory: z.string().max(siteLocalContentLimits.churchHistory).optional(),
  communityOutreach: z.string().max(siteLocalContentLimits.communityOutreach).optional(),
  schoolVision: z.string().max(siteLocalContentLimits.schoolVision).optional(),
  leadershipWelcome: z.string().max(siteLocalContentLimits.leadershipWelcome).optional(),
  localTraditions: z.string().max(siteLocalContentLimits.localTraditions).optional(),
};
const localContentSchema = z.object({
  ...localFields,
  branding: z.object({
    theme: z.enum(siteLocalThemes),
    paletteId: z.enum(sitePaletteIds).optional(),
    typographyId: z.enum(siteTypographyIds).optional(),
    templateId: z.enum(siteTemplateIds).optional(),
    heroImage: z.object({
      dataUrl: z.string().max(siteLocalImageMaxBase64Length + 32),
      altText: z.string().max(180),
      rightsConfirmed: z.boolean(),
      childImageConsent: z.enum(siteLocalImageConsentStates),
    }).strict().nullable(),
  }).strict(),
}).strict();

/** Render only to an authenticated, Site-specific editor. No draft is stored
 * or published by this read-only preview; institutional data stays approved-only. */
export const previewChurchWebsiteDraft = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    siteId: z.string().uuid().optional(),
    content: localContentSchema,
  }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    if (data.siteId && actor.grantSiteId !== data.siteId) throw new AuthorizationError("intended church website Site");
    const preview = await getPartnerWebsitePreview(actor, normalizeSiteLocalContent(data.content));
    return { previewHtml: preview.previewHtml, previewPages: preview.previewPages };
  });

/** Private, immutable website draft revision. Public content is unchanged. */
export const saveChurchWebsiteDraft = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    expectedRevision: z.number().int().nonnegative(),
    siteId: z.string().uuid().optional(),
    content: localContentSchema,
  }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    if (data.siteId && actor.grantSiteId !== data.siteId) throw new AuthorizationError("intended church website Site");
    return publishPartnerLocalContent(actor, {
      operation: "draft", expectedRevision: data.expectedRevision, content: data.content,
    });
  });

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
