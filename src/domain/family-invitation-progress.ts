type OutboxStatus = "pending" | "processing" | "failed" | "processed" | null;
type Batch = {
  status: "queued" | "retrying" | "complete";
  outboxStatus: OutboxStatus;
  recipients: readonly { status: "queued" | "provider_accepted" | "retrying" | "responded" }[];
};

/** Provider acceptance and application response are separate observed facts. */
export function familyInvitationProgress(batch: Batch) {
  const failedRecipients = batch.recipients.filter(recipient => recipient.status === "retrying").length;
  const canRetry = batch.outboxStatus === "failed" && failedRecipients > 0;
  const label = batch.outboxStatus === "failed"
    ? "Automatic retries exhausted; operations alerted."
    : batch.outboxStatus === "pending"
      ? batch.status === "retrying" ? "Retry queued." : "Queued for provider processing."
      : batch.outboxStatus === "processing"
        ? "Sending or automatically retrying."
        : batch.status === "complete" && batch.outboxStatus === "processed"
          ? "All recipients accepted by the provider; inbox delivery is not verified."
          : "Processing status unavailable; refresh before taking action.";
  return { failedRecipients, canRetry, label };
}

export function familyInvitationRetryLabel(outboxStatus: OutboxStatus): string {
  return outboxStatus === "failed" ? "Retry needed" :
    outboxStatus === "pending" ? "Retry queued" :
      outboxStatus === "processing" ? "Automatic retry in progress" : "Retry status unavailable";
}

