export const LOCAL_DEMO_ACCESS_CODE = "000000";
export const DEMO_ACCOUNT_DOMAIN = "valorschool.demo";

export const LOCAL_DEMO_ACCOUNTS = [
  { email: "jordan.student@valorschool.demo", role: "Student", accountId: "fa000000-0000-4000-8000-000000000001", personId: "f1000000-0000-4000-8000-000000000005" },
  { email: "riley.teacher@valorschool.demo", role: "Teacher", accountId: "fa000000-0000-4000-8000-000000000002", personId: "f1000000-0000-4000-8000-000000000006" },
  { email: "casey.specialist@valorschool.demo", role: "Specialist", accountId: "fa000000-0000-4000-8000-000000000003", personId: "f4100000-0000-4000-8000-000000000003" },
  { email: "morgan.guardian@valorschool.demo", role: "Guardian", accountId: "fa000000-0000-4000-8000-000000000004", personId: "f3000000-0000-4000-8000-000000000007" },
  { email: "alex.registrar@valorschool.demo", role: "Registrar", accountId: "f7000000-0000-4000-8000-000000000002", personId: "f7000000-0000-4000-8000-000000000001" },
  { email: "admin.demo@valorschool.demo", role: "Demo admin", accountId: "f7100000-0000-4000-8000-000000000002", personId: "f7100000-0000-4000-8000-000000000001" },
] as const;

export const LOCAL_DEMO_ADMIN = {
  personId: "f7100000-0000-4000-8000-000000000001",
  accountId: "f7100000-0000-4000-8000-000000000002",
  grantId: "f7100000-0000-4000-8000-000000000003",
  roleAssignmentId: "f7100000-0000-4000-8000-000000000005",
  facilitatorGrantId: "f7100000-0000-4000-8000-000000000006",
  organizationId: "f1000000-0000-4000-8000-000000000002",
  siteId: "f1000000-0000-4000-8000-000000000003",
  email: "admin.demo@valorschool.demo",
} as const;

export function isDemoAccountEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${DEMO_ACCOUNT_DOMAIN}`);
}

export function isDemoSchoolGrant(grant: {
  organizationId: string | null;
  siteId: string | null;
}): boolean {
  return grant.organizationId === LOCAL_DEMO_ADMIN.organizationId &&
    grant.siteId === LOCAL_DEMO_ADMIN.siteId;
}

export function isDemoTenantOrganization(organizationId: string | null): boolean {
  return organizationId === LOCAL_DEMO_ADMIN.organizationId;
}

export function isApprovedDemoGrant(grant: {
  accountId: string; personId: string; role: string;
  organizationId: string | null; siteId: string | null;
}, email: string): boolean {
  const account = LOCAL_DEMO_ACCOUNTS.find(candidate => candidate.email === email.trim().toLowerCase());
  return Boolean(account && account.accountId === grant.accountId &&
    account.personId === grant.personId &&
    grant.role === (account.email === LOCAL_DEMO_ADMIN.email ? "registrar" : account.role.toLowerCase()) &&
    isDemoSchoolGrant(grant));
}

export function isLocalDemoProvisioningEnabled(
  env: { NODE_ENV?: string; CAN_DEMO_FIXED_ACCESS_ENABLED?: string },
): boolean {
  return (env.NODE_ENV === "development" || env.NODE_ENV === "test") &&
    env.CAN_DEMO_FIXED_ACCESS_ENABLED === "true";
}
