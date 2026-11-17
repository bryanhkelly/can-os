import { describe, expect, it, vi } from "vitest";
import {
  dispatchOutboundMessages, type OutboundAdapter, type OutboundClaim,
} from "@/modules/communication/outbound-dispatcher.server";

const start = new Date("2026-11-17T17:00:00.000Z");
function createAdapter(settings: {
  send?: (message: string, key: string) => Promise<boolean>;
  prepared?: "ready" | "suppress";
  renew?: boolean;
  throwDuringPrepare?: boolean;
} = {}) {
  let receipt: { id: string; status: string; attempts: number; leaseUntil: Date | null;
    nextAttemptAt: Date | null; acceptedAt: Date | null } = {
      id: "stable-receipt", status: "pending", attempts: 0, leaseUntil: null,
      nextAttemptAt: null, acceptedAt: null,
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
      return settings.prepared === "suppress"
        ? { kind: "suppress", reason: "no_longer_eligible" }
        : { kind: "ready", message: "safe message" };
    },
    async renew(claim, now, leaseMs) {
      if (settings.renew === false || claim.leaseUntil.getTime() !== receipt.leaseUntil?.getTime())
        return null;
      const leaseUntil = new Date(now.getTime() + leaseMs);
      receipt.leaseUntil = leaseUntil;
      return { ...claim, leaseUntil };
    },
    send,
    async settle(claim, outcome) {
      if (receipt.status !== "processing" ||
        receipt.leaseUntil?.getTime() !== claim.leaseUntil.getTime()) return false;
      receipt = { ...receipt, status: outcome.kind, attempts: outcome.attempts,
        nextAttemptAt: outcome.nextAttemptAt, leaseUntil: null,
        acceptedAt: outcome.kind === "accepted" ? outcome.now : null };
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

  it("suppresses revoked eligibility without calling transport", async () => {
    const { adapter, send, receipt } = createAdapter({ prepared: "suppress" });
    expect(await dispatchOutboundMessages(adapter, { clock: () => start })).toEqual({
      accepted: 0, suppressed: 1, failed: 0,
    });
    expect(send).not.toHaveBeenCalled();
    expect(receipt().attempts).toBe(0);
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
