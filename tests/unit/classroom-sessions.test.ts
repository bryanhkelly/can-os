import { describe, expect, it } from "vitest";
import {
  canTransitionSessionStatus,
  CLASS_CODE_ALPHABET,
  CLASS_CODE_LENGTH,
  classCodeSchema,
  evaluateSessionJoin,
  isValidClassCode,
  joinCodeExpiry,
  joinPathForCode,
  JOIN_CODE_TTL_MS,
  joinTokenState,
  MAX_TOKEN_FAILED_ATTEMPTS,
  normalizeClassCode,
  shouldRevokeAfterFailedAttempt,
} from "@/domain/classroom-sessions";

describe("class code normalization and validation", () => {
  it("normalizes lowercase typed entry with separators", () => {
    expect(normalizeClassCode("ab3d-9f")).toBe("AB3D9F");
    expect(normalizeClassCode("  ab3d 9f ")).toBe("AB3D9F");
  });

  it("accepts only the unambiguous projector alphabet", () => {
    const valid = "ABC234";
    expect(isValidClassCode(valid)).toBe(true);
    expect(classCodeSchema.safeParse(valid).success).toBe(true);
    // I, L, O, 0, 1 are excluded to prevent visual confusion on a projector.
    for (const ambiguous of ["ILO", "O0", "1L", "I1"]) {
      expect(isValidClassCode(ambiguous)).toBe(false);
    }
    expect(isValidClassCode("ABC23")).toBe(false); // too short
    expect(isValidClassCode("ABC2345")).toBe(false); // too long
  });

  it("every alphabet character is usable and none are ambiguous", () => {
    for (const char of CLASS_CODE_ALPHABET) {
      expect("ILO01").not.toContain(char);
    }
    expect(CLASS_CODE_LENGTH).toBe(6);
    // 31^6 ≈ 888M codes; combined with 30-minute expiry, per-token attempt
    // revocation and rate limiting, guessing is not practical.
    expect(CLASS_CODE_ALPHABET.length).toBe(31);
    expect(Math.pow(CLASS_CODE_ALPHABET.length, CLASS_CODE_LENGTH)).toBeGreaterThan(5e8);
  });
});

describe("join code expiry and rotation policy", () => {
  const now = new Date("2026-11-14T18:00:00Z");

  it("expires codes after the TTL", () => {
    const expiresAt = joinCodeExpiry(now);
    expect(expiresAt.getTime() - now.getTime()).toBe(JOIN_CODE_TTL_MS);
    expect(joinTokenState({ status: "active", expiresAt }, now)).toBe("active");
    expect(joinTokenState({ status: "active", expiresAt }, new Date(expiresAt.getTime() + 1))).toBe("expired");
  });

  it("retired codes never reactivate", () => {
    const future = new Date(now.getTime() + JOIN_CODE_TTL_MS);
    expect(joinTokenState({ status: "rotated", expiresAt: future }, now)).toBe("rotated");
    expect(joinTokenState({ status: "revoked", expiresAt: future }, now)).toBe("revoked");
  });

  it("revokes a token after the failed-attempt threshold", () => {
    expect(shouldRevokeAfterFailedAttempt(MAX_TOKEN_FAILED_ATTEMPTS - 2)).toBe(false);
    expect(shouldRevokeAfterFailedAttempt(MAX_TOKEN_FAILED_ATTEMPTS - 1)).toBe(true);
  });
});

describe("session join verdicts", () => {
  const future = new Date("2026-11-14T19:00:00Z");
  const active = { status: "active" as const, expiresAt: future };

  it("joins only an open session with an active token", () => {
    expect(evaluateSessionJoin("open", active, new Date())).toEqual({ ok: true });
  });

  it.each([
    ["scheduled", "session_not_open"],
    ["ended", "session_not_open"],
    ["cancelled", "session_not_open"],
  ] as const)("rejects %s sessions without counting token failures", (status, reason) => {
    expect(evaluateSessionJoin(status, active, new Date())).toEqual({ ok: false, reason });
  });

  it("rejects expired, rotated and revoked tokens distinctly for audit", () => {
    const now = new Date("2026-11-14T18:00:00Z");
    expect(evaluateSessionJoin("open", { status: "active", expiresAt: now }, now))
      .toEqual({ ok: false, reason: "token_expired" });
    expect(evaluateSessionJoin("open", { status: "rotated", expiresAt: future }, now))
      .toEqual({ ok: false, reason: "token_rotated" });
    expect(evaluateSessionJoin("open", { status: "revoked", expiresAt: future }, now))
      .toEqual({ ok: false, reason: "token_revoked" });
  });
});

describe("session lifecycle transitions", () => {
  it("allows only the defined state machine", () => {
    expect(canTransitionSessionStatus("scheduled", "open")).toBe(true);
    expect(canTransitionSessionStatus("scheduled", "cancelled")).toBe(true);
    expect(canTransitionSessionStatus("scheduled", "ended")).toBe(false);
    expect(canTransitionSessionStatus("open", "ended")).toBe(true);
    expect(canTransitionSessionStatus("open", "cancelled")).toBe(false);
    expect(canTransitionSessionStatus("ended", "open")).toBe(false);
    expect(canTransitionSessionStatus("cancelled", "open")).toBe(false);
  });
});

describe("join path", () => {
  it("builds the canonical learner join URL path", () => {
    expect(joinPathForCode("ABC234")).toBe("/join/ABC234");
  });
});
