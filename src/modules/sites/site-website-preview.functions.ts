import { sitePaletteIds, siteTypographyIds, siteTemplateIds, siteFontCatalog, type SiteFontId } from "@/domain/site-theme";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getPartnerWebsitePreview } from "./site-website-preview.server";
import {AuthorizationError} from "@/domain/command-context";
import { z } from "zod";

/** Signed-in Site editor or unaffiliated Site Administrator; never an anonymous
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
  siteLocalThemes, normalizeSiteLocalContent, websiteStarterFieldIds, siteLocalImagePublicationGaps,
} from "@/domain/site-local-content";
import { publishPartnerLocalContent } from "./site-local-content.server";

const localFields = {
  heroHeadline: z.string().max(siteLocalContentLimits.heroHeadline).optional(),
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
const starterFieldSchemas = Object.fromEntries(websiteStarterFieldIds.map(field =>
  [field, z.string().max(siteLocalContentLimits[field])],
)) as { [K in typeof websiteStarterFieldIds[number]]: z.ZodString };
const siteFontIds = Object.keys(siteFontCatalog) as [SiteFontId, ...SiteFontId[]];
const localContentSchema = z.object({
  ...localFields,
  editorialBaseline: z.object({
    version: z.literal(1),
    fields: z.object(starterFieldSchemas).strict(),
  }).strict().optional(),
  branding: z.object({
    theme: z.enum(siteLocalThemes),
    paletteId: z.enum(sitePaletteIds).optional(),
    typographyId: z.enum(siteTypographyIds).optional(),
    templateId: z.enum(siteTemplateIds).optional(),
    headingFontId: z.enum(siteFontIds).optional(),
    bodyFontId: z.enum(siteFontIds).optional(),
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
    const content = normalizeSiteLocalContent(data.content, { allowIncompleteImage: true });
    // Unapproved artwork stays in the editor but is never projected into a preview page.
    const safeContent = siteLocalImagePublicationGaps(content.branding.heroImage).length
      ? { ...content, branding: { ...content.branding, heroImage: null } } : content;
    const preview = await getPartnerWebsitePreview(actor, safeContent);
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

/** Explicitly prepare a private address after a Site stub exists. GETs never mutate. */
export const prepareSchoolWebsite = createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({siteId:z.string().uuid()}).strict().parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    const [{db},{requirePartnerWebsiteEditor},{ensureExistingSitePublicationDraftForLaunch}]=await Promise.all([
      import("@/db/client"),import("./site-website-authorization.server"),import("./site-public-provisioning.server"),
    ]);
    return db.transaction(async tx=>{
      const site=await requirePartnerWebsiteEditor(actor,tx,"site.website.local.publish");
      if(site.id!==data.siteId || actor.role!=="site_admin")throw new AuthorizationError("Site Administrator preparation required");
      return ensureExistingSitePublicationDraftForLaunch(tx,actor,site);
    });
  });
