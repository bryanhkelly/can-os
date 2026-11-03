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
  website:z.union([z.string().trim().url().max(500),z.literal("")]),
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

export function approvedIdentityFacts(siteId:string,address:unknown,
  metadata:Record<string,unknown>|null,now=new Date()) {
  const parsed=identityReviewSchema.safeParse(metadata?.publicParentIdentityReview);
  const result:{
    publicAddress?:PublicClaim<string>;
    publicContact?:PublicClaim<string>;
  }={};
  if(!parsed.success || parsed.data.reviewedAt>now.toISOString() ||
    (parsed.data.expiresOn && parsed.data.expiresOn<now.toISOString().slice(0,10)))
    return result;
  const reviewed=parsed.data;
  const physical=canonicalPublicAddress(address);
  if(physical && reviewed.addressDigest===sourceDigest(siteId,"address",physical)){
    const display=[physical.street1,physical.street2,
      physical.city+", "+physical.state+" "+physical.postalCode,
      physical.country].filter(Boolean).join(", ");
    result.publicAddress=verifiedPublicClaim(display,"organization_site",reviewed.revision);
  }
  const contact=canonicalPublicContact(metadata?.setupContact);
  if(contact && reviewed.contactDigest===sourceDigest(siteId,"contact",contact)){
    const channels=[contact.email,contact.phone,contact.website].filter(Boolean);
    result.publicContact=verifiedPublicClaim(
      channels.join(" · "),"organization_site",reviewed.revision);
  }
  return result;
}

