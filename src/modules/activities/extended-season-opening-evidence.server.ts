import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, calendarEvents, documents, people,
  safeguardingSitePolicies, safeguardingSiteResponders,
} from "@/db/schema";
import { listExtendedSessionStaff } from "./extended-learning-sessions.server";
import { verifiedAdultSafetyEvidence } from "@/modules/operations/onsite-block-safety.server";

type Reader = Pick<typeof db, "select" | "selectDistinctOn">;
type Season = {
  seasonId: string;
  siteId: string;
  programId: string;
  organizationId: string;
  academicProviderOrganizationId: string | null;
};
const categories = [
  "site_safeguarding_coverage",
  "site_emergency_response",
  "site_authorized_pickup",
] as const;

/**
 * Current SERVER-VERIFIED facts only. No season metadata, registrar checkbox or
 * last week's publication is an approval. If evidence is absent, this fails closed.
 * Site documents must have independently reviewed private storage provenance.
 */
export async function readExtendedSeasonOpeningApprovals(
  tx: Reader, season: Season, now = new Date(),
) {
  const [policy, responders, documentsAtSite, sessions, staff] = await Promise.all([
    tx.select().from(safeguardingSitePolicies)
      .where(eq(safeguardingSitePolicies.siteId, season.siteId)).limit(1),
    tx.select({ personId: safeguardingSiteResponders.personId,
      responsibility: safeguardingSiteResponders.responsibility })
      .from(safeguardingSiteResponders)
      .innerJoin(people, and(eq(people.id, safeguardingSiteResponders.personId),
        eq(people.active, true)))
      .where(eq(safeguardingSiteResponders.siteId, season.siteId)),
    tx.select().from(documents).where(and(
      eq(documents.subjectType, "site"),
      eq(documents.subjectId, season.siteId),
      inArray(documents.category, [...categories]),
    )).orderBy(desc(documents.createdAt), desc(documents.id)),
    tx.select({ startsAt: calendarEvents.startsAt, endsAt: calendarEvents.endsAt,
      metadata: calendarEvents.metadata })
      .from(calendarEvents).where(and(
        eq(calendarEvents.sourceType, "activity_season"),
        eq(calendarEvents.sourceId, season.seasonId),
        eq(calendarEvents.type, "extended_learning_session"),
        eq(calendarEvents.organizationId, season.organizationId),
        eq(calendarEvents.siteId, season.siteId),
        eq(calendarEvents.programId, season.programId),
      )),
    listExtendedSessionStaff(season.organizationId, season.siteId, tx),
  ]);
  const latest = new Map<string, (typeof documentsAtSite)[number]>();
  for (const row of documentsAtSite) if (!latest.has(row.category)) latest.set(row.category, row);
  const reviewed = [...categories].map(category => latest.get(category)).filter(
    (row): row is (typeof documentsAtSite)[number] => Boolean(row),
  );
  const verifierIds = [...new Set(reviewed.map(row=>row.verifiedByPersonId)
    .filter((id):id is string=>Boolean(id)))];
  const verified = verifierIds.length && season.academicProviderOrganizationId
    ? await tx.select({ personId: accountPersonGrants.personId })
      .from(accountPersonGrants)
      .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
      .innerJoin(people, eq(people.id, accountPersonGrants.personId))
      .where(and(
        inArray(accountPersonGrants.personId, verifierIds),
        eq(accountPersonGrants.organizationId, season.academicProviderOrganizationId),
        eq(accountPersonGrants.role, "can_network_steward"),
        isNull(accountPersonGrants.siteId),
        eq(accountPersonGrants.active, true),
        eq(accountPersonGrants.isSynthetic, false),
        eq(accessAccounts.disabled, false),
        eq(people.active, true),
        sql`${accessAccounts.emailVerifiedAt} IS NOT NULL`,
      )) : [];
  const approvedReviewers = new Set(verified.map(row => row.personId));
  const approvedDoc = (category: typeof categories[number]) => {
    const row = latest.get(category);
    return Boolean(row && row.verifiedAt && row.verifiedAt <= now &&
      row.expiresAt && row.expiresAt > now && row.verifiedByPersonId &&
      approvedReviewers.has(row.verifiedByPersonId) &&
      row.uploadedByPersonId !== row.verifiedByPersonId &&
      row.storageProvider === "cloudflare_r2" &&
      row.metadata.storageVerified === true &&
      row.metadata.reviewStatus === "approved" &&
      row.metadata.isCurrent !== false &&
      row.metadata.siteId === season.siteId &&
      row.metadata.organizationId === season.organizationId);
  };
  const p = policy[0];
  const responderRoles = ["primary", "deputy", "can_lead"];
  const assigned = responderRoles.map(role =>
    responders.find(row => row.responsibility === role)?.personId ?? null);
  const safeguardingCurrent = Boolean(p?.active && p.reviewedByPersonId && p.reviewedAt &&
    p.reviewedAt <= now && now.getTime() - p.reviewedAt.getTime() <= 30*24*60*60*1000 &&
    p.emergencyInstructions.trim() && p.externalReportingInstructions.trim() &&
    p.offlineInstructions.trim() && assigned.every(Boolean) &&
    new Set(assigned).size === responderRoles.length);

  const staffIds = new Set(staff.map(row => row.personId));
  const assignedSessions = sessions.map(event => {
    const detail = event.metadata.extendedLearningSession;
    const personId = detail && typeof detail === "object" && "facilitatorPersonId" in detail &&
      typeof detail.facilitatorPersonId === "string" ? detail.facilitatorPersonId : null;
    return { ...event, personId };
  });
  const allAssigned = sessions.length > 0 && assignedSessions.every(event =>
    event.personId && staffIds.has(event.personId) && event.endsAt &&
    event.endsAt > event.startsAt && event.metadata.cancelled !== true);
  const qualifications = allAssigned ? await verifiedAdultSafetyEvidence(tx,
    assignedSessions.map(event => event.personId!).filter(Boolean)) : new Map();
  const verifiedOnsiteStaffing = Boolean(allAssigned && assignedSessions.every(event => {
    const evidence = qualifications.get(event.personId!);
    const covers = (periods: readonly { from: Date; through: Date | null }[] | undefined) =>
      periods?.some(period => period.from <= event.startsAt &&
        period.through && event.endsAt && period.through >= event.endsAt) === true;
    return covers(evidence?.screening) && covers(evidence?.training);
  }));
  return {
    approvedSafeguardingCoverage: safeguardingCurrent && approvedDoc("site_safeguarding_coverage"),
    verifiedOnsiteStaffing,
    emergencyResponsePlanApproved: approvedDoc("site_emergency_response"),
    pickupAndReleasePolicyApproved: approvedDoc("site_authorized_pickup"),
    datedSessionsAndCoverageVerified: Boolean(allAssigned && verifiedOnsiteStaffing),
  };
}
