import { useEffect, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { getWorkspaceHome } from "@/components/shell/workspace-navigation.registry";
import { useWorkspaceSession } from "@/components/shell/WorkspaceSession";
import { accessReturnToFromLocation } from "@/domain/access-navigation";
import { LoaderErrorState, type LoaderErrorStateProps } from "./loader-error-state";

export interface LoaderFailureProps extends LoaderErrorStateProps {
  title: ReactNode;
  eyebrow?: ReactNode;
}

/** Page-level shell around the reusable loader error body. */
function LoaderFailure({ title, eyebrow, ...state }: LoaderFailureProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useWorkspaceSession();
  const needsSignIn = state.outcome.kind === "authentication" ||
    (state.outcome.kind === undefined && Boolean(state.outcome.authError));
  const returnTo = accessReturnToFromLocation(location);
  const workspaceHome = session?.authenticated ? getWorkspaceHome(session.role) : undefined;
  const fallback = state.fallback ?? (state.outcome.kind === "authorization" && workspaceHome ? (
    <>
      {state.outcome.message}{" "}
      <Link to={workspaceHome} className="font-semibold underline">Go to my workspace →</Link>
    </>
  ) : undefined);
  // Stable dependencies prevent repeated redirects while the destination is loading.
  useEffect(() => {
    if (needsSignIn && returnTo) void navigate({ to: "/access", search: { returnTo }, replace: true });
  }, [navigate, needsSignIn, returnTo]);
  return (
    <WorkspaceShell eyebrow={eyebrow} title={title}>
      <LoaderErrorState {...state} fallback={fallback} />
    </WorkspaceShell>
  );
}
export { LoaderFailure };
