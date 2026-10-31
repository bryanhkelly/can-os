import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { WorkspaceShell, QueryState } from "@/components/workspace";
import type { LoaderFailureKind } from "./safe-loader";

export interface LoaderFailureProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  outcome: { authError: string | null; message: string; kind?: LoaderFailureKind; retryable?: boolean };
}

/** Preserve legacy outcomes while distinguishing sign-in from permission denial. */
function LoaderFailure({ title, eyebrow, outcome }: LoaderFailureProps) {
  const needsSignIn = outcome.kind === "authentication" ||
    (outcome.kind === undefined && Boolean(outcome.authError));
  return (
    <WorkspaceShell eyebrow={eyebrow} title={title}>
      <QueryState
        error={needsSignIn ? (
          <>
            {outcome.authError ?? outcome.message}{" "}
            <Link to="/access" className="font-semibold underline">
              Sign in or request access →
            </Link>
          </>
        ) : outcome.message}
      />
    </WorkspaceShell>
  );
}
export { LoaderFailure };
