import { and, desc, eq, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  credentialDefinitions, credentialDefinitionVersions, credentialIssuances,
  learnerAchievementDecisions,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import {
  completionCertificatePdf, digitalBadgeSummary, digitalBadgeSvg,
} from "@/domain/credential-artifacts.server";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

const id = z.string().uuid();
const downloadInput = z.object({
  issuanceId: id,
  format: z.enum(["pdf", "badge_svg", "badge_json"]),
}).strict();

async function learner() {
  if (process.env.CAN_CREDENTIAL_READER_ENABLED !== "true")
    throw new AuthorizationError("credential reader not enabled");
  const actor = await getCanonicalCommandContext(getRequest());
  if (!actor.actorPersonId || actor.role !== "learner")
    throw new AuthorizationError("current canonical learner");
  assertCapability(actor, "learning.participate");
  return actor.actorPersonId;
}

/** Subject-bound private award list. No external/public verification endpoint.
 * Retained only for a restricted learner DB role after RLS acceptance.
 */
export const listMyNoncreditCredentials = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const personId = await learner();
    return db.transaction(async tx => {
      const awards = await tx.select({
        id: credentialIssuances.id,
        title: credentialDefinitionVersions.title,
        kind: credentialDefinitions.kind,
        credentialReference: credentialIssuances.credentialReference,
        issuedAt: credentialIssuances.issuedAt,
        expiresAt: credentialIssuances.expiresAt,
      }).from(credentialIssuances)
        .innerJoin(learnerAchievementDecisions,
          eq(learnerAchievementDecisions.id, credentialIssuances.achievementDecisionId))
        .innerJoin(credentialDefinitionVersions,
          eq(credentialDefinitionVersions.id,
            learnerAchievementDecisions.credentialDefinitionVersionId))
        .innerJoin(credentialDefinitions,
          eq(credentialDefinitions.id, credentialDefinitionVersions.definitionId))
        .where(eq(learnerAchievementDecisions.recipientPersonId, personId))
        .orderBy(desc(credentialIssuances.issuedAt)).limit(50);
      const status = await Promise.all(awards.map(async award => {
        const res = await tx.execute(sql`SELECT education_v30.v301_credential_is_current(
          ${award.id}::uuid) AS current`);
        return { ...award, current: res.rows[0]?.current === true };
      }));
      return status;
    });
  });

/** Authenticated owner download. Immutable issuer and recipient names are
 * resolved server-side, not supplied by the browser. Do not enable before
 * restricted read roles and revocation/source-freshness acceptance.
 */
export const downloadMyNoncreditCredential = createServerFn({ method: "POST" })
  .validator((value: unknown) => downloadInput.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const personId = await learner();
    return db.transaction(async tx => {
      const [record] = await tx.select({
        issuanceId: credentialIssuances.id,
        reference: credentialIssuances.credentialReference,
        issuedAt: credentialIssuances.issuedAt,
        kind: credentialDefinitions.kind,
        title: credentialDefinitionVersions.title,
        description: credentialDefinitionVersions.description,
        issuerId: credentialIssuances.issuerOrganizationId,
      }).from(credentialIssuances)
        .innerJoin(learnerAchievementDecisions,
          eq(credentialIssuances.achievementDecisionId, learnerAchievementDecisions.id))
        .innerJoin(credentialDefinitionVersions,
          eq(learnerAchievementDecisions.credentialDefinitionVersionId,
            credentialDefinitionVersions.id))
        .innerJoin(credentialDefinitions,
          eq(credentialDefinitionVersions.definitionId, credentialDefinitions.id))
        .where(and(
          eq(credentialIssuances.id, data.issuanceId),
          eq(learnerAchievementDecisions.recipientPersonId, personId),
        )).for("share").limit(1);
      if (!record) throw new AuthorizationError("credential owned by learner");

      const freshness = await tx.execute(sql`SELECT education_v30.v301_credential_is_current(
        ${record.issuanceId}::uuid) AS current`);
      if (freshness.rows[0]?.current !== true)
        throw new AuthorizationError("credential no longer valid");

      const [name, organization] = await Promise.all([
        tx.execute(sql`SELECT legal_first_name, legal_last_name
          FROM education_v30.persons WHERE id=${personId}::uuid`),
        tx.execute(sql`SELECT display_name FROM education_v30.organizations
          WHERE id=${record.issuerId}::uuid`),
      ]);
      const personRow = name.rows[0] as {legal_first_name?: unknown;legal_last_name?: unknown} | undefined;
      const orgRow = organization.rows[0] as {display_name?: unknown} | undefined;
      const recipientName = [personRow?.legal_first_name, personRow?.legal_last_name]
        .map(value => typeof value === "string" ? value.trim() : "").filter(Boolean).join(" ");
      const issuerName = typeof orgRow?.display_name === "string"
        ? orgRow.display_name : "";
      if (!recipientName || !issuerName)
        throw new AuthorizationError("complete verified recipient and issuer identity");

      const base = {
        kind: record.kind,
        issuerName, recipientName, awardTitle: record.title,
        credentialReference: record.reference,
        issuedAt: record.issuedAt.toISOString().slice(0, 10),
        description: record.description,
      };
      if (record.kind === "completion_certificate" && data.format === "pdf") {
        const pdf = completionCertificatePdf({ ...base, kind: "completion_certificate" });
        return { filename: "completion-" + record.issuanceId + ".pdf",
          mediaType: "application/pdf", base64: Buffer.from(pdf).toString("base64") };
      }
      if (record.kind === "digital_badge" && data.format === "badge_svg") {
        const artwork = digitalBadgeSvg({ ...base, kind: "digital_badge" });
        return { filename: "badge-" + record.issuanceId + ".svg",
          mediaType: "image/svg+xml", base64: Buffer.from(artwork, "utf8").toString("base64") };
      }
      if (record.kind === "digital_badge" && data.format === "badge_json") {
        const badge = digitalBadgeSummary({ ...base, kind: "digital_badge" });
        return { filename: "badge-" + record.issuanceId + ".json",
          mediaType: "application/json",
          base64: Buffer.from(JSON.stringify(badge, null, 2), "utf8").toString("base64") };
      }
      throw new AuthorizationError("format not supported by this award");
    });
  });
