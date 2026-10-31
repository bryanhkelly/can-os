import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { changeSitePublication, getSitePublicationDraft, reserveSitePublicAddress } from "./site-publication.server";
import { changeAcademicProgramPublication } from "./academic-program-publication.server";
import { checkPublishedSiteReachability } from "./public-host-reachability";

const uuid = z.string().uuid();

export const getSitePublicationDraftView = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ siteId: uuid }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return getSitePublicationDraft(await getCommandContext(getRequest()), data.siteId);
  });

export const reserveSitePublicationAddress = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    siteId: uuid,
    slug: z.string().min(3).max(48),
  }).strict().parse(value))
  .handler(async ({ data }) =>
    reserveSitePublicAddress(await getCommandContext(getRequest()), data));

/**
 * Explicit, scoped Site marketing-publish decision. This does not publish
 * internal school Programs, change enrollment, or configure external DNS.
 */
export const setSitePublicationStatus = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    siteId: uuid,
    action: z.enum(["publish", "unpublish"]),
    expectedRevision: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(10).max(500),
    contentReviewed: z.boolean(),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return changeSitePublication(await getCommandContext(getRequest()), data);
  });

/** Reviewed and reversible approval of academic marketing; no admissions action. */
export const setAcademicProgramMarketingStatus = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    siteId: uuid,
    programId: uuid,
    action: z.enum(["publish", "unpublish"]),
    expectedRevision: z.string().datetime({ offset: true }).nullable(),
    summary: z.string().max(2000),
    reason: z.string().trim().min(10).max(500),
    contentReviewed: z.boolean(),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return changeAcademicProgramPublication(await getCommandContext(getRequest()), data);
  });

/** Check the live published tenant hostname from a fixed CAN-owned domain.
 * This reports network reachability; it never changes publication or grants.
 */
export const verifySitePublicationReachability = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ siteId: uuid }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const draft = await getSitePublicationDraft(await getCommandContext(getRequest()), data.siteId);
    return checkPublishedSiteReachability({
      host: draft.address?.host ?? null,
      published: draft.address?.status === "published",
      hostingConfigured: draft.hostingConfigured,
    });
  });
