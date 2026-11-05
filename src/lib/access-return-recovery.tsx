import { useEffect, type ReactNode } from "react";
import { ErrorComponent, Link, Navigate, useLocation, useMatches, type ErrorComponentProps } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { useActiveWorkspaceMember } from "@/components/shell/workspace-session-context";
import { getWorkspaceHome } from "@/components/shell/workspace-navigation.registry";
import { SITE_NAME } from "./site-config";
import { accessReturnCookie } from "@/domain/access-navigation";
import { hasFailedRead } from "./router-refresh";
import { useHydrated } from "./use-hydrated";

export function hasPendingAccessReturn() {
  return typeof document !== "undefined" &&
    document.cookie.split(";").some(cookie => cookie.trim() === `${accessReturnCookie}=1`);
}

function clearReturn() {
  document.cookie = `${accessReturnCookie}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function AccessReturnRecovery({ children }: { children: ReactNode }) {
  const failed = useMatches({ select: matches => matches.some(match =>
    match.status === "error" || match.status === "notFound" || hasFailedRead(match.loaderData)) });
  const loading = useMatches({ select: matches => matches.some(match => match.status === "pending") });
  const inAccess = useLocation({ select: location =>
    location.pathname === "/access" || location.pathname.startsWith("/access/") });
  const hydrated = useHydrated();
  const pending = hydrated && hasPendingAccessReturn();
  useEffect(() => {
    if (pending && !inAccess && !loading) clearReturn();
  }, [pending, inAccess, loading]);
  if (pending && !inAccess && failed) return <Navigate to="/" state={{ accessReturnFailed: true }} replace />;
  return children;
}

export function AccessReturnError(props: ErrorComponentProps) {
  const hydrated = useHydrated();
  const pending = hydrated && hasPendingAccessReturn();
  useEffect(() => { if (pending) clearReturn(); }, [pending]);
  return pending ? <Navigate to="/" state={{ accessReturnFailed: true }} replace /> : <ErrorComponent {...props} />;
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
