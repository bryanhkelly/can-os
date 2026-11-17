import { StatusTimeline } from "@/components/workflow/status-timeline";
import type { listAcademicCredentialDeliveries } from "@/modules/learning/academic-credential-delivery.functions";

export type CredentialDeliveryRecord = Awaited<ReturnType<typeof listAcademicCredentialDeliveries>>[number];

/**
 * Read-only transport records. "Accepted" confirms provider acceptance, not
 * receipt by the institution or an authorized person. The server owns history.
 */
export function CredentialDeliveryHistory({ records }: {
  records: readonly CredentialDeliveryRecord[];
}) {
  return <StatusTimeline label="Academic credential delivery history"
    emptyMessage="No delivery receipts loaded."
    entries={records.map(record => ({
      id: record.id,
      title: `${record.recipientName} · ${record.recipientEmail}`,
      occurredAt: new Date(record.createdAt).toISOString(),
      status: record.status === "accepted" ? "Accepted by provider"
        : record.status === "failed" ? "Failed" : "Pending",
      tone: record.status === "accepted" ? "info" as const
        : record.status === "failed" ? "danger" as const : "attention" as const,
      description: record.providerMessageId || record.lastError ? <div className="space-y-1">
        {record.providerMessageId && <p>Provider receipt: {record.providerMessageId}</p>}
        {record.lastError && <p role="alert">{record.lastError}</p>}
      </div> : undefined,
    }))}/>;
}
