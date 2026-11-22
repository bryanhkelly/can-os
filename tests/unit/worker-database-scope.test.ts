import { describe, expect, it } from "vitest";
import { assertUnscopedDatabaseAllowed, cloudflareIngressConfiguration } from "@/domain/worker-database-scope";

describe("Cloudflare request-scoped database boundary",()=>{
  it("blocks an unscoped Worker database lookup but retains the Node fallback",()=>{
    expect(()=>assertUnscopedDatabaseAllowed(true)).toThrow("withRequestDatabase");
    expect(()=>assertUnscopedDatabaseAllowed(false)).not.toThrow();
  });
  it("never sends a Worker with missing security bindings through the Node entry",()=>{
    expect(cloudflareIngressConfiguration(true,true,true)).toBe("cloudflare");
    expect(cloudflareIngressConfiguration(true,false,true)).toBe("misconfigured_worker");
    expect(cloudflareIngressConfiguration(true,true,false)).toBe("misconfigured_worker");
    expect(cloudflareIngressConfiguration(false,false,false)).toBe("node");
  });
});
