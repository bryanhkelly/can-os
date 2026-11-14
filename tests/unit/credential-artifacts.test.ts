import { describe, expect, it } from "vitest";
import { completionCertificatePdf, digitalBadgeSummary, digitalBadgeSvg } from "@/domain/credential-artifacts.server";

const sample = {
  kind: "completion_certificate" as const,
  issuerName: "CAN Academy",
  recipientName: "Taylor (J.) Learner",
  awardTitle: "Leadership Fundamentals",
  credentialReference: "CAN-12345678-1234-4234-8234-123456789abc",
  issuedAt: "2026-11-14",
};
describe("noncredit certificate and digital badge artifacts", () => {
  it("renders an identifiable, explicitly noncredit certificate", () => {
    const pdf = Buffer.from(completionCertificatePdf(sample)).toString("ascii");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("CERTIFICATE OF COMPLETION");
    expect(pdf).toContain("Taylor \\(J.\\) Learner");
    expect(pdf).toContain("Leadership Fundamentals");
    expect(pdf).toContain(sample.credentialReference);
    expect(pdf).toContain("does not confer");
    expect(pdf).toContain("%%EOF");
  });
  it("refuses malformed or unsupported document input", () => {
    expect(() => completionCertificatePdf({ ...sample, recipientName: "  " })).toThrow("recipient");
    expect(() => completionCertificatePdf({ ...sample, issuedAt: "yesterday" })).toThrow("ISO");
    expect(() => completionCertificatePdf({ ...sample, recipientName: "李" })).toThrow("Unicode");
  });
  it("serializes a private badge summary without claiming third-party accreditation", () => {
    const badge = digitalBadgeSummary({ ...sample, kind: "digital_badge" });
    expect(badge).toMatchObject({
      format: "can-os-digital-badge-v1",
      category: "noncredit",
      verification: "issuer-status-check-required",
      claimsAcademicCredit: false,
      claimsProfessionalCertification: false,
    });
  });
  it("escapes badge text and cannot inject SVG script markup", () => {
    const svg = digitalBadgeSvg({
      ...sample, kind: "digital_badge",
      awardTitle: `AI <script>alert("x")</script> & Skills`,
    });
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("Noncredit achievement");
    expect(svg).not.toContain("http://www.w3.org/1999/xlink");
  });
});
