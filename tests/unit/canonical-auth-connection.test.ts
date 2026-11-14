import { describe, expect, it } from "vitest";
import { canonicalRestrictedAuthUrlValid } from "@/domain/canonical-auth-connection";

const valid = "postgresql://can_os_canonical_auth_app:secret@neon.example/neondb?sslmode=require";

describe("canonical native reader connection isolation", () => {
  it("accepts only the dedicated restricted application LOGIN", () => {
    expect(canonicalRestrictedAuthUrlValid(valid)).toBe(true);
    expect(canonicalRestrictedAuthUrlValid(valid,valid)).toBe(false);
    expect(canonicalRestrictedAuthUrlValid(valid,"postgresql://neondb_owner:secret@neon.example/neondb")).toBe(true);
  });
  it("rejects empty, owner, malformed and query-supplied role override URLs", () => {
    expect(canonicalRestrictedAuthUrlValid("")).toBe(false);
    expect(canonicalRestrictedAuthUrlValid("postgresql://neondb_owner:secret@neon.example/neondb")).toBe(false);
    expect(canonicalRestrictedAuthUrlValid("postgresql://can_os_canonical_auth_app@neon.example/neondb")).toBe(false);
    expect(canonicalRestrictedAuthUrlValid("https://can_os_canonical_auth_app:secret@neon.example")).toBe(false);
    expect(canonicalRestrictedAuthUrlValid(valid+"&user=neondb_owner")).toBe(false);
    expect(canonicalRestrictedAuthUrlValid(valid+"&options=-c%20role%3Dneondb_owner")).toBe(false);
    expect(canonicalRestrictedAuthUrlValid("invalid")).toBe(false);
  });
});
