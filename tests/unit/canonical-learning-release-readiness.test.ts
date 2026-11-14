import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requireCanonicalLearningActivityEnabled,
  requireFacilitatedLearningEnabled,
} from "@/modules/learning/canonical-learning-release.server";

afterEach(() => vi.unstubAllEnvs());

const setNativeAuth = () => {
  vi.stubEnv("CAN_CANONICAL_AUTH_DATABASE_URL",
    "postgresql://can_os_canonical_auth_app:placeholder@database.invalid/neondb");
  vi.stubEnv("CAN_CANONICAL_ACCESS_TOKEN_PEPPER", "a".repeat(48));
};

describe("canonical activity release prerequisites", () => {
  it("denies an unenabled release even when credentials exist", () => {
    setNativeAuth();
    vi.stubEnv("CAN_CANONICAL_ACTIVITY_ENABLED", "false");
    expect(() => requireCanonicalLearningActivityEnabled()).toThrow();
    vi.stubEnv("CAN_FACILITATED_LEARNING_ENABLED", "false");
    vi.stubEnv("CAN_FACILITATED_PAIRING_PEPPER", "b".repeat(48));
    expect(() => requireFacilitatedLearningEnabled()).toThrow();
  });
  it("requires the separate restricted DB reader and native session pepper", () => {
    vi.stubEnv("CAN_CANONICAL_ACTIVITY_ENABLED", "true");
    vi.stubEnv("CAN_CANONICAL_AUTH_DATABASE_URL", "");
    vi.stubEnv("CAN_CANONICAL_ACCESS_TOKEN_PEPPER", "");
    expect(() => requireCanonicalLearningActivityEnabled()).toThrow();
    vi.stubEnv("CAN_CANONICAL_AUTH_DATABASE_URL", "restricted-connection");
    expect(() => requireCanonicalLearningActivityEnabled()).toThrow();
    setNativeAuth();
    expect(() => requireCanonicalLearningActivityEnabled()).not.toThrow();
  });
  it("rejects an owner or general DATABASE_URL masquerading as auth", () => {
    vi.stubEnv("CAN_CANONICAL_ACTIVITY_ENABLED", "true");
    vi.stubEnv("CAN_CANONICAL_ACCESS_TOKEN_PEPPER", "a".repeat(48));
    vi.stubEnv("CAN_CANONICAL_AUTH_DATABASE_URL",
      "postgresql://neondb_owner:placeholder@database.invalid/neondb");
    expect(() => requireCanonicalLearningActivityEnabled()).toThrow();
    const restricted = "postgresql://can_os_canonical_auth_app:placeholder@database.invalid/neondb";
    vi.stubEnv("CAN_CANONICAL_AUTH_DATABASE_URL", restricted);
    vi.stubEnv("DATABASE_URL", restricted);
    expect(() => requireCanonicalLearningActivityEnabled()).toThrow();
  });
  it("requires a separate strong pairing pepper for shared-screen sessions", () => {
    vi.stubEnv("CAN_FACILITATED_LEARNING_ENABLED", "true");
    setNativeAuth();
    vi.stubEnv("CAN_FACILITATED_PAIRING_PEPPER", "weak");
    expect(() => requireFacilitatedLearningEnabled()).toThrow();
    vi.stubEnv("CAN_FACILITATED_PAIRING_PEPPER", "b".repeat(48));
    expect(() => requireFacilitatedLearningEnabled()).not.toThrow();
  });
});
