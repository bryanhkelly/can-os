import { z } from "zod";
import { DEMO_ACCOUNT_DOMAIN, isDemoAccountEmail } from "./local-demo-access";
import { siteTimezoneSchema } from "./site-timezone";

import { identityEmailDomain, isDemoDomain } from "./domain-classification";

export function isDemoSchoolDomain(domain: string): boolean {
  return isDemoDomain(domain);
}

export const schoolSetupSchema = z.object({
  name: z.string().trim().min(2).max(160),
  domain: z.string().trim().toLowerCase().refine(isDemoSchoolDomain,
    "Use a school domain such as newschool.demo.").refine(
    domain => domain !== DEMO_ACCOUNT_DOMAIN, "Valor already has its own demo tenant."),
  timezone: siteTimezoneSchema,
  syntheticOnly: z.literal(true),
}).strict();

/** Self-reported identity during Site signup; it is not network authorization. */
export const publicSignupOrganizationTypeOptions = [
  { value: "other_partner", label: "Community, training, nonprofit, or other education organization" },
  { value: "church", label: "Church or local faith community" },
  { value: "christian_school", label: "Christian school" },
  { value: "microschool_operator", label: "Microschool operator" },
  { value: "consortium", label: "Association or consortium" },
  { value: "denomination", label: "Denomination or national faith network" },
] as const;
export const publicSignupOrganizationTypeSchema = z.enum([
  "other_partner", "church", "christian_school", "microschool_operator",
  "consortium", "denomination",
]);
export type PublicSignupOrganizationType = z.infer<typeof publicSignupOrganizationTypeSchema>;

/** A self-asserted national identity must never create network authority. */
export function initialVerifiedSignupOrganizationType(requested: PublicSignupOrganizationType) {
  return requested === "denomination" || requested === "consortium"
    ? "other_partner" as const : requested;
}

export const siteSignupSchema = z.object({
  name: z.string().trim().min(2).max(160),
  organizationName: z.string().trim().min(2).max(160).optional(),
  organizationType: publicSignupOrganizationTypeSchema.default("other_partner"),
  email: z.string().trim().toLowerCase().email().max(254)
    .refine(email => !email.endsWith(".invalid") && (!email.endsWith(".demo") || (isDemoAccountEmail(email) && isDemoSchoolDomain(email.split("@")[1]!))), "Use a valid real or demo email address."),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
}).strict();

export const realSchoolSetupSignupSchema = siteSignupSchema.refine(data => !data.email.endsWith(".demo"), { path: ["email"], message: "Use a real email address." });

export type SchoolSetupInput = z.infer<typeof schoolSetupSchema>;
export type RealSchoolSetupSignupInput = z.infer<typeof realSchoolSetupSignupSchema>;
export type SchoolSetupResult = {
  organizationId: string;
  siteId: string;
  domain: string;
  adminEmail: string;
  created: boolean;
};

export type RegisteredDemoSchool = {
  domain: string;
  organizationId: string;
  siteId: string;
  adminAccountId: string;
  adminPersonId: string;
  adminGrantId: string;
  enabled: boolean;
};

export function matchesDemoSchoolAdministrator(
  school: RegisteredDemoSchool,
  grant: {
    id: string; accountId: string; personId: string; role: string;
    organizationId: string | null; siteId: string | null;
  },
  email: string,
): boolean {
  return school.enabled && isDemoSchoolDomain(school.domain) &&
    identityEmailDomain(email) === school.domain &&
    grant.id === school.adminGrantId && grant.accountId === school.adminAccountId &&
    grant.personId === school.adminPersonId && grant.role === "site_admin" &&
    grant.organizationId === school.organizationId && grant.siteId === school.siteId;
}
