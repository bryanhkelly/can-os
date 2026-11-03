import type { ReactNode } from "react";
import { Navigate, useLocation } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { LoaderErrorState, type LoaderErrorStateProps } from "./loader-error-state";

export interface LoaderFailureProps extends LoaderErrorStateProps {
  title: ReactNode;
  eyebrow?: ReactNode;
}

/** Page-level shell around the reusable loader error body. */
function LoaderFailure({ title, eyebrow, ...state }: LoaderFailureProps) {
  const location = useLocation();
  const needsSignIn = state.outcome.kind === "authentication" ||
    (state.outcome.kind === undefined && Boolean(state.outcome.authError));
  if (needsSignIn) {
    const returnTo = `${location.pathname}${location.searchStr}${location.hash}`;
    return <Navigate to="/access" search={{ returnTo }} replace />;
  }
  return (
    <WorkspaceShell eyebrow={eyebrow} title={title}>
      <LoaderErrorState {...state} />
    </WorkspaceShell>
  );
}
export { LoaderFailure };
