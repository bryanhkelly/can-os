import { z } from "zod";

/**
 * Classroom Connect join-code and session-lifecycle policy.
 * Pure functions only — no crypto imports — so route components can bundle
 * this module. Random code generation lives in the server module.
 */

// Crockford-style alphabet: excludes I, L, O, 0, 1 so codes stay
// unambiguous when displayed at projector scale.
export const CLASS_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CLASS_CODE_LENGTH = 6;

export const JOIN_CODE_TTL_MS = 30 * 60 * 1000;
// Join attempts against one token that fail eligibility before this threshold
// is crossed revoke the token, capping brute-force exposure of a 31^6 space.
export const MAX_TOKEN_FAILED_ATTEMPTS = 10;

const classCodePattern = new RegExp(`^[${CLASS_CODE_ALPHABET}]{${CLASS_CODE_LENGTH}}$`);

export const classCodeSchema = z.string().regex(classCodePattern);

/** Uppercase and strip separators; validation still rejects out-of-alphabet characters. */
export function normalizeClassCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidClassCode(value: string): boolean {
  return classCodePattern.test(value);
}

export type ClassroomSessionStatus = "scheduled" | "open" | "ended" | "cancelled";
export type JoinTokenStatus = "active" | "rotated" | "revoked";
export const JOIN_POLICIES = ["enrolled", "open"] as const;
export type JoinPolicy = (typeof JOIN_POLICIES)[number];

/** Allowed lifecycle transitions; anything else is rejected server-side. */
export const SESSION_STATUS_TRANSITIONS: Record<ClassroomSessionStatus, ClassroomSessionStatus[]> = {
  scheduled: ["open", "cancelled"],
  open: ["ended"],
  cancelled: [],
  ended: [],
};

export function canTransitionSessionStatus(from: ClassroomSessionStatus, to: ClassroomSessionStatus): boolean {
  return SESSION_STATUS_TRANSITIONS[from].includes(to);
}

export function joinCodeExpiry(now: Date): Date {
  return new Date(now.getTime() + JOIN_CODE_TTL_MS);
}

export type JoinTokenState = JoinTokenStatus | "expired";

export function joinTokenState(
  token: { status: JoinTokenStatus; expiresAt: Date },
  now: Date,
): JoinTokenState {
  if (token.status !== "active") return token.status;
  return token.expiresAt <= now ? "expired" : "active";
}

export type SessionJoinVerdict =
  | { ok: true }
  | { ok: false; reason: "session_not_open" | "token_expired" | "token_rotated" | "token_revoked" };

/**
 * The join decision combines session lifecycle and token state. Callers map a
 * non-ok verdict to one generic user message; the distinct reason exists for
 * audit and tests, not for user-facing enumeration.
 */
export function evaluateSessionJoin(
  sessionStatus: ClassroomSessionStatus,
  token: { status: JoinTokenStatus; expiresAt: Date },
  now: Date,
): SessionJoinVerdict {
  const state = joinTokenState(token, now);
  if (state !== "active") return { ok: false, reason: `token_${state}` };
  if (sessionStatus !== "open") return { ok: false, reason: "session_not_open" };
  return { ok: true };
}

export function shouldRevokeAfterFailedAttempt(failedAttempts: number): boolean {
  return failedAttempts + 1 >= MAX_TOKEN_FAILED_ATTEMPTS;
}

/** Canonical learner-facing join path for a code, used by QR payloads and typed entry. */
export function joinPathForCode(code: string): string {
  return `/join/${code}`;
}
