/** Git commit embedded by Vite at build time. Never infer this from runtime
 * env or assert a deployed SHA just because main was pushed. */
declare const __CAN_SOURCE_REVISION__: string | null;
declare const __CAN_BUILD_TIMESTAMP__: string | null;
declare const __CAN_BUILD_TARGET__: string | null;

export type PublicBuildTarget = "cloudflare-worker" | "netlify" | "local-development";
export type PublicBuildDetails = {
  sourceRevision: string | null;
  builtAt: string | null;
  buildTarget: PublicBuildTarget | null;
};

function validRevision(value: unknown): string | null {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value)
    ? value.toLowerCase() : null;
}

export function embeddedSourceRevision(): string | null {
  const raw = typeof __CAN_SOURCE_REVISION__ === "undefined" ? null : __CAN_SOURCE_REVISION__;
  return validRevision(raw);
}

/** Fail closed if provenance constants are missing or malformed.
 * This public model contains no deployment credentials or database metadata.
 */
export function publicBuildDetails(input: {
  sourceRevision: unknown;
  builtAt: unknown;
  buildTarget: unknown;
}): PublicBuildDetails {
  const builtAt = typeof input.builtAt === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.builtAt) &&
      !Number.isNaN(Date.parse(input.builtAt)) &&
      new Date(input.builtAt).toISOString() === input.builtAt
    ? input.builtAt : null;
  const target = input.buildTarget;
  return {
    sourceRevision: validRevision(input.sourceRevision),
    builtAt,
    buildTarget: target === "cloudflare-worker" || target === "netlify" ||
      target === "local-development" ? target : null,
  };
}

export function embeddedPublicBuildDetails(): PublicBuildDetails {
  return publicBuildDetails({
    sourceRevision: embeddedSourceRevision(),
    builtAt: typeof __CAN_BUILD_TIMESTAMP__ === "undefined" ? null : __CAN_BUILD_TIMESTAMP__,
    buildTarget: typeof __CAN_BUILD_TARGET__ === "undefined" ? null : __CAN_BUILD_TARGET__,
  });
}

export function formatPublicBuildTarget(target: PublicBuildTarget | null): string {
  if (target === "cloudflare-worker") return "Cloudflare build";
  if (target === "netlify") return "Netlify build";
  if (target === "local-development") return "Local development";
  return "Build target unavailable";
}

export function formatPublicBuildTimestamp(builtAt: string | null): string {
  // Stable UTC display that renders identically during SSR and hydration.
  return builtAt ? builtAt.replace("T", " ").replace(".000Z", "Z")
    .replace(/\.\d{3}Z$/, "Z").replace(/Z$/, " UTC") : "Build time unavailable";
}

/** Public release-fingerprint contract: accept only the expected app and SHA. */
export function parsePublicReleaseFingerprint(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  return record.application === "can-os" ? validRevision(record.sourceRevision) : null;
}

export function comparePublicBuildRevisions(client: string | null, server: string | null):
  "match" | "mismatch" | "unknown" {
  if (!client || !server) return "unknown";
  return client === server ? "match" : "mismatch";
}

export function publicBuildDiagnosticsText(input: PublicBuildDetails & {
  hostname: string | null;
  serverRevision: string | null;
  serverStatus: string;
}): string {
  return [
    "CAN OS deployment diagnostics",
    "Browser build: " + (input.sourceRevision ?? "unavailable"),
    "Server build: " + (input.serverRevision ?? "unavailable"),
    "Version check: " + input.serverStatus,
    "Built (UTC): " + (input.builtAt ?? "unavailable"),
    "Build target: " + formatPublicBuildTarget(input.buildTarget),
    "Host: " + (input.hostname ?? "unavailable"),
  ].join("\n");
}
