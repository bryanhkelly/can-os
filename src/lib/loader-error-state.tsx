import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { QueryState } from "@/components/workspace";
import type { LoaderFailureKind } from "./safe-loader";

export interface LoaderErrorStateProps {
  outcome: {
    authError: string | null;
    message: string;
    kind?: LoaderFailureKind;
    retryable?: boolean;
  };
  onRetry?: () => void;
  retrying?: boolean;
  fallback?: ReactNode;
}

/**
 * Reusable error body for workspace pages, dialogs and embedded panels.
 * The shell is deliberately supplied by the consumer.
 */
export function LoaderErrorState({ outcome, onRetry, retrying, fallback }: LoaderErrorStateProps) {
  const needsSignIn = outcome.kind === "authentication" ||
    (outcome.kind === undefined && Boolean(outcome.authError));
  const error = needsSignIn ? (
    <>
      {outcome.authError ?? outcome.message}{" "}
      <Link to="/access" className="font-semibold underline">
        Sign in or request access →
      </Link>
    </>
  ) : (fallback ?? outcome.message);
  return <QueryState
    error={error}
    onRetry={outcome.retryable ? onRetry : undefined}
    retrying={retrying}
  />;
}
