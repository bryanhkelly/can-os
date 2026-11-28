import {renameSitePublicIdentityInput,renameSitePublicIdentityService,reserveSitePublicationAddressInput,reserveSitePublicationAddressService,setSitePublicationStatusInput,setSitePublicationStatusService,setAcademicProgramMarketingStatusInput,setAcademicProgramMarketingStatusService} from "./site-publication-commands.server";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getSitePublicationDraft } from "./site-publication.server";
import { checkPublishedSiteReachability } from "./public-host-reachability";
import { checkEnrollmentAppReachability } from "./app-enrollment-reachability.server";
import { inspectSiteNoncreditReadiness } from "./site-noncredit-releases.server";

const uuid = z.string().uuid();

export const renameSitePublicIdentity=createServerFn({method:"POST"}).validator((raw:unknown)=>renameSitePublicIdentityInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return renameSitePublicIdentityService(getRequest(),data);
});

export const getSitePublicationDraftView = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ siteId: uuid }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return getSitePublicationDraft(await getCommandContext(getRequest()), data.siteId);
  });

export const reserveSitePublicationAddress=createServerFn({method:"POST"}).validator((raw:unknown)=>reserveSitePublicationAddressInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return reserveSitePublicationAddressService(getRequest(),data);
});

/**
 * Explicit, scoped Site marketing-publish decision. This does not publish
 * internal school Programs, change enrollment, or configure external DNS.
 */
export const setSitePublicationStatus=createServerFn({method:"POST"}).validator((raw:unknown)=>setSitePublicationStatusInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return setSitePublicationStatusService(getRequest(),data);
});

/** Reviewed and reversible approval of academic marketing; no admissions action. */
export const setAcademicProgramMarketingStatus=createServerFn({method:"POST"}).validator((raw:unknown)=>setAcademicProgramMarketingStatusInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return setAcademicProgramMarketingStatusService(getRequest(),data);
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

/** A published Site URL, registration destination and deployed source revision
 * have distinct independent checks. This command grants no publishing rights
 * or new enrollment and does not trust user-supplied origins.
 */
export const verifySiteEnrollmentHandoff = createServerFn({method:"POST"})
  .validator((v:unknown)=>z.object({
    siteId:uuid,
    expectedSourceRevision:z.string().regex(/^[a-f0-9]{40}$/i).optional(),
  }).strict().parse(v))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const draft=await getSitePublicationDraft(await getCommandContext(getRequest()),data.siteId);
    const [website,application,noncredit]=await Promise.all([
      checkPublishedSiteReachability({
        host:draft.address?.host??null,
        published:draft.address?.status==="published",
        hostingConfigured:draft.hostingConfigured,
      }),
      checkEnrollmentAppReachability({
        configuredOrigin:process.env.CAN_ACCESS_PUBLIC_ORIGIN,
        expectedSourceRevision:data.expectedSourceRevision??null,
      }),
      inspectSiteNoncreditReadiness(data.siteId),
    ]);
    return {
      website,application,noncredit,
      ready:website.status==="live"&&application.status==="verified"&&noncredit.status==="ready",
    };
  });
