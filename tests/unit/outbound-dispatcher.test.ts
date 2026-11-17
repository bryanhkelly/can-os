import { describe, expect, it, vi } from "vitest";
import {
  dispatchOutboundMessages, type OutboundAdapter, type OutboundSendResult,
} from "@/modules/communication/outbound-dispatcher.server";

const start = new Date("2026-11-17T17:00:00.000Z");
function createAdapter(settings: {
  send?: (message: string, key: string) => Promise<OutboundSendResult>;
  prepared?: "ready" | "suppress" | "defer" | "fail";
  renew?: boolean;
  throwDuringPrepare?: boolean;
} = {}) {
  let receipt: { id: string; status: string; attempts: number; leaseUntil: Date | null;
    nextAttemptAt: Date | null; acceptedAt: Date | null; providerMessageId: string | null } = {
      id: "stable-receipt", status: "pending", attempts: 0, leaseUntil: null,
      nextAttemptAt: null, acceptedAt: null, providerMessageId: null,
    };
  const send = vi.fn(settings.send ?? (async () => true));
  const adapter: OutboundAdapter<string> = {
    async claim(now, seenIds, leaseMs) {
      if (seenIds.includes(receipt.id) || receipt.status !== "pending" &&
        receipt.status !== "failed" && receipt.status !== "processing") return null;
      if (receipt.nextAttemptAt && receipt.nextAttemptAt > now) return null;
      if (receipt.status === "processing" && receipt.leaseUntil && receipt.leaseUntil > now)
        return null;
      receipt = { ...receipt, status: "processing",
        leaseUntil: new Date(now.getTime() + leaseMs) };
      return { id: receipt.id, leaseUntil: receipt.leaseUntil, attempts: receipt.attempts };
    },
    async prepare() {
      if (settings.throwDuringPrepare) throw Error("transient source read failure");
      if (settings.prepared === "suppress") return { kind: "suppress", reason: "no_longer_eligible" };
      if (settings.prepared === "defer") return { kind: "defer", nextAttemptAt: new Date(start.getTime() + 600_000) };
      if (settings.prepared === "fail") return { kind: "fail", reason: "permanent_channel_failure" };
      return { kind: "ready", message: "safe message" };
    },
    async renew(claim, now, leaseMs) {
      if (settings.renew === false || claim.leaseUntil.getTime() !== receipt.leaseUntil?.getTime())
        return null;
      const leaseUntil = new Date(now.getTime() + leaseMs);
      receipt.leaseUntil = leaseUntil;
      return { ...claim, leaseUntil };
    },
    async defer(claim, until) {
      if (receipt.status !== "processing" ||
        receipt.leaseUntil?.getTime() !== claim.leaseUntil.getTime()) return false;
      receipt = { ...receipt, status: "pending", nextAttemptAt: until, leaseUntil: null };
      return true;
    },
    send,
    async settle(claim, outcome) {
      if (receipt.status !== "processing" ||
        receipt.leaseUntil?.getTime() !== claim.leaseUntil.getTime()) return false;
      receipt = { ...receipt, status: outcome.kind, attempts: outcome.attempts,
        nextAttemptAt: outcome.nextAttemptAt, leaseUntil: null,
        acceptedAt: outcome.kind === "accepted" ? outcome.now : null,
        providerMessageId: outcome.providerMessageId ?? receipt.providerMessageId };
      return true;
    },
    async attemptsAfterError(claim) {
      return receipt.status === "processing" &&
        receipt.leaseUntil?.getTime() === claim.leaseUntil.getTime()
        ? receipt.attempts + 1 : null;
    },
  };
  return { adapter, send, receipt: () => receipt };
}

describe("generic source-owned outbound dispatcher", () => {
  it("sends after claim and marks only provider acceptance", async () => {
    const { adapter, send, receipt } = createAdapter();
    const result = await dispatchOutboundMessages(adapter, {
      now: start, clock: () => start,
    });
    expect(result).toEqual({ accepted: 1, suppressed: 0, failed: 0 });
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith("safe message", "stable-receipt");
    expect(receipt().status).toBe("accepted");
    expect(receipt().attempts).toBe(1);
  });

  it("carries provider message identifiers without claiming inbox delivery", async () => {
    const { adapter, receipt } = createAdapter({
      send: async () => ({ accepted: true, providerMessageId: "email-provider-id-123" }),
    });
    const result = await dispatchOutboundMessages(adapter, { clock: () => start });
    expect(result.accepted).toBe(1);
    expect(receipt().providerMessageId).toBe("email-provider-id-123");
    expect(receipt().status).toBe("accepted");
  });

  it("suppresses revoked eligibility without calling transport", async () => {
    const { adapter, send, receipt } = createAdapter({ prepared: "suppress" });
    expect(await dispatchOutboundMessages(adapter, { clock: () => start })).toEqual({
      accepted: 0, suppressed: 1, failed: 0,
    });
    expect(send).not.toHaveBeenCalled();
    expect(receipt().attempts).toBe(0);
  });

  it("defers a quiet-hours notification without consuming an attempt", async () => {
    const { adapter, send, receipt } = createAdapter({ prepared: "defer" });
    expect(await dispatchOutboundMessages(adapter, { clock: () => start })).toEqual({
      accepted: 0, suppressed: 0, failed: 0,
    });
    expect(send).not.toHaveBeenCalled();
    expect(receipt().status).toBe("pending");
    expect(receipt().attempts).toBe(0);
    expect(receipt().nextAttemptAt?.getTime()).toBe(start.getTime() + 600_000);
  });

  it("records an unrecoverable source failure without a retry or send", async () => {
    const { adapter, send, receipt } = createAdapter({ prepared: "fail" });
    expect(await dispatchOutboundMessages(adapter, { clock: () => start })).toEqual({
      accepted: 0, suppressed: 0, failed: 1,
    });
    expect(send).not.toHaveBeenCalled();
    expect(receipt().status).toBe("failed");
    expect(receipt().nextAttemptAt).toBeNull();
    expect(receipt().attempts).toBe(1);
  });

  it("does not send or settle when a lease cannot be renewed", async () => {
    const { adapter, send, receipt } = createAdapter({ renew: false });
    expect(await dispatchOutboundMessages(adapter, { clock: () => start })).toEqual({
      accepted: 0, suppressed: 0, failed: 0,
    });
    expect(send).not.toHaveBeenCalled();
    expect(receipt().status).toBe("processing");
  });

  it("backs off failed provider attempts and retains the idempotency key", async () => {
    const { adapter, send, receipt } = createAdapter({ send: async () => false });
    expect(await dispatchOutboundMessages(adapter, { clock: () => start })).toEqual({
      accepted: 0, suppressed: 0, failed: 1,
    });
    expect(receipt().status).toBe("failed");
    expect(receipt().nextAttemptAt?.getTime()).toBe(start.getTime() + 60_000);
    await dispatchOutboundMessages(adapter, {
      clock: () => new Date(start.getTime() + 60_000),
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(call => call[1])).toEqual(["stable-receipt", "stable-receipt"]);
    expect(receipt().nextAttemptAt?.getTime()).toBe(start.getTime() + 180_000);
  });

  it("counts preparation exceptions as failed attempts rather than dropping claims", async () => {
    const { adapter, send, receipt } = createAdapter({ throwDuringPrepare: true });
    const result = await dispatchOutboundMessages(adapter, { clock: () => start });
    expect(result.failed).toBe(1);
    expect(receipt().attempts).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
});
