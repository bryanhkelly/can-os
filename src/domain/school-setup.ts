import { z } from "zod";
import { DEMO_ACCOUNT_DOMAIN } from "./local-demo-access";
import { siteTimezoneSchema } from "./site-timezone";

const demoDomainPattern = /^[a-z0-9](?:[a-z0-9-]{1,41}[a-z0-9])\.demo$/;

export function isDemoSchoolDomain(domain: string): boolean {
  return demoDomainPattern.test(domain.trim().toLowerCase()) &&
    !domain.includes("--");
}

export const schoolSetupSchema = z.object({
  name: z.string().trim().min(2).max(160),
  domain: z.string().trim().toLowerCase().refine(isDemoSchoolDomain,
    "Use a school domain such as newschool.demo.").refine(
    domain => domain !== DEMO_ACCOUNT_DOMAIN, "Valor already has its own demo tenant."),
  timezone: siteTimezoneSchema,
  syntheticOnly: z.literal(true),
}).strict();

export const realSchoolSetupSignupSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().toLowerCase().email().max(254)
    .refine(email => !email.endsWith(".demo") && !email.endsWith(".invalid"),
      "Use a real email address; demo schools use the shared-code setup."),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
}).strict();

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
    email === `admin.demo@${school.domain}` &&
    grant.id === school.adminGrantId && grant.accountId === school.adminAccountId &&
    grant.personId === school.adminPersonId && grant.role === "site_admin" &&
    grant.organizationId === school.organizationId && grant.siteId === school.siteId;
}
