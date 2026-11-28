import {z} from "zod";
import {parseCommandInput} from "@/domain/command-input";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {changeSitePublication,changeSitePublicIdentity,reserveSitePublicAddress} from "./site-publication.server";
import {changeAcademicProgramPublication} from "./academic-program-publication.server";
const uuid=z.string().uuid();

export const renameSitePublicIdentityInput=z.object({
    siteId: uuid, name: z.string().trim().min(2).max(120),
    slug: z.string().min(3).max(48), expectedName: z.string(),
    expectedRevision: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(10).max(500), contentReviewed: z.boolean(),
  }).strict();
export async function renameSitePublicIdentityService(request:Request,raw:unknown){
 const data=parseCommandInput(renameSitePublicIdentityInput,raw);
 return changeSitePublicIdentity(await getCommandContext(request),data);
}

export const reserveSitePublicationAddressInput=z.object({
    siteId: uuid,
    slug: z.string().min(3).max(48),
  }).strict();
export async function reserveSitePublicationAddressService(request:Request,raw:unknown){
 const data=parseCommandInput(reserveSitePublicationAddressInput,raw);
 return reserveSitePublicAddress(await getCommandContext(request),data);
}

export const setSitePublicationStatusInput=z.object({
    siteId: uuid,
    action: z.enum(["publish", "unpublish", "republish"]),
    expectedRevision: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(10).max(500),
    contentReviewed: z.boolean(),
  }).strict();
export async function setSitePublicationStatusService(request:Request,raw:unknown){
 const data=parseCommandInput(setSitePublicationStatusInput,raw);
 return changeSitePublication(await getCommandContext(request),data);
}

export const setAcademicProgramMarketingStatusInput=z.object({
    siteId: uuid,
    programId: uuid,
    action: z.enum(["publish", "unpublish"]),
    expectedRevision: z.string().datetime({ offset: true }).nullable(),
    summary: z.string().max(2000),
    reason: z.string().trim().min(10).max(500),
    contentReviewed: z.boolean(),
  }).strict();
export async function setAcademicProgramMarketingStatusService(request:Request,raw:unknown){
 const data=parseCommandInput(setAcademicProgramMarketingStatusInput,raw);
 return changeAcademicProgramPublication(await getCommandContext(request),data);
}
