import { z } from "zod";

export const siteContactShareCommand = z.object({
  siteId: z.string().uuid(),
  decision: z.enum(["grant","revoke"]),
  sharePhone: z.boolean().default(false),
  purpose: z.enum(["program_inquiry","school_application","staff_onboarding"]),
}).strict();

export const contactConsentVersion = "can-site-contact-v1" as const;
export function activeSiteContactShare(input: {
  decision: "grant"|"revoke";
  shareEmail: boolean;
  shareName: boolean;
  sharePhone: boolean;
  consentVersion: string;
} | undefined | null): boolean {
  return !!input && input.decision === "grant" &&
    input.shareEmail && input.shareName &&
    input.consentVersion === contactConsentVersion;
}

export function siteContactShareCanBeGranted(input: {
  isPublished: boolean;
  independentlyAuthorizedSite: boolean;
  identityUnambiguous: boolean;
  emailVerified: boolean;
}): boolean {
  return input.identityUnambiguous && input.emailVerified &&
    (input.isPublished || input.independentlyAuthorizedSite);
}
