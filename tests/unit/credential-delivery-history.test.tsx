import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CredentialDeliveryHistory, type CredentialDeliveryRecord } from "@/components/learning/CredentialDeliveryHistory";

const baseline = {
  id: "delivery-1",
  recipientName: "Example Registrar",
  recipientEmail: "registrar@example.test",
  status: "accepted" as const,
  providerMessageId: "provider-ack-1",
  lastError: null,
  createdAt: new Date("2026-11-15T18:00:00.000Z"),
  sentAt: null,
} satisfies CredentialDeliveryRecord;

describe("V6.1 academic credential transport history", () => {
  it("distinguishes provider acceptance from verified receipt", () => {
    const html = renderToStaticMarkup(<CredentialDeliveryHistory records={[baseline]}/>);
    expect(html).toContain('aria-label="Academic credential delivery history"');
    expect(html).toContain("Accepted by provider");
    expect(html).toContain("border-info/40");
    expect(html).toContain("provider-ack-1");
    expect(html).toContain("Example Registrar");
    expect(html).toContain("Delivery requested · Example Registrar");
    expect(html).toContain("2026-11-15T18:00:00.000Z");
    expect(html).not.toContain("Delivered to recipient");
    expect(html).not.toContain("border-success/50");
  });

  it("uses danger for failed transport and warning for pending without changing order", () => {
    const html = renderToStaticMarkup(<CredentialDeliveryHistory records={[
      {...baseline, id: "failed", status: "failed", lastError: "Provider rejected request", providerMessageId: null},
      {...baseline, id: "pending", status: "pending", providerMessageId: null},
    ]}/>);
    expect(html).toContain("border-danger/50");
    expect(html).toContain("border-warning/50");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Provider rejected request");
    expect(html.indexOf("Failed")).toBeLessThan(html.indexOf("Pending"));
    expect((html.match(/<li\b/g) ?? []).length).toBe(2);
  });

  it("shows an explicit absence without inventing delivery events", () => {
    const html = renderToStaticMarkup(<CredentialDeliveryHistory records={[]}/>);
    expect(html).toContain("No delivery receipts loaded.");
    expect(html).not.toContain("<ol");
  });
});
