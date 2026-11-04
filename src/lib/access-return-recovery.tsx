import { useEffect, type ReactNode } from "react";
import { ErrorComponent, Navigate, useLocation, useMatches, type ErrorComponentProps } from "@tanstack/react-router";
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
  return pending ? <Navigate to="/" state={{ accessReturnFailed: true }} replace /> : <p>Page not found.</p>;
}

declare module "@tanstack/react-router" {
  interface HistoryState {
    accessReturnFailed?: boolean;
  }
}
