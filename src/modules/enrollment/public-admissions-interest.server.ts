import { createHmac } from "node:crypto";
import { and, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  programPublications, programs, publicAdmissionsInterests,
  sitePublications, sites,
} from "@/db/schema";
import { publishableAcademicProgram } from "@/domain/academic-program-publication";
import { publicAdmissionsInterestInput, type PublicAdmissionsInterestInput } from "@/domain/public-admissions-interest";
import { isPublicSiteSlug } from "@/domain/public-site-address";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { ensurePublicInterestFollowUp } from "./public-interest-follow-up.server";

const BUDGET = 30;
const WINDOW_SECONDS = 60;

/**
 * Coarse global, atomic emergency limiter. No unauthenticated forwarding
 * headers/IP/email are trusted as identity. Edge-side bot defenses are still
 * necessary before a production tenant-host launch.
 */
export async function admitPublicAdmissionsInterest(): Promise<{
  allowed: boolean; retryAfterSeconds: number;
}> {
  const row = await db.execute(sql`
    INSERT INTO auth_request_rate_limits AS bucket
      (route, window_started_at, request_count)
    VALUES ('public_site_inquiry', now(), 1)
    ON CONFLICT (route) DO UPDATE SET
      request_count = CASE
        WHEN bucket.window_started_at <= now() - interval '60 seconds' THEN 1
        ELSE LEAST(bucket.request_count + 1, ${BUDGET + 1})
      END,
      window_started_at = CASE
        WHEN bucket.window_started_at <= now() - interval '60 seconds' THEN now()
        ELSE bucket.window_started_at
      END
    RETURNING request_count <= ${BUDGET} AS allowed,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM
        (window_started_at + interval '60 seconds' - now())))::integer)
        AS "retryAfterSeconds"
  `);
  const first = row.rows[0] as { allowed?: unknown; retryAfterSeconds?: unknown } | undefined;
  if (typeof first?.allowed !== "boolean" ||
      typeof first.retryAfterSeconds !== "number") throw new Error("Inquiry admission budget unavailable");
  return { allowed: first.allowed, retryAfterSeconds:
    first.allowed ? 0 : Math.max(1, Math.min(60, Math.ceil(first.retryAfterSeconds))) };
}

/** A public visitor may express interest but cannot create an Application,
 * Person, Household, enrollment, or guardian account/grant. */
export async function recordPublicAdmissionsInterest(
  slug: string,
  input: PublicAdmissionsInterestInput,
): Promise<void> {
  if (!isPublicSiteSlug(slug)) throw new Error("This Site is not accepting inquiries");
  const data = publicAdmissionsInterestInput.parse(input);
  if (data.website.trim()) return; // Bot honeypot; do not write contact records.
  const pepper = process.env.CAN_ACCESS_TOKEN_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("Inquiry security is unavailable");
  return db.transaction(async tx => {
    const [matched] = await tx.select({
      siteId: sites.id,
      organizationId: sites.organizationId,
      programSiteId: programs.siteId,
      programOrganizationId: programs.organizationId,
      type: programs.type,
      status: programs.status,
    }).from(sitePublications)
      .innerJoin(sites, eq(sites.id, sitePublications.siteId))
      .innerJoin(programPublications, and(
        eq(programPublications.siteId, sites.id),
        eq(programPublications.programId, input.programId),
      ))
      .innerJoin(programs, eq(programs.id, programPublications.programId))
      .where(and(
        eq(sitePublications.slug, slug),
        eq(sitePublications.status, "published"),
        isNotNull(sitePublications.publishedAt),
        eq(programPublications.status, "published"),
        isNotNull(programPublications.publishedAt),
        inArray(programs.status, ["draft", "launching", "ready", "active"]),
      )).for("share", { of: sitePublications }).limit(1);

    if (!matched || !publishableAcademicProgram({
      type: matched.type,
      status: matched.status,
      siteId: matched.programSiteId,
      publicationSiteId: matched.siteId,
      organizationId: matched.programOrganizationId,
      siteOrganizationId: matched.organizationId,
    })) throw new Error("This Program is not accepting inquiries");

    const emailDigest = createHmac("sha256", pepper)
      .update(matched.siteId).update(":").update(input.programId)
      .update(":").update(data.email).digest("hex");

    // Serialize repeat interest for the same Site/Program/contact across
    // independent one-time form request IDs. Do not create a duplicate inbox.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${emailDigest}))`);
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recent] = await tx.select({ id: publicAdmissionsInterests.id })
      .from(publicAdmissionsInterests).where(and(
        eq(publicAdmissionsInterests.programId, input.programId),
        eq(publicAdmissionsInterests.emailDigest, emailDigest),
        gt(publicAdmissionsInterests.createdAt, cutoff),
      )).orderBy(desc(publicAdmissionsInterests.createdAt)).limit(1);
    if (recent) return;

    const [created] = await tx.insert(publicAdmissionsInterests).values({
      requestId: data.requestId,
      siteId: matched.siteId,
      programId: input.programId,
      contactFirstName: data.firstName,
      contactLastName: data.lastName,
      contactEmail: data.email,
      emailDigest,
      message: data.message,
      status: "new",
    }).onConflictDoNothing().returning({ id: publicAdmissionsInterests.id });
    if (!created) return; // Retry with the same form request ID.
    // One canonical Action per accepted interest, atomically with the lead.
    // The preceding cooldown lock/unique request key prevent retry duplicates.
    await ensurePublicInterestFollowUp(tx, {
      interestId: created.id, organizationId: matched.organizationId,
      siteId: matched.siteId, programId: input.programId,
    });

    // Events/audit intentionally never include a raw visitor name/email/note.
    await emitEvent(tx, {
      eventType: "PublicAdmissionsInterestReceived",
      aggregateType: "public_admissions_interest",
      aggregateId: created.id,
      siteId: matched.siteId,
      organizationId: matched.organizationId,
      programId: input.programId,
      payload: { source: "published_site", status: "new" },
    });
    await writeAudit(tx, {
      action: "admissions.public_interest.receive",
      resourceType: "public_admissions_interest",
      resourceId: created.id,
      actorPersonId: null,
      scope: { siteId: matched.siteId, organizationId: matched.organizationId,
        programId: input.programId },
      after: { status: "new", source: "published_site" },
      context: { anonymous: true },
    });
  });
}
