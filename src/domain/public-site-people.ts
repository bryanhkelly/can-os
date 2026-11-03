import { z } from "zod";

/** Never derive public names or photos from private employment records. */
export const publicBioConsentSchema = z.object({
  version:z.literal(1),
  siteId:z.string().uuid(),
  displayName:z.string().trim().min(2).max(100),
  publicTitle:z.string().trim().min(2).max(100),
  biography:z.string().trim().min(30).max(1200),
  consentedAt:z.string().datetime(),
  expiresOn:z.string().date(),
}).strict();
export const publicBioConsentsSchema=z.array(publicBioConsentSchema).max(20);
export const publicStaffApprovalsSchema=z.object({
  version:z.literal(1),revision:z.number().int().positive(),
  approvedByPersonId:z.string().uuid(),approvedAt:z.string().datetime(),
  entries:z.array(z.object({
    personId:z.string().uuid(),signature:z.string().min(1).max(1500),
  }).strict()).max(20),
}).strict();

export type PublicBioConsent=z.infer<typeof publicBioConsentSchema>;
export type PublicSitePerson={displayName:string;publicTitle:string;biography:string};

export function publicBioSignature(value:Pick<PublicBioConsent,
  "displayName"|"publicTitle"|"biography"|"expiresOn">) {
  return JSON.stringify([value.displayName,value.publicTitle,value.biography,value.expiresOn]);
}

export function readPublicBioConsent(metadata:Record<string,unknown> | null,siteId:string,
  now=new Date()):PublicBioConsent|null {
  const parsed=publicBioConsentsSchema.safeParse(metadata?.publicBioConsents);
  if(!parsed.success)return null;
  const today=now.toISOString().slice(0,10);
  return parsed.data.find(item=>item.siteId===siteId &&
    item.consentedAt<=now.toISOString() && item.expiresOn>=today)??null;
}

export function readPublicStaffApprovals(metadata:Record<string,unknown>|null) {
  const parsed=publicStaffApprovalsSchema.safeParse(metadata?.publicStaffApprovals);
  return parsed.success?parsed.data:null;
}

/** A withdrawn/edited/expired consent invalidates even an old Site approval. */
export function projectConsentedPublicSitePerson(
  consent:PublicBioConsent|null,
  approval:{signature:string}|null,
):PublicSitePerson|null {
  if(!consent||!approval||approval.signature!==publicBioSignature(consent))return null;
  return {displayName:consent.displayName,publicTitle:consent.publicTitle,
    biography:consent.biography};
}
