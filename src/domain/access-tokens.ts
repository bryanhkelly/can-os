import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Provider-independent token helpers. Raw secrets must never be stored or logged. */
export function issueOpaqueSecret(): string {
 return randomBytes(32).toString("base64url");
}
export function hashAccessSecret(secret: string, pepper: string): string {
 if (!pepper || pepper.length < 32) throw new Error("CAN_ACCESS_TOKEN_PEPPER must contain at least 32 characters");
 return createHash("sha256").update(pepper).update(":").update(secret).digest("hex");
}
export function equalSecretHashes(a: string, b: string): boolean {
 if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
 return timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}
export function normalizeAccessEmail(value: string): string {
 const email=value.trim().toLowerCase();
 if (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email address");
 return email;
}
export function accessChallengeIsUsable(input: {expiresAt:Date;consumedAt:Date|null;attempts:number}, now=new Date()): boolean {
 return !input.consumedAt && input.expiresAt.getTime()>now.getTime() && input.attempts<5;
}
export function accessSessionIsUsable(input: {
 expiresAt:Date;revokedAt:Date|null;updatedAt:Date;
}, now=new Date()): boolean {
 return !input.revokedAt && input.expiresAt.getTime()>now.getTime() &&
  accessSessionIsWithinIdleWindow(input.updatedAt,now);
}
/** Server authority for idle expiry. Authenticated GETs and workspace polling
 * never move the idle deadline; only deliberate interactive activity may. */
export const ACCESS_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export function sessionIdleCutoff(now = new Date()): Date {
 return new Date(now.getTime() - ACCESS_SESSION_IDLE_TIMEOUT_MS);
}
export function accessSessionIsWithinIdleWindow(lastActivityAt: Date, now = new Date()): boolean {
 return lastActivityAt.getTime() > sessionIdleCutoff(now).getTime() && lastActivityAt.getTime() <= now.getTime();
}
export const accessSessionCookie = "__Host-can_os_session";
export function sessionCookieHeader(secret: string, maxAgeSeconds=60*60*12): string {
 if(!/^[A-Za-z0-9_-]{40,}$/.test(secret)) throw new Error("Invalid session token");
 return `${accessSessionCookie}=${secret}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}
export function clearSessionCookieHeader(): string {
 return `${accessSessionCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
