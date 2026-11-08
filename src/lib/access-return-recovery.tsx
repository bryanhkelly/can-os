import { useEffect, type ReactNode } from "react";
import { ErrorComponent, Link, Navigate, useLocation, useMatches, type ErrorComponentProps } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { useActiveWorkspaceMember } from "@/components/shell/workspace-session-context";
import { getWorkspaceHome } from "@/components/shell/workspace-navigation.registry";
import { SITE_NAME } from "./site-config";
import { accessReturnCookie } from "@/domain/access-navigation";
import { hasFailedRead } from "./router-refresh";
import { normalizeClientError } from "./client-error";
import { useHydrated } from "./use-hydrated";

export function hasPendingAccessReturn() {
  return typeof document !== "undefined" &&
    document.cookie.split(";").some(cookie => cookie.trim() === `${accessReturnCookie}=1`);
}

function clearReturn() {
  document.cookie = `${accessReturnCookie}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Only a verified auth/permission failure should end the saved-page return.
 * Network/database failures stay on the requested page and offer a retry. */
function deniedLoaderResult(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  if ("ok" in value && value.ok === false) {
    return "kind" in value && (value.kind === "authentication" || value.kind === "authorization");
  }
  return false;
}

export function AccessReturnRecovery({ children }: { children: ReactNode }) {
  const denied = useMatches({ select: matches => matches.some(match =>
    match.status === "notFound" ||
      (hasFailedRead(match.loaderData) && deniedLoaderResult(match.loaderData))) });
  const loading = useMatches({ select: matches => matches.some(match => match.status === "pending") });
  const inAccess = useLocation({ select: location =>
    location.pathname === "/access" || location.pathname.startsWith("/access/") });
  const hydrated = useHydrated();
  const pending = hydrated && hasPendingAccessReturn();
  useEffect(() => {
    if (pending && !inAccess && !loading) clearReturn();
  }, [pending, inAccess, loading]);
  if (pending && !inAccess && denied) return <Navigate to="/" state={{ accessReturnFailed: true }} replace />;
  return children;
}

export function AccessReturnError(props: ErrorComponentProps) {
  const hydrated = useHydrated();
  const pending = hydrated && hasPendingAccessReturn();
  const classification = normalizeClientError(props.error);
  const denied = classification.kind === "authentication" || classification.kind === "authorization";
  useEffect(() => { if (pending) clearReturn(); }, [pending]);
  if (!pending) return <ErrorComponent {...props} />;
  if (denied) return <Navigate to="/" state={{ accessReturnFailed: true }} replace />;
  return <WorkspaceShell eyebrow={SITE_NAME} title="This page couldn't load"
    subtitle="CAN OS could not complete the request. Your account may still be signed in.">
    <nav aria-label="Retry page" className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
      <button type="button" className="underline" onClick={() => window.location.reload()}>
        Retry this page
      </button>
      <Link to="/home" className="underline">Go to my workspace</Link>
    </nav>
  </WorkspaceShell>;
}

export function AccessReturnNotFound() {
  const hydrated = useHydrated();
  const pending = hydrated && hasPendingAccessReturn();
  useEffect(() => { if (pending) clearReturn(); }, [pending]);
  return pending ? <Navigate to="/" state={{ accessReturnFailed: true }} replace /> : <NotFoundPage />;
}

export function NotFoundPage() {
  const member = useActiveWorkspaceMember();
  const home = member ? getWorkspaceHome(member.role) ?? "/home" : "/";
  return <WorkspaceShell eyebrow={SITE_NAME + " · 404"} title="Page not found"
    subtitle="This address does not match a page. The link may be outdated or the address may be incomplete.">
    <nav aria-label="Page recovery" className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
      <Link to={home} className="underline">{member ? "Return Home" : "Go to CAN OS"}</Link>
      {!member && <Link to="/access" className="underline">Sign in</Link>}
      <button type="button" className="underline" onClick={() => window.history.back()}>Go back</button>
    </nav>
  </WorkspaceShell>;
}

declare module "@tanstack/react-router" {
  interface HistoryState {
    accessReturnFailed?: boolean;
  }
}
