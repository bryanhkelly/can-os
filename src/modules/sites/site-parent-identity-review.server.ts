import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { DomainError } from "@/domain/errors";
import { writeAudit } from "@/platform/mutation";
import {
  approvedIdentityFacts, canonicalPublicAddress, canonicalPublicContact,
  identityReviewSchema, sourceDigest,
} from "@/domain/public-parent-identity";
import { requireSitePublisher } from "./site-publication.server";

/** Independent institutional publisher review, never a Site setup edit.
 * Requiring a decision for both fields prevents one new review silently
 * extending an older approval's expiration or consent.
 */
export const publicIdentityReviewInput=z.object({
  siteId:z.string().uuid(),
  expectedSiteRevision:z.string().datetime({offset:true}),
  expectedReviewRevision:z.number().int().nonnegative(),
  addressDecision:z.enum(["approve","withdraw"]),
  contactDecision:z.enum(["approve","withdraw"]),
  expectedAddressDigest:z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  expectedContactDigest:z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  /** The reviewer must explicitly confirm this is a public visitor/mailing address,
   * not simply the legal or physical address used for school compliance. */
  publicLocationConfirmed:z.boolean(),
  /** Explicitly reviewed school-controlled channel; private staff emails and
   * numbers must NEVER be approved merely because a draft contains them. */
  schoolControlledContactConfirmed:z.boolean(),
  expiresOn:z.string().date().nullable(),
  reviewed:z.literal(true),
  reason:z.string().trim().min(10).max(500),
  evidenceReference:z.string().trim().min(10).max(500),
}).strict().superRefine((input,ctx)=>{
  if(input.addressDecision==="approve" &&
    (!input.expectedAddressDigest||!input.publicLocationConfirmed))
    ctx.addIssue({code:"custom",path:["addressDecision"],
      message:"Confirm and review this exact school-approved public address"});
  if(input.contactDecision==="approve" &&
    (!input.expectedContactDigest||!input.schoolControlledContactConfirmed))
    ctx.addIssue({code:"custom",path:["contactDecision"],
      message:"Confirm the exact school-controlled public contact channels"});
  if((input.addressDecision==="approve"||input.contactDecision==="approve") &&
    !input.expiresOn)
    ctx.addIssue({code:"custom",path:["expiresOn"],
      message:"Select a finite expiration for approved public identity"});
});

/** All privileged source fields remain authenticated; public clients use
 * readPublishedParentInformation instead. No public identity is generated
 * by merely opening this screen. */
export async function getSiteParentIdentityReview(actor:AccessContext,siteId:string) {
  const site=await requireSitePublisher(actor,siteId);
  const [row]=await db.select({
    address:sites.address,metadata:sites.metadata,updatedAt:sites.updatedAt,
  }).from(sites).where(eq(sites.id,site.id)).limit(1);
  if(!row)throw new DomainError("CONFLICT","Site changed during review");
  const address=canonicalPublicAddress(row.address);
  const contact=canonicalPublicContact(row.metadata.setupContact);
  const previous=identityReviewSchema.safeParse(row.metadata.publicParentIdentityReview);
  const current=approvedIdentityFacts(site.id,row.address,row.metadata);
  return {
    siteId:site.id,
    siteRevision:row.updatedAt.toISOString(),
    reviewRevision:previous.success?previous.data.revision:0,
    reviewedAt:previous.success?previous.data.reviewedAt:null,
    expiresOn:previous.success?previous.data.expiresOn:null,
    /** Sources are displayed privately to an authorized publisher for review;
     * browser never decides the public canDisplay flag. */
    address:{value:address,digest:address?sourceDigest(site.id,"address",address):null,
      publicApproved:current.publicAddress?.canDisplay===true},
    contact:{value:contact,digest:contact?sourceDigest(site.id,"contact",contact):null,
      publicApproved:current.publicContact?.canDisplay===true},
  };
}

/** Scoped audited mutation: locks one canonical Site row, rechecks the exact
 * address/contact under lock, then atomically publishes or revokes both claims.
 * No raw address/contact is copied to a second configuration or approval store. */
export async function changeSiteParentIdentityReview(
  actor:AccessContext,
  rawInput:z.input<typeof publicIdentityReviewInput>,
  now=new Date(),
) {
  const input=publicIdentityReviewInput.parse(rawInput);
  if(!Number.isFinite(now.getTime()))throw new DomainError("VALIDATION_FAILED","Invalid review date");
  const today=now.toISOString().slice(0,10);
  if(input.expiresOn && (input.expiresOn<today ||
      input.expiresOn>new Date(now.getTime()+366*86400000).toISOString().slice(0,10)))
    throw new DomainError("VALIDATION_FAILED","Review expiry must be within the next year");
  return db.transaction(async tx=>{
    const site=await requireSitePublisher(actor,input.siteId,tx);
    if(!actor.actorPersonId)throw new DomainError("FORBIDDEN","Institutional reviewer required");
    const [row]=await tx.select({
      address:sites.address,metadata:sites.metadata,updatedAt:sites.updatedAt,
    }).from(sites).where(eq(sites.id,site.id)).for("update").limit(1);
    if(!row)throw new DomainError("CONFLICT","Site was not found");
    const previous=identityReviewSchema.safeParse(row.metadata.publicParentIdentityReview);
    const revision=previous.success?previous.data.revision:0;
    if(input.expectedSiteRevision!==row.updatedAt.toISOString() ||
      revision!==input.expectedReviewRevision)
      throw new DomainError("CONFLICT","Site or public review changed; refresh before approving");

    const address=canonicalPublicAddress(row.address);
    const contact=canonicalPublicContact(row.metadata.setupContact);
    const digestAddress=address?sourceDigest(site.id,"address",address):null;
    const digestContact=contact?sourceDigest(site.id,"contact",contact):null;
    if(input.addressDecision==="approve" &&
      (!digestAddress || digestAddress!==input.expectedAddressDigest))
      throw new DomainError("CONFLICT","The reviewed address is missing or changed");
    if(input.contactDecision==="approve" &&
      (!digestContact || digestContact!==input.expectedContactDigest))
      throw new DomainError("CONFLICT","The reviewed school contact is missing or changed");

    const reviewed=identityReviewSchema.parse({
      version:1,revision:revision+1,reviewedByPersonId:actor.actorPersonId,
      reviewedAt:now.toISOString(),
      expiresOn:input.addressDecision==="approve" ||
        input.contactDecision==="approve" ? input.expiresOn : null,
      addressDigest:input.addressDecision==="approve" ? digestAddress : null,
      contactDigest:input.contactDecision==="approve" ? digestContact : null,
    });
    await tx.update(sites).set({
      metadata:{...row.metadata,publicParentIdentityReview:reviewed},
      updatedAt:new Date(Math.max(now.getTime(),row.updatedAt.getTime()+1)),
    }).where(eq(sites.id,site.id));
    await writeAudit(tx,actor,{
      action:"site.parent_public_identity.review",
      entityType:"site",entityId:site.id,
      scope:{siteId:site.id,organizationId:site.organizationId},
      before:{revision,
        addressApproved:Boolean(previous.success&&previous.data.addressDigest),
        contactApproved:Boolean(previous.success&&previous.data.contactDigest)},
      after:{revision:reviewed.revision,
        addressDecision:input.addressDecision,contactDecision:input.contactDecision,
        expiresOn:reviewed.expiresOn,
        evidenceReference:input.evidenceReference,reviewed:true,
        reason:input.reason},
    });
    return {siteId:site.id,reviewRevision:reviewed.revision,
      addressApproved:reviewed.addressDigest!==null,
      contactApproved:reviewed.contactDigest!==null,
      expiresOn:reviewed.expiresOn};
  });
}
