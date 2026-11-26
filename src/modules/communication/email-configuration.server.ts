/** Server-only configuration boundary. Sender authorization is purpose-specific:
 * a transactional identity is not automatically authorized for marketing.
 * Read at invocation time so runtime bindings and isolated tests remain valid.
 */
export type EmailPurpose = "access" | "notification" | "campaign";
export function readEmailConfiguration(purpose: EmailPurpose) {
  const env = process.env;
  const access = env.CAN_ACCESS_FROM_EMAIL?.trim();
  const notification = env.CAN_NOTIFICATIONS_FROM_EMAIL?.trim() || access;
  const campaign = env.CAN_CAMPAIGN_FROM_EMAIL?.trim();
  const candidate = purpose === "campaign" ? campaign : purpose === "notification" ? notification : access;
  const from = candidate && !/[\r\n]/.test(candidate) ? candidate : undefined;
  return {
    from,
    apiKey: env.RESEND_API_KEY?.trim(),
    publicOrigin: env.CAN_ACCESS_PUBLIC_ORIGIN?.trim(),
    webhookConfigured: Boolean(env.RESEND_WEBHOOK_SECRET?.trim()),
    postalAddress: env.CAN_CAMPAIGN_POSTAL_ADDRESS?.trim(),
  };
}
