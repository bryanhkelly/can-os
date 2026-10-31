import { afterEach, describe, expect, it, vi } from "vitest";
import siteHostGate from "../../netlify/edge-functions/site-host-gate";

const env = (enabled: boolean) => vi.stubGlobal("Netlify", {
  env: { get: (key: string) => key === "CAN_PUBLIC_SITE_HOSTING_ENABLED" ? (enabled ? "true" : "false") : undefined },
});
afterEach(() => vi.unstubAllGlobals());

describe("Netlify tenant edge entrypoint", () => {
  it("preserves the platform host while routing an approved tenant to standalone HTML", () => {
    env(true);
    expect(siteHostGate(new Request("https://app.can-os.com/operations"))).toBeUndefined();
    const out = siteHostGate(new Request("https://first-school.can-os.com/"));
    expect(out).toBeInstanceOf(URL);
    expect(String(out)).toBe("https://first-school.can-os.com/published-site");
  });
  it("keeps inquiry and family-start verification POST on the same tenant origin", () => {
    env(true);
    const a = siteHostGate(new Request("https://first-school.can-os.com/inquiry", {method:"POST"}));
    const b = siteHostGate(new Request("https://second-school.can-os.com/apply", {method:"POST"}));
    expect(String(a)).toBe("https://first-school.can-os.com/published-site/inquiry");
    expect(String(b)).toBe("https://second-school.can-os.com/published-site/family-start");
  });
  it("denies platform RPC, private pages, and cross-tenant Host claims", () => {
    env(true);
    for (const path of ["/admin","/operations","/_serverFn","/access","/assets/app.js"]) {
      const out = siteHostGate(new Request("https://first-school.can-os.com"+path));
      expect(out).toBeInstanceOf(Response);
      expect((out as Response).status).toBe(404);
    }
    const forged = siteHostGate(new Request("https://first-school.can-os.com/", {
      headers: {host:"second-school.can-os.com","x-forwarded-host":"second-school.can-os.com"},
    }));
    expect(forged).toBeInstanceOf(Response);
    expect((forged as Response).status).toBe(404);
  });
  it("blocks all tenant requests before reaching origin when hosting is off", () => {
    env(false);
    const out = siteHostGate(new Request("https://first-school.can-os.com/"));
    expect(out).toBeInstanceOf(Response);
    expect((out as Response).status).toBe(404);
  });
  it("rejects unknown internal paths and lets the origin independently verify rewritten paths", () => {
    env(true);
    expect(siteHostGate(new Request("https://first-school.can-os.com/published-site"))).toBeUndefined();
    const out = siteHostGate(new Request("https://first-school.can-os.com/published-site/other"));
    expect(out).toBeInstanceOf(Response);
    expect((out as Response).status).toBe(404);
  });
});
