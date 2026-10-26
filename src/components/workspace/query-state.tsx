import * as React from "react";

import { EmptyState } from "./empty-state";

export interface QueryStateProps {
  loading?: React.ReactNode;
  error?: React.ReactNode;
  isEmpty?: boolean;
  empty?: React.ReactNode;
  children?: React.ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
}

function QueryState({ loading, error, isEmpty, empty, children, onRetry, retrying }: QueryStateProps) {
  if (loading) {
    return (
      <p className="mt-8 text-sm" role="status">
        {typeof loading === "string" ? loading : "Loading…"}
      </p>
    );
  }
  if (error) {
    return (
      <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">
        {error}
        {onRetry && <button type="button" onClick={onRetry} disabled={retrying}
          className="ml-3 underline disabled:opacity-50">
          {retrying ? "Retrying…" : "Retry"}
        </button>}
      </p>
    );
  }
  if (isEmpty) {
    return <>{empty ?? <EmptyState title="Nothing to show yet." />}</>;
  }
  return <>{children}</>;
}

export { QueryState };
