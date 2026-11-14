import { sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import {
  completionCertificatePdf, digitalBadgeSummary, digitalBadgeSvg,
} from "@/domain/credential-artifacts.server";
import {
  canonicalSessionDigestFromRequest, getCanonicalCommandContext,
} from "@/modules/identity/canonical-command-context.server";

const id = z.string().uuid();
const downloadInput = z.object({
  issuanceId: id,
  format: z.enum(["pdf", "badge_svg", "badge_json"]),
}).strict();

async function learner() {
  if (process.env.CAN_CREDENTIAL_READER_ENABLED !== "true")
    throw new AuthorizationError("credential reader not enabled");
  const request = getRequest();
  const actor = await getCanonicalCommandContext(request);
  if (!actor.actorPersonId || actor.role !== "learner")
    throw new AuthorizationError("current canonical learner");
  assertCapability(actor, "learning.participate");
  return canonicalSessionDigestFromRequest(request);
}

/** Subject-bound private award list. No external/public verification endpoint.
 * Retained only for a restricted learner DB role after RLS acceptance.
 */
export const listMyNoncreditCredentials = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const digest = await learner();
    return db.transaction(async tx => {
      await tx.execute(sql.raw("SET LOCAL ROLE can_v301_credential_learner_reader"));
      const result = await tx.execute(sql`
        SELECT issuance_id AS "id", title, kind,
               credential_reference AS "credentialReference",
               issued_at AS "issuedAt", expires_at AS "expiresAt",
               is_current AS "current"
        FROM education_v30.v301_list_my_learning_awards(${digest}::text)
      `);
      return result.rows as Array<{
        id: string; title: string; kind: "completion_certificate" | "digital_badge";
        credentialReference: string; issuedAt: Date | string;
        expiresAt: Date | string | null; current: boolean;
      }>;
    });
  });

/** Authenticated learner download. Immutable issuer and recipient names are
 * resolved server-side, not supplied by the browser. Do not enable before
 * restricted read roles and revocation/source-freshness acceptance.
 */
export const downloadMyNoncreditCredential = createServerFn({ method: "POST" })
  .validator((value: unknown) => downloadInput.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const digest = await learner();
    return db.transaction(async tx => {
      await tx.execute(sql.raw("SET LOCAL ROLE can_v301_credential_learner_reader"));
      const result = await tx.execute(sql`
        SELECT issuance_id, credential_reference, issued_at, kind, title,
               description, issuer_name, recipient_name
        FROM education_v30.v301_get_my_learning_award(
          ${digest}::text, ${data.issuanceId}::uuid)
      `);
      const record = result.rows[0] as {
        issuance_id: string; credential_reference: string; issued_at: Date | string;
        kind: "completion_certificate" | "digital_badge"; title: string;
        description: string; issuer_name: string; recipient_name: string;
      } | undefined;
      if (!record) throw new AuthorizationError("current learner-owned award");
      if (!record.recipient_name?.trim() || !record.issuer_name?.trim())
        throw new AuthorizationError("complete verified recipient and issuer identity");

      const base = {
        kind: record.kind,
        issuerName: record.issuer_name, recipientName: record.recipient_name,
        awardTitle: record.title,
        credentialReference: record.credential_reference,
        issuedAt: new Date(record.issued_at).toISOString().slice(0, 10),
        description: record.description,
      };
      if (record.kind === "completion_certificate" && data.format === "pdf") {
        const pdf = completionCertificatePdf({ ...base, kind: "completion_certificate" });
        return { filename: "completion-" + record.issuance_id + ".pdf",
          mediaType: "application/pdf", base64: Buffer.from(pdf).toString("base64") };
      }
      if (record.kind === "digital_badge" && data.format === "badge_svg") {
        const artwork = digitalBadgeSvg({ ...base, kind: "digital_badge" });
        return { filename: "badge-" + record.issuance_id + ".svg",
          mediaType: "image/svg+xml", base64: Buffer.from(artwork, "utf8").toString("base64") };
      }
      if (record.kind === "digital_badge" && data.format === "badge_json") {
        const badge = digitalBadgeSummary({ ...base, kind: "digital_badge" });
        return { filename: "badge-" + record.issuance_id + ".json",
          mediaType: "application/json",
          base64: Buffer.from(JSON.stringify(badge, null, 2), "utf8").toString("base64") };
      }
      throw new AuthorizationError("format not supported by this award");
    });
  });
