import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("canonical session security boundary", () => {
  it("uses one restricted reader for both native and CAN staff sessions", () => {
    const native = read("src/modules/identity/canonical-command-context.server.ts");
    const staff = read("src/modules/identity/can-site-staff-authority.server.ts");
    const reader = read("src/modules/identity/restricted-canonical-session-reader.server.ts");
    expect(native).toContain('readRestrictedCanonicalSession("native", digest)');
    expect(staff).toContain('readRestrictedCanonicalSession("can_staff", digest)');
    expect(native).not.toContain("new Pool(");
    expect(staff).not.toContain("new Pool(");
    expect(reader).toContain("BEGIN READ ONLY");
    expect(reader).toContain("SET LOCAL ROLE");
    expect(reader).toContain("getRequestScopedResource(");
  });

  it("requires revalidation instead of reusing stale canonical decisions", () => {
    const source = read("src/modules/identity/canonical-command-context.server.ts");
    expect(source).not.toContain("canonicalSessionReads = new WeakMap");
    expect(source).toContain("return readCanonicalSessionRow(request)");
  });

  it("uses a strict cookie parser for all sensitive transaction guards", () => {
    for (const path of [
      "src/modules/identity/canonical-sensitive-authorization.server.ts",
      "src/modules/identity/canonical-transaction-authorization.server.ts",
      "src/modules/identity/learning-command-context.server.ts",
      "src/modules/identity/can-site-staff-authority.server.ts",
    ]) {
      expect(read(path)).toContain("readCookie(request,");
    }
  });

  it("retains transaction-time learner authorization until the native bridge is replaced", () => {
    const mutation = read("src/modules/classes/native-class-learner-session.server.ts");
    expect(mutation).toContain("v301_canonical_session_context(");
    expect(mutation).toContain("canonicalSessionDigestFromRequest(request)");
  });
});
