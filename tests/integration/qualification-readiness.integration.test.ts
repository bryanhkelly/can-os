import { describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { CommandContext } from "@/domain/command-context";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({ tx: undefined as Transaction | undefined }));
vi.mock("@/db/client", () => ({
  get db() {
    if (!state.tx) throw new Error("Qualification tests must stay in the rollback transaction");
    return state.tx;
  },
}));

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Missing qualification readiness fixture");
  return row;
}
const integration = process.env.DATABASE_URL ? describe : describe.skip;
integration("qualification evidence in launch readiness", () => {
  it("reflects canonical reviews, revocation and effective dates without granting teaching eligibility", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const s = await import("@/db/schema");
    const { reviewQualification } = await import("@/modules/profiles/qualification-review.server");
    const { evaluateSectionReadiness } = await import("@/modules/programs/section-readiness-service");
    const { getActiveDeliveryArrangement } = await import("@/modules/staffing/delivery-arrangement-service");
    const rollback = new Error("rollback-qualification-readiness");
    const suffix = crypto.randomUUID().slice(0, 8);
    const now = new Date("2030-01-01T12:00:00Z");
    let ownerId = "";
    let checked = false;
    try {
      await database.transaction(async tx => {
        state.tx = tx;
        const org = first(await tx.insert(s.organizations).values({
          type: "christian_school", name: "Qualification Test", slug: `qualification-${suffix}`,
        }).returning());
        const site = first(await tx.insert(s.sites).values({
          organizationId: org.id, name: "Qualification Site", slug: `qualification-${suffix}`,
        }).returning());
        const jurisdiction = first(await tx.insert(s.jurisdictions).values({
          code: `qualification-${suffix}`, name: "Synthetic qualification jurisdiction",
        }).returning());
        const program = first(await tx.insert(s.programs).values({
          organizationId: org.id, siteId: site.id, jurisdictionId: jurisdiction.id,
          type: "high_school_extension", status: "launching", name: "Qualification Program",
          slug: `qualification-${suffix}`, gradeRange: { min: "9", max: "12" },
          deliveryModel: { onsite: true }, hostOrganizationId: org.id,
          academicProviderOrganizationId: org.id, creditIssuingOrganizationId: org.id,
        }).returning());
        const teacher = first(await tx.insert(s.people).values({
          legalFirstName: "Synthetic", legalLastName: "QualificationTeacher",
        }).returning());
        ownerId = teacher.id;
        const reviewer = first(await tx.insert(s.people).values({
          legalFirstName: "Synthetic", legalLastName: "QualificationReviewer",
        }).returning());
        await tx.insert(s.memberships).values([teacher, reviewer].map(person => ({
          personId: person.id, organizationId: org.id,
        })));
        await tx.insert(s.roleAssignments).values({
          personId: reviewer.id, organizationId: org.id, roleKey: "registrar",
          capabilities: ["profiles.credentials.verify"],
        });
        const teacherContext: CommandContext = {
          actorPersonId: teacher.id, capabilities: new Set(["profiles.credentials.submit"]),
          scope: { organizationIds: [org.id] }, requestId: `qualification-teacher-${suffix}`,
        };
        const reviewerContext: CommandContext = {
          actorPersonId: reviewer.id, capabilities: new Set(["profiles.credentials.verify"]),
          scope: { organizationIds: [org.id] }, requestId: `qualification-reviewer-${suffix}`,
        };
        const { createAcademicTimeFixture } = await import("./helpers/academic-time");
        const time = await createAcademicTimeFixture({
          organizationId: org.id, siteId: site.id, programId: program.id, suffix,
        });
        const template = first(await tx.insert(s.courseTemplates).values({
          owningOrganizationId: org.id, code: `qualification-${suffix}`, title: "Science", subject: "Science",
        }).returning());
        const version = first(await tx.insert(s.courseTemplateVersions).values({
          courseTemplateId: template.id, version: 1, status: "published",
        }).returning());
        const section = first(await tx.insert(s.sections).values({
          programId: program.id, siteId: site.id, courseTemplateVersionId: version.id,
          termId: time.term.id, title: "Science", code: `qualification-${suffix}`,
        }).returning());
        const arrangement = first(await tx.insert(s.deliveryArrangements).values({
          sectionId: section.id, academicProviderOrganizationId: org.id,
          instructorPersonId: teacher.id, modality: "onsite", status: "active",
        }).returning());
        const periodStart = new Date("2030-01-01T12:00:00Z");
        const periodEnd = new Date("2030-01-02T12:00:00Z");
        const readinessAt = async (at: Date, ready: boolean) => {
          const result = await evaluateSectionReadiness(section.id, tx, at);
          expect(result.ready).toBe(ready);
          const delivery = first(result.items.filter(item => item.key === "delivery"));
          expect(delivery.state).toBe(ready ? "ready" : "blocked");
          if (!ready) {
            expect(delivery.message).toContain("effective at the evaluation time");
            expect(result.items.some(item => item.key === "qualification_evidence")).toBe(false);
          }
        };
        const window = async (effectiveFrom: Date | null, effectiveThrough: Date | null) => {
          await tx.update(s.deliveryArrangements).set({ effectiveFrom, effectiveThrough })
            .where(eq(s.deliveryArrangements.id, arrangement.id));
        };
        await window(periodStart, periodEnd);
        await readinessAt(new Date(periodStart.getTime() - 1), false);
        await readinessAt(periodStart, true);
        await readinessAt(new Date(periodEnd.getTime() - 1), true);
        await readinessAt(periodEnd, false);
        await readinessAt(new Date(periodEnd.getTime() + 1), false);
        await window(null, periodEnd);
        await readinessAt(new Date(periodStart.getTime() - 1), true);
        await window(periodStart, null);
        await readinessAt(new Date("2035-01-01"), true);
        await window(periodEnd, periodStart);
        await readinessAt(periodStart, false);
        await readinessAt(periodEnd, false);
        await window(periodStart, periodStart);
        await readinessAt(periodStart, false);
        await window(null, null);
        await readinessAt(now, true);
        const futureArrangement = first(await tx.insert(s.deliveryArrangements).values({
          sectionId: section.id, academicProviderOrganizationId: org.id,
          instructorPersonId: reviewer.id, modality: "live_online", status: "active",
          effectiveFrom: periodEnd, updatedAt: new Date("2030-02-01"),
        }).returning());
        expect((await getActiveDeliveryArrangement(section.id, tx, now))?.id).toBe(arrangement.id);
        const staleProvider = first(await tx.insert(s.organizations).values({
          type: "can_network", name: "Stale Provider", slug: `stale-provider-${suffix}`,
        }).returning());
        await tx.update(s.deliveryArrangements)
          .set({ academicProviderOrganizationId: staleProvider.id })
          .where(eq(s.deliveryArrangements.id, arrangement.id));
        expect(await getActiveDeliveryArrangement(section.id, tx, now)).toBeNull();
        await tx.update(s.deliveryArrangements)
          .set({ academicProviderOrganizationId: org.id })
          .where(eq(s.deliveryArrangements.id, arrangement.id));
        expect((await getActiveDeliveryArrangement(section.id, tx, now))?.id).toBe(arrangement.id);
        expect((await getActiveDeliveryArrangement(section.id, tx, periodEnd))?.id).toBe(futureArrangement.id);
        await tx.update(s.deliveryArrangements).set({ effectiveFrom: null, effectiveThrough: now })
          .where(eq(s.deliveryArrangements.id, futureArrangement.id));
        expect((await getActiveDeliveryArrangement(section.id, tx, now))?.id).toBe(arrangement.id);
        await tx.update(s.deliveryArrangements).set({
          effectiveThrough: null, updatedAt: arrangement.updatedAt,
        }).where(eq(s.deliveryArrangements.id, futureArrangement.id));
        await tx.update(s.deliveryArrangements).set({ updatedAt: arrangement.updatedAt })
          .where(eq(s.deliveryArrangements.id, arrangement.id));
        const tieWinner = [arrangement.id, futureArrangement.id].sort().at(-1);
        expect((await getActiveDeliveryArrangement(section.id, tx, now))?.id).toBe(tieWinner);
        expect((await getActiveDeliveryArrangement(section.id, tx, now))?.id).toBe(tieWinner);
        await tx.update(s.deliveryArrangements).set({ effectiveThrough: null, status: "completed" })
          .where(eq(s.deliveryArrangements.id, futureArrangement.id));
        expect((await getActiveDeliveryArrangement(section.id, tx, now))?.id).toBe(arrangement.id);
        await expect(getActiveDeliveryArrangement(section.id, tx, new Date("invalid")))
          .rejects.toThrow("Delivery evaluation time must be valid");
        const preserved = first(await tx.select().from(s.deliveryArrangements)
          .where(eq(s.deliveryArrangements.id, arrangement.id)));
        expect(preserved).toEqual(arrangement);
        expect(await tx.select().from(s.auditEvents).where(eq(s.auditEvents.resourceId, arrangement.id))).toHaveLength(0);
        expect(await tx.select().from(s.domainEvents).where(eq(s.domainEvents.aggregateId, arrangement.id))).toHaveLength(0);
        const definition = first(await tx.insert(s.qualificationDefinitions).values({
          key: `qualification-${suffix}`, kind: "training", title: "Synthetic training",
        }).returning());
        const document = first(await tx.insert(s.documents).values({
          subjectType: "person", subjectId: teacher.id, category: "qualification",
          fileName: "synthetic-evidence.pdf", storageProvider: "cloudflare_r2",
          storageKey: `test/qualification-${suffix}`, uploadedByPersonId: teacher.id,
        }).returning());
        const snapshot = async (at = now) => {
          const result = await evaluateSectionReadiness(section.id, tx, at);
          expect(result.ready).toBe(true); // Evidence remains advisory, not teaching authorization.
          return first(result.items.filter(item => item.key === "qualification_evidence"));
        };
        expect((await snapshot()).state).toBe("needs_review");
        const claim = first(await tx.insert(s.qualificationClaims).values({
          personId: teacher.id, definitionId: definition.id,
          issuedAt: new Date("2025-01-01"), expiresAt: new Date("2031-01-01"),
        }).returning());
        expect((await snapshot()).state).toBe("needs_review");
        await reviewQualification(teacherContext, {
          claimId: claim.id, decision: "submit", evidenceDocumentId: document.id,
        });
        expect((await snapshot()).state).toBe("needs_review");
        await expect(reviewQualification({
          ...teacherContext, capabilities: new Set(["profiles.credentials.verify"]),
        }, { claimId: claim.id, decision: "approve" })).rejects.toThrow("independent credential reviewer");
        await expect(reviewQualification({
          ...reviewerContext, scope: { organizationIds: [] },
        }, { claimId: claim.id, decision: "approve" })).rejects.toThrow("subject affiliation and reviewer scope");
        await reviewQualification(reviewerContext, { claimId: claim.id, decision: "approve" });
        expect((await snapshot()).state).toBe("ready");
        expect((await snapshot()).message).toContain("eligibility still requires policy review");
        expect((await snapshot(new Date("2031-01-01"))).state).toBe("needs_review");
        expect((await snapshot(new Date("2032-01-01"))).state).toBe("needs_review");
        await reviewQualification(reviewerContext, {
          claimId: claim.id, decision: "revoke", reason: "Issuer withdrew the certificate",
        });
        expect((await snapshot()).state).toBe("needs_review");

        const future = first(await tx.insert(s.qualificationClaims).values({
          personId: teacher.id, definitionId: definition.id, issuedAt: new Date("2030-02-01"),
        }).returning());
        await reviewQualification(teacherContext, {
          claimId: future.id, decision: "submit", evidenceDocumentId: document.id,
        });
        await reviewQualification(reviewerContext, { claimId: future.id, decision: "approve" });
        expect((await snapshot()).state).toBe("needs_review");
        expect((await snapshot(new Date("2030-02-01"))).state).toBe("ready");
        expect((await snapshot(new Date("2035-01-01"))).state).toBe("ready");
        await reviewQualification(reviewerContext, {
          claimId: future.id, decision: "revoke", reason: "Superseded evidence",
        });
        expect((await snapshot(new Date("2035-01-01"))).state).toBe("needs_review");

        const rejected = first(await tx.insert(s.qualificationClaims).values({
          personId: teacher.id, definitionId: definition.id,
        }).returning());
        await reviewQualification(teacherContext, {
          claimId: rejected.id, decision: "submit", evidenceDocumentId: document.id,
        });
        await reviewQualification(reviewerContext, {
          claimId: rejected.id, decision: "reject", reason: "Evidence does not match claim",
        });
        expect((await snapshot()).state).toBe("needs_review");
        const unrelated = first(await tx.insert(s.qualificationClaims).values({
          personId: reviewer.id, definitionId: definition.id,
        }).returning());
        await tx.insert(s.qualificationVerificationEvents).values({
          claimId: unrelated.id, sequence: 1, decision: "approve",
          actorPersonId: teacher.id, evidenceDocumentId: document.id,
        });
        expect((await snapshot()).state).toBe("needs_review");

        const events = await tx.select().from(s.qualificationVerificationEvents)
          .where(eq(s.qualificationVerificationEvents.claimId, claim.id))
          .orderBy(s.qualificationVerificationEvents.sequence);
        expect(events.map(event => event.decision)).toEqual(["submit", "approve", "revoke"]);
        const claimIds = [claim.id, future.id, rejected.id];
        const audits = await tx.select().from(s.auditEvents).where(and(
          eq(s.auditEvents.action, "qualification.verification.decided"),
          inArray(s.auditEvents.resourceId, claimIds),
        ));
        const outbox = await tx.select().from(s.domainEvents).where(and(
          eq(s.domainEvents.eventType, "QualificationVerificationDecided"),
          inArray(s.domainEvents.aggregateId, claimIds),
        ));
        expect(audits).toHaveLength(8);
        expect(outbox).toHaveLength(8);
        expect(audits.filter(audit => audit.actorPersonId === reviewer.id)).toHaveLength(5);
        const assignments = await tx.select().from(s.sectionTeachers)
          .where(eq(s.sectionTeachers.sectionId, section.id));
        expect(assignments).toHaveLength(0);
        const unsupported = first(await tx.insert(s.qualificationClaims).values({
          personId: teacher.id, definitionId: definition.id,
        }).returning());
        await tx.insert(s.qualificationVerificationEvents).values({
          claimId: unsupported.id, sequence: 1, decision: "approved",
          actorPersonId: reviewer.id, evidenceDocumentId: document.id,
        });
        await expect(snapshot()).rejects.toThrow("Unsupported credential verification decision");
        await expect(reviewQualification(teacherContext, {
          claimId: unsupported.id, decision: "submit",
        })).rejects.toThrow("Unsupported credential verification decision");
        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined;
    }
    expect(checked).toBe(true);
    const remaining = await database.execute(sql`select id from people where id = ${ownerId}::uuid`);
    expect(remaining.rows).toHaveLength(0);
  }, 60_000);
});
