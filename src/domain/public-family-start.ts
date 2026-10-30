import { z } from "zod";
import { normalizeAccessEmail } from "./access-tokens";

const personName=z.string().trim().min(1).max(80)
 .refine(value=>!/[<>\r\n]/.test(value),"Use a plain text name");
export const publicFamilyStartInput=z.object({
 requestId:z.string().uuid(),
 programId:z.string().uuid(),
 firstName:personName,
 lastName:personName,
 email:z.string().trim().toLowerCase().email().max(254),
 contactConsent:z.literal("yes"),
 website:z.string().max(150).default(""),
}).strict();

export type PublicFamilyStartInput=z.infer<typeof publicFamilyStartInput>;

export function parsePublicFamilyStart(params:URLSearchParams):PublicFamilyStartInput {
 return publicFamilyStartInput.parse(Object.fromEntries(params.entries()));
}

/** The public request is never legal proof of guardianship. */
export function verifiedFamilyStartEmail(input:PublicFamilyStartInput):string {
 return normalizeAccessEmail(input.email);
}
