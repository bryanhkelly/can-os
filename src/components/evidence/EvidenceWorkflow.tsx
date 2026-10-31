import type { ReactNode } from "react";
import { EvidenceStatus } from "./EvidenceStatus";
export function EvidenceWorkflow({ title, status, description, rejectionReason, children }: {
  title: string; status: string; description?: ReactNode; rejectionReason?: string | null;
  children?: ReactNode;
}) {
  return <article className="rounded-lg border p-4 text-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h3 className="font-semibold">{title}</h3><EvidenceStatus status={status}/>
    </div>
    {description && <div className="mt-2">{description}</div>}
    {rejectionReason && <p role="alert" className="mt-2 rounded border border-danger p-2 text-xs">
      Rejection reason: {rejectionReason}
    </p>}
    {children}
  </article>;
}
