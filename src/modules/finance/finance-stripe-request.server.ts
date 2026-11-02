import { DomainError } from "../../domain/errors";

// Bound both connection/header latency and response-body consumption. A timeout
// has an unknown provider outcome; callers must preserve the reserved attempt
// and its idempotency key rather than submit a new payment automatically.
export const STRIPE_REQUEST_TIMEOUT_MS = 8_000;

export async function requestStripeJson(url: string, init: RequestInit, failureMessage: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STRIPE_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(failureMessage);
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted)
      throw new DomainError("UNAVAILABLE", "Stripe request deadline exceeded");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
