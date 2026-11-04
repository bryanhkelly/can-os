import { useEffect, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { accessReturnToFromLocation } from "@/domain/access-navigation";
import { LoaderErrorState, type LoaderErrorStateProps } from "./loader-error-state";
import { hasPendingAccessReturn } from "./access-return-recovery";

export interface LoaderFailureProps extends LoaderErrorStateProps {
  title: ReactNode;
  eyebrow?: ReactNode;
}

/** Page-level shell around the reusable loader error body. */
function LoaderFailure({ title, eyebrow, ...state }: LoaderFailureProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const needsSignIn = state.outcome.kind === "authentication" ||
    (state.outcome.kind === undefined && Boolean(state.outcome.authError));
  const returnTo = accessReturnToFromLocation(location);
  const fallback = state.fallback ?? (state.outcome.kind === "authorization" ? (
    <>{state.outcome.message}{" "}<Link to="/" className="font-semibold underline">Go home →</Link></>
  ) : undefined);
  // Stable dependencies prevent repeated redirects while the destination is loading.
  useEffect(() => {
    if (needsSignIn && returnTo && !hasPendingAccessReturn()) void navigate({ to: "/access", search: { returnTo }, replace: true });
  }, [navigate, needsSignIn, returnTo]);
  return (
    <WorkspaceShell eyebrow={eyebrow} title={title}>
      <LoaderErrorState {...state} fallback={fallback} />
    </WorkspaceShell>
  );
}
export { LoaderFailure };
