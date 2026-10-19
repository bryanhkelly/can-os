export const LOCAL_DEMO_ACCESS_CODE = "CANOS-LOCAL-TEST";

export const LOCAL_DEMO_ACCOUNTS = [
  { email: "jordan.student@can-os.invalid", role: "Student" },
  { email: "riley.teacher@can-os.invalid", role: "Teacher" },
  { email: "casey.specialist@can-os.invalid", role: "Specialist" },
  { email: "morgan.guardian@can-os.invalid", role: "Guardian" },
] as const;

export function isLocalDemoAccessEnabled(
  env: { NODE_ENV?: string; CAN_DEMO_FIXED_ACCESS_ENABLED?: string },
): boolean {
  return (
    (env.NODE_ENV === "development" || env.NODE_ENV === "test") &&
    env.CAN_DEMO_FIXED_ACCESS_ENABLED === "true"
  );
}
