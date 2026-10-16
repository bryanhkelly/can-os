/**
 * First development release uses declared synthetic demo roles, not an identity provider.
 * Product workflows stay available on every deployment, including production, unless an
 * operator explicitly sets CAN_DEMO_WRITES_ENABLED=false. A UI role is still not arbitrary
 * authorization: callers must use one of the declared demo roles, and each workflow checks
 * its own synthetic relationship and scope.
 */
export type DemoRole = "student" | "teacher" | "guardian" | "registrar" | "specialist";
export function isSyntheticAccessEnabled(): boolean {
 return process.env.CAN_DEMO_WRITES_ENABLED !== "false";
}
export function assertSyntheticMutation(role: DemoRole): void {
 if (!isSyntheticAccessEnabled()) {
  throw new Error("Synthetic writes are disabled. Set CAN_DEMO_WRITES_ENABLED to a value other than false to enable this first-development deployment.");
 }
 if (!["student","teacher","guardian","registrar","specialist"].includes(role)) throw new Error("Unknown synthetic role");
}
export const demoAllowedRoles = Object.freeze(["student","teacher","guardian","registrar","specialist"] as const);
