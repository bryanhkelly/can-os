import * as React from "react";

import { EmptyState } from "./empty-state";
import { WorkspaceNotice } from "./notice";
import { Button } from "@/components/ui/button";

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
      <div className="mt-8 min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]" role="status" aria-live="polite">
        {loading}
      </div>
    );
  }
  if (error) {
    return <WorkspaceNotice tone="danger" className="mt-8">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
      <span className="min-w-0 basis-full [overflow-wrap:anywhere] sm:flex-1 sm:basis-auto">{error}</span>
      {onRetry && <Button type="button" variant="ghost" size="sm" onClick={onRetry} loading={retrying} loadingLabel="Retrying…" disabled={retrying}>
        Retry
      </Button>}
      </div>
    </WorkspaceNotice>;
  }
  if (isEmpty) {
    return <>{empty ?? <EmptyState title="Nothing to show yet." />}</>;
  }
  return <>{children}</>;
}

export { QueryState };
