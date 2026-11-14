import { renderPdfDocument } from "@/platform/documents/pdf.server";
import type { CredentialKind } from "./credential-awards";

/** Render an already-authorized noncredit award. This file never issues or
 * verifies a credential, and must only receive issuer-approved record data.
 */
export type NoncreditCredentialDocument = {
  kind: CredentialKind;
  issuerName: string;
  recipientName: string;
  awardTitle: string;
  credentialReference: string;
  issuedAt: string; // ISO-8601 date, from immutable issuance
  description?: string;
};

function required(value: string, field: string, maxLength: number): string {
  const clean = value.trim();
  if (!clean || clean.length > maxLength || /[\u0000-\u001f\u007f]/.test(clean))
    throw new Error(`Invalid ${field} for credential document`);
  return clean;
}

function prepared(input: NoncreditCredentialDocument) {
  return {
    kind: input.kind,
    issuer: required(input.issuerName, "issuer", 160),
    recipient: required(input.recipientName, "recipient", 160),
    title: required(input.awardTitle, "award title", 180),
    reference: required(input.credentialReference, "credential reference", 160),
    date: required(input.issuedAt, "issued date", 10),
    description: input.description?.trim() ?? "",
  };
}

export function completionCertificatePdf(input: NoncreditCredentialDocument): Uint8Array {
  if (input.kind !== "completion_certificate")
    throw new Error("PDF completion certificate requires a certificate award");
  const d = prepared(input);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Number.isFinite(Date.parse(d.date + "T00:00:00Z")))
    throw new Error("Issued date must be an ISO date");
  return renderPdfDocument({
    title: "CERTIFICATE OF COMPLETION",
    brand: { name: d.issuer, subtitle: "Noncredit education and training" },
    lines: [
      "", "This certifies that", d.recipient, "",
      "successfully completed", d.title,
      ...(d.description ? ["", d.description] : []),
      "", "Date issued: " + d.date,
      "Credential reference: " + d.reference,
      "", "This is a noncredit completion record. It does not confer",
      "academic credit, a professional certification, or a license.",
      "Current validity must be confirmed with the issuing organization.",
    ],
    footer: "Noncredit award | " + d.reference,
  });
}

/** A private, portable badge summary. This intentionally does not claim
 * Open Badges conformance or self-verification without signed assertions.
 */
export function digitalBadgeSummary(input: NoncreditCredentialDocument) {
  if (input.kind !== "digital_badge") throw new Error("Badge summary requires a digital badge");
  const d = prepared(input);
  return {
    format: "can-os-digital-badge-v1" as const,
    issuer: d.issuer,
    recipient: d.recipient,
    title: d.title,
    description: d.description,
    credentialReference: d.reference,
    issuedAt: d.date,
    category: "noncredit" as const,
    verification: "issuer-status-check-required" as const,
    claimsAcademicCredit: false,
    claimsProfessionalCertification: false,
  };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Self-contained, text-only badge preview, without executable SVG content. */
export function digitalBadgeSvg(input: NoncreditCredentialDocument): string {
  if (input.kind !== "digital_badge") throw new Error("SVG badge requires a digital badge");
  const d = prepared(input);
  const title = d.title.length > 39 ? d.title.slice(0, 36) + "..." : d.title;
  const org = d.issuer.length > 45 ? d.issuer.slice(0, 42) + "..." : d.issuer;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="380" viewBox="0 0 680 380" role="img" aria-label="Digital badge preview for ${escapeXml(d.title)}">
<rect width="680" height="380" fill="#0D2530"/>
<rect x="18" y="18" width="644" height="344" fill="none" stroke="#D4B574" stroke-width="2"/>
<rect x="48" y="52" width="76" height="76" fill="#D4B574"/>
<path d="M86 67 L104 86 L86 113 L68 86 Z" fill="#0D2530"/>
<text x="150" y="73" fill="#D4B574" font-family="Arial, sans-serif" font-size="18" letter-spacing="3">DIGITAL BADGE</text>
<text x="48" y="194" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="30" font-weight="bold">${escapeXml(title)}</text>
<text x="48" y="243" fill="#CFDBDF" font-family="Arial, sans-serif" font-size="20">${escapeXml(org)}</text>
<line x1="48" y1="271" x2="632" y2="271" stroke="#82989F"/>
<text x="48" y="304" fill="#CFDBDF" font-family="Arial, sans-serif" font-size="15">Noncredit achievement</text>
<text x="48" y="332" fill="#D4B574" font-family="Arial, sans-serif" font-size="13">Status requires issuer verification</text>
</svg>`;
}
