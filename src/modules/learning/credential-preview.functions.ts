import { eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { noncreditTrainingVersions } from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import {
  completionCertificatePdf, digitalBadgeSummary, digitalBadgeSvg,
} from "@/domain/credential-artifacts.server";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

const previewInput = z.object({
  trainingVersionId: z.string().uuid(),
  format: z.enum(["pdf", "badge_svg", "badge_json"]),
}).strict();

/** Produces clearly labeled SAMPLE documents, never awards or verification.
 * No credential tables, Person names, student records or issuance permission
 * are accessed. The training title is resolved under provider scope server-side.
 */
export const previewNoncreditCredential = createServerFn({ method: "POST" })
  .validator((value: unknown) => previewInput.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCanonicalCommandContext(getRequest());
    if (!actor.actorPersonId || !["registrar", "site_admin"].includes(actor.role ?? ""))
      throw new AuthorizationError("credential preview staff");
    assertCapability(actor, "credential.issue");
    const orgIds = actor.scope.organizationIds ?? [];
    if (orgIds.length !== 1) throw new AuthorizationError("single provider scope");
    const [training] = await db.select({
      title: noncreditTrainingVersions.title,
      providerOrganizationId: noncreditTrainingVersions.providerOrganizationId,
      state: noncreditTrainingVersions.state,
    }).from(noncreditTrainingVersions)
      .where(eq(noncreditTrainingVersions.id, data.trainingVersionId)).limit(1);
    if (!training || training.providerOrganizationId !== orgIds[0] ||
      training.state !== "published")
      throw new AuthorizationError("published provider training");

    const sample = {
      issuerName: "SAMPLE ISSUING ORGANIZATION",
      recipientName: "Example Learner",
      awardTitle: "SAMPLE - " + training.title,
      credentialReference: "SAMPLE-NOT-ISSUED",
      issuedAt: "2026-11-14",
      description: "SAMPLE PREVIEW ONLY - NOT AN ISSUED CREDENTIAL",
    } as const;
    if (data.format === "pdf") {
      const pdf = completionCertificatePdf({ ...sample, kind: "completion_certificate" });
      return { filename: "sample-completion-certificate.pdf", mediaType: "application/pdf",
        base64: Buffer.from(pdf).toString("base64") };
    }
    if (data.format === "badge_svg") {
      const svg = digitalBadgeSvg({ ...sample, kind: "digital_badge" });
      return { filename: "sample-digital-badge.svg", mediaType: "image/svg+xml",
        base64: Buffer.from(svg, "utf8").toString("base64") };
    }
    const json = digitalBadgeSummary({ ...sample, kind: "digital_badge" });
    return { filename: "sample-badge-metadata.json", mediaType: "application/json",
      base64: Buffer.from(JSON.stringify(json, null, 2), "utf8").toString("base64") };
  });
