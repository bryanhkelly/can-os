import { createHash } from "node:crypto";
import { z } from "zod";
import { verifiedPublicClaim } from "./parent-information";
import type { PublicClaim } from "./parent-information";

/**
 * I-owned public-identity approval envelope. Canonical details remain in
 * sites.address and sites.metadata.setupContact, not a second CMS/config.
 * I must add an authorized reviewer/writer; missing approval fails closed.
 */
const identityReviewSchema=z.object({
  version:z.literal(1),
  revision:z.number().int().positive(),
  reviewedByPersonId:z.string().uuid(),
  reviewedAt:z.string().datetime(),
  expiresOn:z.string().date().nullable(),
  addressDigest:z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  contactDigest:z.string().regex(/^[0-9a-f]{64}$/).nullable(),
}).strict();
const addressSchema=z.object({
  street1:z.string().trim().min(2).max(200),
  street2:z.string().trim().max(200).optional(),
  city:z.string().trim().min(2).max(120),
  state:z.string().trim().min(2).max(80),
  postalCode:z.string().trim().min(3).max(24),
  country:z.string().trim().min(2).max(80),
  county:z.string().trim().max(120).optional(),
}).passthrough();
const contactSchema=z.object({
  displayName:z.string().trim().min(2).max(160),
  email:z.union([z.string().trim().email().max(254),z.literal("")]),
  phone:z.string().trim().max(40),
  website:z.union([z.string().trim().url().max(500),z.literal("")]),
}).passthrough();
export function sourceDigest(siteId:string,category:"address"|"contact",value:unknown) {
  return createHash("sha256")
    .update(JSON.stringify([siteId,category,value])).digest("hex");
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
  const physical=addressSchema.safeParse(address);
  if(physical.success){
    const {street1,street2,city,state,postalCode,country,county}=physical.data;
    const source={street1,street2:street2??"",city,state,postalCode,country,county:county??""};
    if(reviewed.addressDigest===sourceDigest(siteId,"address",source)){
      const display=[street1,street2,city+", "+state+" "+postalCode,country]
        .filter(Boolean).join(", ");
      result.publicAddress=verifiedPublicClaim(display,"organization_site",reviewed.revision);
    }
  }
  const contact=contactSchema.safeParse(metadata?.setupContact);
  if(contact.success){
    const {displayName,email,phone,website}=contact.data;
    const source={displayName,email,phone,website};
    const channels=[email,phone,website].filter(Boolean);
    if(channels.length && reviewed.contactDigest===sourceDigest(siteId,"contact",source)){
      result.publicContact=verifiedPublicClaim(
        channels.join(" · "),"organization_site",reviewed.revision);
    }
  }
  return result;
}

