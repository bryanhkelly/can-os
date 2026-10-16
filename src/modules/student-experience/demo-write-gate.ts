/**
 * The current application has synthetic identities, not authenticated sessions.
 * Fail closed for all mutations in deployed environments; never treat a UI role as authorization.
 * This feature gate may only be enabled on a private development instance.
 */
export type DemoRole = "student" | "teacher" | "guardian" | "registrar" | "specialist";
export function isSyntheticAccessEnabled(): boolean {
 return process.env.NODE_ENV !== "production" && process.env.CAN_DEMO_WRITES_ENABLED === "true";
}
export function assertSyntheticMutation(role: DemoRole): void {
 if (!isSyntheticAccessEnabled()) {
  throw new Error("Synthetic writes are disabled. Connect authenticated roles before enabling mutations.");
 }
 if (!["student","teacher","guardian","registrar","specialist"].includes(role)) throw new Error("Unknown synthetic role");
}
export const demoAllowedRoles = Object.freeze(["student","teacher","guardian","registrar","specialist"] as const);
