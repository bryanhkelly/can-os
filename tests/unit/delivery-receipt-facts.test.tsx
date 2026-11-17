import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeliveryReceiptFacts } from "@/components/communication/DeliveryReceiptFacts";

const receipt = {
  id:"receipt-001",attempts:2,createdAt:"2026-11-17T19:00:00.000Z",
  acceptedAt:null,nextAttemptAt:null,
};

describe("V6.1 shared provider receipt facts", () => {
  it("shows source-owned attempts and receipt creation without inventing acceptance", () => {
    const html=renderToStaticMarkup(<DeliveryReceiptFacts receipt={receipt}/>);
    expect(html).toContain('aria-label="Transport receipt evidence"');
    expect(html).toContain("Receipt created");
    expect(html).toContain("Provider attempts");
    expect(html).toContain("receipt-001");
    expect(html).toContain("Nov 17, 2026, 7:00 PM UTC");
    expect((html.match(/<dt\b/g)??[]).length).toBe(3);
    expect(html).not.toContain("Provider accepted");
    expect(html).not.toContain("Delivered");
    expect(html).not.toContain("rounded");
  });

  it("shows exact provider and retry timestamps only when supplied", () => {
    const html=renderToStaticMarkup(<DeliveryReceiptFacts receipt={{
      ...receipt,acceptedAt:"2026-11-17T19:01:00.000Z",
      nextAttemptAt:"2026-11-18T20:00:00.000Z",
    }}/>);
    expect(html).toContain("Provider accepted");
    expect(html).toContain("Next scheduled attempt");
    expect(html).toContain("Nov 17, 2026, 7:01 PM UTC");
    expect((html.match(/<dt\b/g)??[]).length).toBe(5);
    expect(html).not.toContain("Recipient received");
  });

  it("is shared by both operator recovery panels, leaving retry commands feature-owned", () => {
    for (const path of [
      "src/components/enrollment/NoncreditDeliveryRecoveryPanel.tsx",
      "src/components/operations/SchoolFamilyDeliveryRecoveryPanel.tsx",
    ]) {
      const source=readFileSync(new URL(`../../${path}`,import.meta.url),"utf8");
      expect(source).toContain("<DeliveryReceiptFacts receipt=");
      expect(source).toContain("<StatusBadge");
      expect(source).toContain("<Field");
      expect(source).toContain("<Textarea");
      expect(source).not.toMatch(/<(?:label|textarea|button)\b/);
    }
    const noncredit=readFileSync(new URL("../../src/components/enrollment/NoncreditDeliveryRecoveryPanel.tsx",import.meta.url),"utf8");
    const family=readFileSync(new URL("../../src/components/operations/SchoolFamilyDeliveryRecoveryPanel.tsx",import.meta.url),"utf8");
    expect(noncredit).toContain("retryNoncreditDelivery");
    expect(family).toContain("retrySchoolFamilyDelivery");
    expect(family).toContain("requires_provider_reconciliation");
  });
});
