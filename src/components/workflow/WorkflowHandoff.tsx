import type { ReactNode } from "react";
/** Handoff is displayed from canonical server state; no client-side approval inference. */
export function WorkflowHandoff({ title, description, action, blockedReason }: {
  title: string; description?: string; action?: ReactNode; blockedReason?: string | null;
}) {
  return <section className="rounded-lg border p-4" aria-label={title}>
    <h3 className="font-semibold">{title}</h3>
    {description && <p className="mt-2 text-sm">{description}</p>}
    {blockedReason && <p role="status" className="mt-2 text-sm">Blocked: {blockedReason}</p>}
    {action && <div className="mt-3">{action}</div>}
  </section>;
}
