import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  comparePublicBuildRevisions,
  formatPublicBuildTarget,
  formatPublicBuildTimestamp,
  parsePublicReleaseFingerprint,
  publicBuildDetails,
  publicBuildDiagnosticsText,
} from "@/domain/build-source-revision";
import { BuildDiagnosticsFooter } from "@/components/shell/BuildDiagnosticsFooter";

const sha = "a".repeat(40);
const otherSha = "b".repeat(40);

describe("public-safe deployment diagnostics", () => {
  it("preserves valid build facts without substituting a claimed deployed revision", () => {
    const build = publicBuildDetails({
      sourceRevision: sha.toUpperCase(),
      builtAt: "2026-11-22T18:30:12.000Z",
      buildTarget: "cloudflare-worker",
    });
    expect(build).toEqual({
      sourceRevision: sha,
      builtAt: "2026-11-22T18:30:12.000Z",
      buildTarget: "cloudflare-worker",
    });
    expect(formatPublicBuildTarget(build.buildTarget)).toBe("Cloudflare build");
    expect(formatPublicBuildTimestamp(build.builtAt)).toBe("2026-11-22 18:30:12 UTC");
  });

  it("rejects malformed build metadata and does not fabricate values", () => {
    const build = publicBuildDetails({
      sourceRevision: "dev",
      builtAt: "not-a-timestamp",
      buildTarget: "prod-database-main",
    });
    expect(build).toEqual({ sourceRevision: null, builtAt: null, buildTarget: null });
    expect(formatPublicBuildTarget(build.buildTarget)).toBe("Build target unavailable");
    expect(formatPublicBuildTimestamp(build.builtAt)).toBe("Build time unavailable");
  });

  it("compares the server's own revision with the browser bundle revision", () => {
    expect(parsePublicReleaseFingerprint({
      application: "can-os", sourceRevision: otherSha,
    })).toBe(otherSha);
    expect(parsePublicReleaseFingerprint({
      application: "other-app", sourceRevision: otherSha,
    })).toBeNull();
    expect(parsePublicReleaseFingerprint({ application: "can-os", sourceRevision: "abc" }))
      .toBeNull();
    expect(comparePublicBuildRevisions(sha, sha)).toBe("match");
    expect(comparePublicBuildRevisions(sha, otherSha)).toBe("mismatch");
    expect(comparePublicBuildRevisions(null, sha)).toBe("unknown");
  });

  it("copies only public release provenance and the hostname, never URL parameters", () => {
    const info = publicBuildDiagnosticsText({
      sourceRevision: sha,
      builtAt: "2026-11-22T18:30:12.000Z",
      buildTarget: "cloudflare-worker",
      hostname: "can-os.example.test",
      serverRevision: otherSha,
      serverStatus: "Client and server differ",
    });
    expect(info).toContain("Browser build: " + sha);
    expect(info).toContain("Server build: " + otherSha);
    expect(info).toContain("can-os.example.test");
    expect(info).not.toContain("DATABASE_URL");
    expect(info).not.toContain("password");
    expect(info).not.toContain("returnTo=");
  });

  it("renders a compact footer with accessible, opt-in details", () => {
    const html = renderToStaticMarkup(<BuildDiagnosticsFooter />);
    expect(html).toContain('aria-label="Build information"');
    expect(html).toContain("Build:");
    expect(html).toContain("<details");
    expect(html).toContain("Deployment diagnostics");
    expect(html).toContain("Server revision");
    expect(html).toContain("Copy diagnostics");
    expect(html).toContain("do not identify the connected database");
  });
});
