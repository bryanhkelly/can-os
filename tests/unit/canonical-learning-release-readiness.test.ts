import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalLearningRuntimeReady, facilitatedLearningRuntimeReady,
  requireCanonicalLearningActivityEnabled, requireFacilitatedLearningEnabled,
} from "@/modules/learning/canonical-learning-release.server";

afterEach(() => vi.unstubAllEnvs());

const setNativeAuth = () => {
  vi.stubEnv("CAN_CANONICAL_AUTH_DATABASE_URL",
    "postgresql://can_os_canonical_auth_app:placeholder@database.invalid/neondb");
  vi.stubEnv("CAN_CANONICAL_ACCESS_TOKEN_PEPPER", "a".repeat(48));
};

describe("canonical learning readiness without environment feature flags", () => {
  it("is usable when secure credentials exist, regardless of legacy flag values", () => {
    setNativeAuth();
    vi.stubEnv("CAN_CANONICAL_ACTIVITY_ENABLED", "false");
    vi.stubEnv("CAN_FACILITATED_LEARNING_ENABLED", "false");
    vi.stubEnv("CAN_FACILITATED_PAIRING_PEPPER", "b".repeat(48));
    expect(canonicalLearningRuntimeReady()).toBe(true);
    expect(facilitatedLearningRuntimeReady()).toBe(true);
    expect(() => requireCanonicalLearningActivityEnabled()).not.toThrow();
    expect(() => requireFacilitatedLearningEnabled()).not.toThrow();
  });

  it("fails closed if restricted reader or token pepper is missing", () => {
    vi.stubEnv("CAN_CANONICAL_AUTH_DATABASE_URL", "");
    vi.stubEnv("CAN_CANONICAL_ACCESS_TOKEN_PEPPER", "");
    expect(canonicalLearningRuntimeReady()).toBe(false);
    expect(() => requireCanonicalLearningActivityEnabled()).toThrow();
    vi.stubEnv("CAN_CANONICAL_AUTH_DATABASE_URL", "restricted-connection");
    expect(canonicalLearningRuntimeReady()).toBe(false);
    setNativeAuth();
    expect(canonicalLearningRuntimeReady()).toBe(true);
  });

  it("never uses an owner credential or shared DATABASE_URL as the reader", () => {
    vi.stubEnv("CAN_CANONICAL_ACCESS_TOKEN_PEPPER", "a".repeat(48));
    vi.stubEnv("CAN_CANONICAL_AUTH_DATABASE_URL",
      "postgresql://neondb_owner:placeholder@database.invalid/neondb");
    expect(canonicalLearningRuntimeReady()).toBe(false);
    const restricted = "postgresql://can_os_canonical_auth_app:placeholder@database.invalid/neondb";
    vi.stubEnv("CAN_CANONICAL_AUTH_DATABASE_URL", restricted);
    vi.stubEnv("DATABASE_URL", restricted);
    expect(canonicalLearningRuntimeReady()).toBe(false);
  });

  it("requires a separate strong signing pepper for pairing", () => {
    setNativeAuth();
    vi.stubEnv("CAN_FACILITATED_PAIRING_PEPPER", "weak");
    expect(canonicalLearningRuntimeReady()).toBe(true);
    expect(facilitatedLearningRuntimeReady()).toBe(false);
    expect(() => requireFacilitatedLearningEnabled()).toThrow();
    vi.stubEnv("CAN_FACILITATED_PAIRING_PEPPER", "b".repeat(48));
    expect(facilitatedLearningRuntimeReady()).toBe(true);
  });
});
