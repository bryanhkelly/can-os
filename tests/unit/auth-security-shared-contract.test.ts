import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { securityHeaders } from "@/domain/security-headers";
import { readCookie, secureSessionCookieHeader } from "@/domain/session-cookies";

describe("shared authentication and deployment security contracts", () => {
  it("matches cookie names exactly and never treats prefixes as sessions", () => {
    const request = new Request("https://example.org", {
      headers: { cookie: "session_extra=incorrect; session=correct; other=1" },
    });
    expect(readCookie(request, "session")).toBe("correct");
    expect(readCookie(request, "sess")).toBeUndefined();
    expect(readCookie(request, "missing")).toBeUndefined();
  });

  it("issues host-only secure cookies from one reviewed policy", () => {
    const header = secureSessionCookieHeader("__Host-can_os_v3_session", "a".repeat(43), 3600);
    expect(header).toContain("Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600");
    expect(() => secureSessionCookieHeader("insecure", "a".repeat(43), 60)).toThrow();
  });

  it("keeps Netlify security headers identical to the Cloudflare policy", () => {
    const netlify = readFileSync(resolve(process.cwd(), "netlify.toml"), "utf8");
    for (const [name, value] of Object.entries(securityHeaders)) {
      expect(netlify).toContain(`${name} = "${value}"`);
    }
    const worker = readFileSync(resolve(process.cwd(), "src/cloudflare-demo.ts"), "utf8");
    expect(worker).toContain('import { securityHeaders } from "./domain/security-headers"');
  });

  it("does not infer adult identity from filtered session grants", () => {
    const adult = readFileSync(resolve(process.cwd(),
      "src/modules/identity/unambiguous-adult-account.server.ts"), "utf8");
    const enrollment = readFileSync(resolve(process.cwd(),
      "src/modules/enrollment/noncredit-self-enrollment-identity.server.ts"), "utf8");
    expect(adult).toContain("accountPersonGrants.active");
    expect(adult).toContain('grant.role === "student"');
    expect(enrollment).toContain("assertUnambiguousAdultAccount(actor.accountId, actor.actorPersonId)");
  });
});
