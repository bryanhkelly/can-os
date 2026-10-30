import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { WorkspaceShell, QueryState } from "@/components/workspace";

export interface LoaderFailureProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  outcome: { authError: string | null; message: string };
}

/** Failure state for loaders wrapped in safeLoader: sign-in prompt for auth
 *  errors, a generic role="alert" error state for anything else. */
function LoaderFailure({ title, eyebrow, outcome }: LoaderFailureProps) {
  return (
    <WorkspaceShell eyebrow={eyebrow} title={title}>
      <QueryState
        error={
          outcome.authError ? (
            <>
              {outcome.authError}{" "}
              <Link to="/access" className="font-semibold underline">
                Sign in or request access →
              </Link>
            </>
          ) : (
            outcome.message
          )
        }
      />
    </WorkspaceShell>
  );
}

export { LoaderFailure };
