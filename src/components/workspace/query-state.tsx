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
      <p className="mt-8 text-sm" role="status">
        {typeof loading === "string" ? loading : "Loading…"}
      </p>
    );
  }
  if (error) {
    return <WorkspaceNotice tone="danger" className="mt-8">
      <span>{error}</span>
      {onRetry && <Button type="button" variant="ghost" size="sm" onClick={onRetry} disabled={retrying}
        className="ml-auto underline underline-offset-4">
        {retrying ? "Retrying…" : "Retry"}
      </Button>}
    </WorkspaceNotice>;
  }
  if (isEmpty) {
    return <>{empty ?? <EmptyState title="Nothing to show yet." />}</>;
  }
  return <>{children}</>;
}

export { QueryState };
