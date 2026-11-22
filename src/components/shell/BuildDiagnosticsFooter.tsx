import { useEffect, useRef, useState } from "react";
import {
  comparePublicBuildRevisions,
  embeddedPublicBuildDetails,
  formatPublicBuildTarget,
  formatPublicBuildTimestamp,
  parsePublicReleaseFingerprint,
  publicBuildDiagnosticsText,
} from "@/domain/build-source-revision";

type ServerBuild =
  | { state: "not-checked" | "checking" | "unavailable" }
  | { state: "ready"; revision: string };

/**
 * Public-safe deployment evidence. The login page never displays database
 * endpoints, branches, account identifiers, query parameters or credentials.
 * The server fingerprint is fetched only when diagnostics are expanded.
 */
export function BuildDiagnosticsFooter() {
  const build = embeddedPublicBuildDetails();
  const buildId = build.sourceRevision;
  const [hostname, setHostname] = useState<string | null>(null);
  const [server, setServer] = useState<ServerBuild>({ state: "not-checked" });
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const requested = useRef(false);

  useEffect(() => {
    setHostname(window.location.host);
  }, []);

  async function checkServerRevision() {
    if (requested.current) return;
    requested.current = true;
    setServer({ state: "checking" });
    try {
      const response = await fetch("/release-fingerprint", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Release fingerprint unavailable");
      const result = parsePublicReleaseFingerprint(await response.json());
      setServer(result ? { state: "ready", revision: result } : { state: "unavailable" });
    } catch {
      setServer({ state: "unavailable" });
    }
  }

  const serverRevision = server.state === "ready" ? server.revision : null;
  const match = server.state === "ready"
    ? comparePublicBuildRevisions(buildId, serverRevision) : "unknown";
  const comparison = server.state === "ready"
    ? match === "match" ? "Client and server match"
      : match === "mismatch" ? "Client and server differ" : "Comparison unavailable"
    : server.state === "checking" ? "Checking server version…"
      : server.state === "unavailable" ? "Server fingerprint unavailable" : "Not checked";

  async function copyDiagnostics() {
    const text = publicBuildDiagnosticsText({
      ...build,
      hostname,
      serverRevision,
      serverStatus: comparison,
    });
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return <footer className="mx-auto mt-6 max-w-md border-t border-border pt-3 text-xs text-muted-foreground"
    aria-label="Build information">
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
      <span>Build: <span className="font-mono" title={buildId ?? "Build revision not embedded"}>
        {buildId?.slice(0,12)??"unavailable"}</span></span>
      <span aria-hidden="true">·</span>
      <span>{formatPublicBuildTarget(build.buildTarget)}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={build.builtAt ?? undefined}>{formatPublicBuildTimestamp(build.builtAt)}</time>
    </div>
    <details className="mt-2 border-t border-border/70 pt-2 text-left"
      onToggle={event => { if (event.currentTarget.open) void checkServerRevision(); }}>
      <summary className="mx-auto w-fit cursor-pointer rounded px-2 py-2 text-center font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        Deployment diagnostics
      </summary>
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-3 border bg-card p-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <dt className="font-semibold">Git revision</dt>
        <dd className="break-all font-mono">{buildId ?? "unavailable"}</dd>
        <dt className="font-semibold">Built (UTC)</dt>
        <dd>{formatPublicBuildTimestamp(build.builtAt)}</dd>
        <dt className="font-semibold">Build target</dt>
        <dd>{formatPublicBuildTarget(build.buildTarget)}</dd>
        <dt className="font-semibold">Current host</dt>
        <dd className="break-all">{hostname ?? "Checking…"}</dd>
        <dt className="font-semibold">Server revision</dt>
        <dd className="break-all font-mono">{serverRevision ?? (server.state === "checking" ? "Checking…" : "unavailable")}</dd>
        <dt className="font-semibold">Version check</dt>
        <dd aria-live="polite">{comparison}</dd>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void copyDiagnostics()}
          className="inline-flex min-h-10 items-center rounded border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Copy diagnostics
        </button>
        {copyState !== "idle" && <span role="status" aria-live="polite">
          {copyState === "copied" ? "Diagnostics copied" : "Unable to copy. Please select the details above."}
        </span>}
      </div>
      <p className="mt-3 leading-5">
        Build target and source revision do not identify the connected database.
        Database identifiers and credentials are not exposed on this public page.
      </p>
    </details>
  </footer>;
}
