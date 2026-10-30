import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { DeliveryHistory } from "@/components/communication/DeliveryHistory";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search, children, ...props }: { to: string; search: Record<string, string>; children: ReactNode }) =>
    <a href={to + "?" + new URLSearchParams(search)} {...props}>{children}</a>,
}));

describe("watch delivery history presentation", () => {
  it("distinguishes provider acceptance from actual delivery and preserves pagination context", () => {
    const html = renderToStaticMarkup(<DeliveryHistory history={{
      items: [{
        id: "delivery", channel: "email", kind: "Watch update", status: "delivered",
        label: "Accepted by provider",
        detail: "Inbox or handset delivery and reading are not verified.",
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
