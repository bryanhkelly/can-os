export const LOCAL_DEMO_ACCESS_CODE = "CANOS-LOCAL-TEST";

export const LOCAL_DEMO_ACCOUNTS = [
  { email: "jordan.student@can-os.invalid", role: "Student" },
  { email: "riley.teacher@can-os.invalid", role: "Teacher" },
  { email: "casey.specialist@can-os.invalid", role: "Specialist" },
  { email: "morgan.guardian@can-os.invalid", role: "Guardian" },
  { email: "alex.registrar@can-os.invalid", role: "Registrar" },
  { email: "admin.demo@can-os.invalid", role: "Demo admin" },
] as const;

export const LOCAL_DEMO_ADMIN = {
  personId: "f7100000-0000-4000-8000-000000000001",
  accountId: "f7100000-0000-4000-8000-000000000002",
  grantId: "f7100000-0000-4000-8000-000000000003",
  roleAssignmentId: "f7100000-0000-4000-8000-000000000005",
  facilitatorGrantId: "f7100000-0000-4000-8000-000000000006",
  organizationId: "f1000000-0000-4000-8000-000000000002",
  siteId: "f1000000-0000-4000-8000-000000000003",
  email: "admin.demo@can-os.invalid",
} as const;

export function isLocalDemoAccessEnabled(
  env: { NODE_ENV?: string; CAN_DEMO_FIXED_ACCESS_ENABLED?: string },
): boolean {
  return (
    (env.NODE_ENV === "development" || env.NODE_ENV === "test") &&
    env.CAN_DEMO_FIXED_ACCESS_ENABLED === "true"
  );
}
