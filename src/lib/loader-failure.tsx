import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { LoaderErrorState, type LoaderErrorStateProps } from "./loader-error-state";

export interface LoaderFailureProps extends LoaderErrorStateProps {
  title: ReactNode;
  eyebrow?: ReactNode;
}

/** Page-level shell around the reusable loader error body. */
function LoaderFailure({ title, eyebrow, ...state }: LoaderFailureProps) {
  return (
    <WorkspaceShell eyebrow={eyebrow} title={title}>
      <LoaderErrorState {...state} />
    </WorkspaceShell>
  );
}
export { LoaderFailure };
