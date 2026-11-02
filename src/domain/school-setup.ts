import { z } from "zod";
import { DEMO_ACCOUNT_DOMAIN } from "./local-demo-access";

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
  timezone: z.string().trim().min(3).max(80).refine(value => {
    try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; }
    catch { return false; }
  }, "Choose a valid school timezone."),
  syntheticOnly: z.literal(true),
}).strict();

export type SchoolSetupInput = z.infer<typeof schoolSetupSchema>;
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
