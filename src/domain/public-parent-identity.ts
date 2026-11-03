import { createHash } from "node:crypto";
import { z } from "zod";
import { verifiedPublicClaim } from "./parent-information";
import type { PublicClaim } from "./parent-information";

/**
 * I-owned public-identity approval envelope. Canonical details remain in
 * sites.address and sites.metadata.setupContact, not a second CMS/config.
 * I must add an authorized reviewer/writer; missing approval fails closed.
 */
export const identityReviewSchema=z.object({
  version:z.literal(1),
  revision:z.number().int().positive(),
  reviewedByPersonId:z.string().uuid(),
  reviewedAt:z.string().datetime(),
  expiresOn:z.string().date().nullable(),
  /** Internal audited evidence pointer, never included in anonymous claims. */
  evidenceReference:z.string().trim().min(10).max(500).optional(),
  addressDigest:z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  contactDigest:z.string().regex(/^[0-9a-f]{64}$/).nullable(),
}).strict();
export const addressSchema=z.object({
  street1:z.string().trim().min(2).max(200),
  street2:z.string().trim().max(200).optional(),
  city:z.string().trim().min(2).max(120),
  state:z.string().trim().min(2).max(80),
  postalCode:z.string().trim().min(3).max(24),
  country:z.string().trim().min(2).max(80),
  county:z.string().trim().max(120).optional(),
}).passthrough();
export const contactSchema=z.object({
  displayName:z.string().trim().min(2).max(160),
  email:z.union([z.string().trim().email().max(254),z.literal("")]),
  phone:z.string().trim().max(40),
  // Setup historically saves only displayName/email/phone. Normalize omitted
  // website to an empty string so review and anonymous read hash identical
  // canonical fields, including for pre-existing three-field Site records.
  website:z.union([z.string().trim().url().max(500),z.literal("")]).default(""),
}).passthrough();
export function sourceDigest(siteId:string,category:"address"|"contact",value:unknown) {
  return createHash("sha256")
    .update(JSON.stringify([siteId,category,value])).digest("hex");
}
/** Strict, shared source canonicalization: the writer and read gate MUST
 * hash precisely the same fields in precisely the same order. */
export function canonicalPublicAddress(value:unknown) {
  const parsed=addressSchema.safeParse(value);
  if (!parsed.success) return null;
  const {street1,street2,city,state,postalCode,country,county}=parsed.data;
  return {street1,street2:street2??"",city,state,postalCode,country,county:county??""};
}
export function canonicalPublicContact(value:unknown) {
  const parsed=contactSchema.safeParse(value);
  if (!parsed.success) return null;
  const {displayName,email,phone,website}=parsed.data;
  // No bare staff profile details may supply this input. The only accepted
  // source is the canonical school setup contact, explicitly reviewed later.
  if (!email && !phone && !website) return null;
  return {displayName,email,phone,website};
}

export type PublicIdentityReviewStatus =
  "never_reviewed" | "approved" | "expired" | "source_changed" |
  "withdrawn" | "invalid_review";

/** Derived from current sources, never a persisted status. A reviewer can
 * distinguish stale/withdrawn evidence without making it public. */
export function publicIdentityReviewStatuses(
  siteId:string,address:unknown,metadata:Record<string,unknown>|null,
  now=new Date(),
):{address:PublicIdentityReviewStatus;contact:PublicIdentityReviewStatus} {
  const raw=metadata?.publicParentIdentityReview;
  if(raw==null)return {address:"never_reviewed",contact:"never_reviewed"};
  const parsed=identityReviewSchema.safeParse(raw);
  if(!parsed.success)return {address:"invalid_review",contact:"invalid_review"};
  const review=parsed.data;
  const invalidDate=!review.expiresOn ||
    review.expiresOn<now.toISOString().slice(0,10) ||
    review.reviewedAt>now.toISOString();
  const physical=canonicalPublicAddress(address);
  const contact=canonicalPublicContact(metadata?.setupContact);
  const state=(digest:string|null,canonical:object|null,
    category:"address"|"contact"):PublicIdentityReviewStatus=>{
    if(!digest)return "withdrawn";
    if(!canonical || digest!==sourceDigest(siteId,category,canonical))
      return "source_changed";
    return invalidDate?"expired":"approved";
  };
  return {
    address:state(review.addressDigest,physical,"address"),
    contact:state(review.contactDigest,contact,"contact"),
  };
}

export function approvedIdentityFacts(siteId:string,address:unknown,
  metadata:Record<string,unknown>|null,now=new Date()) {
  const parsed=identityReviewSchema.safeParse(metadata?.publicParentIdentityReview);
  const result:{
    publicAddress?:PublicClaim<string>;
    publicContact?:PublicClaim<string>;
  }={};
  if(!parsed.success)return result;
  const statuses=publicIdentityReviewStatuses(siteId,address,metadata,now);
  const reviewed=parsed.data;
  const physical=canonicalPublicAddress(address);
  if(physical && statuses.address==="approved" &&
    reviewed.addressDigest===sourceDigest(siteId,"address",physical)){
    const display=[physical.street1,physical.street2,
      physical.city+", "+physical.state+" "+physical.postalCode,
      physical.country].filter(Boolean).join(", ");
    result.publicAddress=verifiedPublicClaim(display,"organization_site",reviewed.revision);
  }
  const contact=canonicalPublicContact(metadata?.setupContact);
  if(contact && statuses.contact==="approved" &&
    reviewed.contactDigest===sourceDigest(siteId,"contact",contact)){
    const channels=[contact.email,contact.phone,contact.website].filter(Boolean);
    result.publicContact=verifiedPublicClaim(
      channels.join(" · "),"organization_site",reviewed.revision);
  }
  return result;
}

