import { afterEach, describe, expect, it, vi } from "vitest";
import { requestStripeJson, STRIPE_REQUEST_TIMEOUT_MS } from "../../src/modules/finance/finance-stripe-request.server";

function waitForAbort(signal: AbortSignal) {
  return new Promise<never>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("Stripe request deadline", () => {
  it.each(["headers", "body"])("aborts a stalled %s without retrying", async phase => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      requestSignal = init.signal as AbortSignal;
      if (phase === "headers") return waitForAbort(requestSignal);
      return { ok: true, json: () => waitForAbort(requestSignal!) };
    });
    vi.stubGlobal("fetch", fetcher);
    const pending = requestStripeJson("https://api.stripe.com/v1/payment_intents", {
      method: "POST", headers: { "Idempotency-Key": "stable-attempt" },
    }, "Provider failed");
    const assertion = expect(pending).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(STRIPE_REQUEST_TIMEOUT_MS);
    await assertion;
    expect(requestSignal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([true, false])("cleans up its timer after HTTP success=%s", async ok => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok, json: async () => ({ id: "pi_1" }) })));
    const pending = requestStripeJson("https://api.stripe.com/v1/payment_intents", {}, "Provider failed");
    if (ok) await expect(pending).resolves.toEqual({ id: "pi_1" });
    else await expect(pending).rejects.toThrow("Provider failed");
    expect(vi.getTimerCount()).toBe(0);
  });
});
