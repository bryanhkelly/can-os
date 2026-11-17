import { createFileRoute } from "@tanstack/react-router";
import { handleResendDeliveryWebhook } from "@/modules/communication/resend-delivery-webhook.server";

/**
 * Public URL, authenticated exclusively by Resend's signed raw-body webhook.
 * No CAN user session grants delivery evidence.
 */
export const Route = createFileRoute("/api/webhooks/resend")({
  server: {
    handlers: {
      POST: ({ request }) => handleResendDeliveryWebhook(request),
    },
  },
});
