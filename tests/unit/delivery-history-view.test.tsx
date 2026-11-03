import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { DeliveryHistory } from "@/components/communication/DeliveryHistory";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search, hash, children, ...props }: { to: string; search?: Record<string, string>; hash?: string; children: ReactNode }) =>
    <a href={to + (search ? "?" + new URLSearchParams(search) : "") + (hash ? "#" + hash : "")} {...props}>{children}</a>,
}));

describe("watch delivery history presentation", () => {
  it("distinguishes provider acceptance from actual delivery and preserves pagination context", () => {
    const html = renderToStaticMarkup(<DeliveryHistory history={{
      items: [{
        id: "delivery", channel: "email", kind: "Watch update", status: "delivered",
        label: "Accepted by provider",
        detail: "Inbox or handset delivery and reading are not verified.",
        nextStep: "Check your inbox, spam folder or handset.", recovery: null,
        attempts: 2, createdAt: "2030-01-01T12:00:00.000Z",
        acceptedAt: "2030-01-01T12:01:00.000Z", nextAttemptAt: null,
      }], nextCursor: "older-page",
    }} notification="selected-notice" cursor="current-page" refreshing={false} onRefresh={vi.fn()} />);
    expect(html).toContain("Accepted by provider");
    expect(html).toContain("not verified");
    expect(html).toContain("Provider attempts:");
    expect(html).toContain("Provider accepted:");
    expect(html).toContain("notification=selected-notice&amp;deliveryCursor=older-page");
    expect(html).toContain("Latest deliveries");
    expect(html).toContain("Refresh delivery status");
    expect(html).not.toContain("Read receipt");
  });
  it("shows an explicit empty state without inventing delivery success", () => {
    const html = renderToStaticMarkup(<DeliveryHistory history={{ items: [], nextCursor: null }}
      refreshing={true} onRefresh={vi.fn()} />);
    expect(html).toContain("No watch delivery records");
    expect(html).toContain("not a log of all messages");
    expect(html).toContain("Refreshing...");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Older deliveries");
    expect(html).not.toContain("Available in CAN");
  });
  it("links consent repair to preferences without offering a resend", () => {
    const html = renderToStaticMarkup(<DeliveryHistory history={{ items: [{
      id: "failed-delivery", channel: "sms", kind: "Watch update", status: "failed",
      label: "Failed", detail: "SMS requires a verified phone number and current opt-in.",
      nextStep: "Verify your phone and explicitly opt in. This does not resend the failed update.",
      recovery: "preferences", attempts: 1, createdAt: "2030-01-01T12:00:00.000Z",
      acceptedAt: null, nextAttemptAt: null,
    }], nextCursor: null }} refreshing={false} onRefresh={vi.fn()} />);
    expect(html).toContain("/guardian/watching#notification-preferences");
    expect(html).toContain("does not resend");
    expect(html).toContain("failed-delivery");
    expect(html).not.toContain("Retry delivery");
  });
  it("keeps history errors explicit and offers recovery without claiming an empty history", () => {
    const html = renderToStaticMarkup(<DeliveryHistory history={null} cursor="unavailable-page"
      refreshing={false} onRefresh={vi.fn()} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Delivery history is unavailable");
    expect(html).toContain("notifications are still available");
    expect(html).toContain("Latest deliveries");
    expect(html).not.toContain("No watch delivery records");
  });
});
