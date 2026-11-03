type Delivery = {
  status: "pending" | "processing" | "delivered" | "suppressed" | "failed";
  channel: "in_app" | "email" | "sms" | "agent_webhook";
  lastError: string | null;
  nextAttemptAt: Date | null;
};
type Outcome = { label: string; detail: string; nextStep: string; recovery: "preferences" | "watches" | null };

/** Project only allowlisted explanations, never provider responses or watched-record details. */
export function deliveryOutcome(row: Delivery): Outcome {
  switch (row.status) {
    case "delivered":
      return row.channel === "in_app"
        ? { label: "Available in CAN", detail: "The in-app notification was created. This does not mean it has been read.",
            nextStep: "Open the related notification in CAN. Refreshing status does not resend it.", recovery: null }
        : { label: "Accepted by provider", detail: "The sending provider accepted the request. Inbox or handset delivery and reading are not verified.",
            nextStep: "Check your inbox, spam folder or handset. Do not treat provider acceptance as a read receipt.", recovery: null };
    case "pending":
      return { label: "Queued", detail: row.nextAttemptAt ? "Waiting for the next scheduled attempt or the end of quiet hours." : "Waiting for the delivery worker.",
        nextStep: "The delivery worker acts next. Refresh status to check progress; do not create a duplicate watch.", recovery: null };
    case "processing":
      return { label: "Processing", detail: "A delivery worker has claimed this update. The outcome is not yet recorded.",
        nextStep: "Wait for the worker outcome and refresh status. Refresh does not start another send.", recovery: null };
    case "suppressed":
      return {
        label: "Not sent",
        detail: row.lastError === "authorization_failed"
          ? "Access to the watched record is no longer authorized."
          : row.lastError === "condition_resolved"
            ? "The watched condition no longer requires an update."
            : row.lastError === "watch_inactive"
              ? "The watch is inactive or expired."
              : "Delivery was suppressed by the current watch policy.",
        nextStep: row.lastError === "authorization_failed"
          ? "Ask the school to review access if needed. Re-enabling a watch cannot restore record permissions."
          : row.lastError === "condition_resolved"
            ? "No resend is needed for the resolved condition."
            : "Review the watch's current status and settings. Changing it does not resend this historical update.",
        recovery: row.lastError === "authorization_failed" || row.lastError === "condition_resolved" ? null : "watches",
      };
    case "failed":
      return {
        label: row.nextAttemptAt ? "Retry scheduled" : "Failed",
        detail: row.lastError === "no_active_email"
          ? "No active account email is available."
          : row.lastError === "sms_consent_required"
            ? "SMS requires a verified phone number and current opt-in."
            : row.lastError === "channel_not_supported"
              ? "This delivery channel is not supported."
              : "The delivery attempt failed. Provider details are not exposed here.",
        nextStep: row.lastError === "sms_consent_required"
          ? "Verify your phone and explicitly opt in under notification preferences. This does not resend the failed update."
          : row.lastError === "no_active_email"
            ? "Ask school support to review your verified account email. Creating another watch will not repair the account."
            : row.lastError === "channel_not_supported"
              ? "Choose a supported channel in watch settings for future updates."
              : row.nextAttemptAt
                ? "The worker will retry at the recorded time. Refresh status rather than submitting another send."
                : "Contact school support with this delivery ID. No automatic retry is currently scheduled.",
        recovery: row.lastError === "sms_consent_required" ? "preferences" :
          row.lastError === "channel_not_supported" ? "watches" : null,
      };
  }
}
