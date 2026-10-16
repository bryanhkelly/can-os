/**
 * Synthetic demo writes are disabled unless an operator explicitly sets
 * CAN_DEMO_WRITES_ENABLED=true (fail closed). See docs/identity-and-demo-access.md,
 * "Demo kill switch". A UI role is still not arbitrary authorization: callers must
 * hold one of the declared demo roles, and each workflow checks its own synthetic
 * relationship and scope.
 */
export type DemoRole = "student" | "teacher" | "guardian" | "registrar" | "specialist";
export function isSyntheticAccessEnabled(): boolean {
 return process.env.CAN_DEMO_WRITES_ENABLED === "true";
}
export function assertSyntheticMutation(role: DemoRole): void {
 if (!isSyntheticAccessEnabled()) {
  throw new Error("Synthetic writes are disabled. Set CAN_DEMO_WRITES_ENABLED=true to enable the synthetic demo workflows.");
 }
 if (!["student","teacher","guardian","registrar","specialist"].includes(role)) throw new Error("Unknown synthetic role");
}
export const demoAllowedRoles = Object.freeze(["student","teacher","guardian","registrar","specialist"] as const);
