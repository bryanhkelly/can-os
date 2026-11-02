import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { WorkspaceShell, QueryState } from "@/components/workspace";
import type { ClientError } from "@/lib/client-error";

export interface LoaderFailureProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  outcome: { error: ClientError };
}

/** Failure state for loaders wrapped in safeLoader: sign-in prompt for auth
 *  errors, a generic role="alert" error state for anything else. */
function LoaderFailure({ title, eyebrow, outcome }: LoaderFailureProps) {
  const needsAccess = outcome.error.code === "AUTHENTICATION_REQUIRED" || outcome.error.code === "FORBIDDEN";
  return (
    <WorkspaceShell eyebrow={eyebrow} title={title}>
      <QueryState
        error={
          needsAccess ? (
            <>
              {outcome.error.message}{" "}
              <Link to="/access" className="font-semibold underline">
                Sign in or request access →
              </Link>
            </>
          ) : (
            outcome.error.message
          )
        }
      />
    </WorkspaceShell>
  );
}

export { LoaderFailure };
