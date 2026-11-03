import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { AccessContext } from "@/domain/access-context";
import { EventTypes } from "@/domain/event-types";

/**
 * This is a REAL Neon/Postgres contention test, not a mocked transaction.
 * It writes synthetic records and must only run against a disposable database.
 * Production or ordinary CI runs skip it rather than using live credentials.
 */
const enabled = process.env.DATABASE_URL &&
  process.env.CAN_TEST_DB_WRITES_ENABLED === "true" &&
  process.env.APP_ENV === "test" && process.env.NODE_ENV === "test";
const integration = enabled ? describe : describe.skip;

async function fixture() {
  const [{ db }, schema, review, sources] = await Promise.all([
    import("@/db/client"),
    import("@/db/schema"),
    import("@/modules/sites/church-content-suggestions.server"),
    import("@/modules/sites/church-source-references.server"),
  ]);
  const suffix = crypto.randomUUID().slice(0, 10);
  const [org] = await db.insert(schema.organizations).values({
    type: "church", name: `Synthetic Church ${suffix}`, slug: `p-church-${suffix}`,
  }).returning();
  const [site] = await db.insert(schema.sites).values({
    organizationId: org.id, name: "Source review synthetic campus",
    slug: `p-campus-${suffix}`, metadata: { synthetic: true },
  }).returning();
  const [person] = await db.insert(schema.people).values({
    legalFirstName: "Synthetic", legalLastName: `Editor-${suffix}`,
  }).returning();
  await db.insert(schema.memberships).values({
    personId: person.id, organizationId: org.id,
  });
  await db.insert(schema.roleAssignments).values({
    personId: person.id, organizationId: org.id, siteId: site.id,
    roleKey: "site_website_editor",
    capabilities: ["site.website.draft.read", "site.website.local.publish"],
  });
  await db.insert(schema.sitePublications).values({
    siteId: site.id, slug: `p-school-${suffix}`, status: "draft",
  });
  const actor: AccessContext = {
    actorPersonId: person.id, grantSiteId: site.id,
    accountId: crypto.randomUUID(), grantId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(), role: "site_website_editor",
    capabilities: new Set(["site.website.draft.read", "site.website.local.publish"]),
    scope: { organizationIds: [org.id], siteIds: [site.id] },
  };
  const url = `https://p-${suffix}.church.org`;
  await sources.saveChurchSourceReference(actor, {
    kind: "website", url, authorizedToSubmit: true,
  });
  const [reference] = await db.select().from(schema.churchSourceReferences)
    .where(eq(schema.churchSourceReferences.siteId, site.id));
  async function propose(text = "Our church welcomes neighbors and serves our community.") {
    return review.submitChurchSourceExcerpt(actor, {
      sourceReferenceId: reference.id, field: "church_history",
      sourcePageUrl: `${url}/about`, text,
    });
  }
  async function versions() {
    return db.select().from(schema.siteLocalContentVersions)
      .where(eq(schema.siteLocalContentVersions.siteId, site.id));
  }
  return { db, schema, actor, org, site, reference, url, review, sources, propose, versions };
}

integration("church source review real transaction races", () => {
  it("serializes concurrent accept/accept to one canonical revision, audit and event", async () => {
    const f = await fixture();
    const p = await f.propose();
    const input = { suggestionId: p.id, decision: "accepted" as const,
      expectedRevision: 0, rightsConfirmed: true };
    const outcomes = await Promise.allSettled([
      f.review.reviewChurchSourceExcerpt(f.actor, input),
      f.review.reviewChurchSourceExcerpt(f.actor, input),
    ]);
    expect(outcomes.filter(x => x.status === "fulfilled")).toHaveLength(2);
    expect((await f.versions())).toHaveLength(1);
    const [proposal] = await f.db.select().from(f.schema.churchContentSuggestions)
      .where(eq(f.schema.churchContentSuggestions.id, p.id));
    expect(proposal.reviewDecision).toBe("accepted");
    const events = await f.db.select().from(f.schema.domainEvents)
      .where(eq(f.schema.domainEvents.aggregateId, p.id));
    expect(events.filter(x => x.eventType === EventTypes.ChurchContentSuggestionReviewed)).toHaveLength(1);
    const audit = await f.db.select().from(f.schema.auditEvents)
      .where(eq(f.schema.auditEvents.resourceId, p.id));
    expect(audit.filter(x => x.action === "site.website.source_excerpt.reviewed")).toHaveLength(1);
  });

  it("revoked-before-accept cannot publish and rejected requests do not change proposal", async () => {
    const f = await fixture();
    const p = await f.propose();
    await f.sources.removeChurchSourceReference(f.actor, { kind: "website" });
    await expect(f.review.reviewChurchSourceExcerpt(f.actor, {
      suggestionId: p.id, decision: "accepted", expectedRevision: 0, rightsConfirmed: true,
    })).rejects.toThrow(/removed|changed/);
    expect(await f.versions()).toHaveLength(0);
    const [stored] = await f.db.select().from(f.schema.churchContentSuggestions)
      .where(eq(f.schema.churchContentSuggestions.id, p.id));
    expect(stored.reviewDecision).toBe("discarded");
  });

  it("concurrent revoke/accept has only an ordered, consistent committed outcome", async () => {
    const f = await fixture();
    const p = await f.propose();
    const outcomes = await Promise.allSettled([
      f.sources.removeChurchSourceReference(f.actor, { kind: "website" }),
      f.review.reviewChurchSourceExcerpt(f.actor, {
        suggestionId: p.id, decision: "accepted", expectedRevision: 0, rightsConfirmed: true,
      }),
    ]);
    expect(outcomes[0]?.status).toBe("fulfilled");
    const [proposal] = await f.db.select().from(f.schema.churchContentSuggestions)
      .where(eq(f.schema.churchContentSuggestions.id, p.id));
    const versions = await f.versions();
    // Revoke can win first: no publication. Or accept wins first: one
    // reviewed publication and a follow-on provenance review action.
    if (proposal.reviewDecision === "accepted") {
      expect(versions).toHaveLength(1);
      const [flag] = await f.db.select().from(f.schema.actions)
        .where(and(eq(f.schema.actions.subjectId, f.reference.id),
          eq(f.schema.actions.type, "site_website_source_provenance_review")));
      expect(flag).toBeDefined();
    } else {
      expect(proposal.reviewDecision).toBe("discarded");
      expect(versions).toHaveLength(0);
    }
    const events = await f.db.select().from(f.schema.domainEvents)
      .where(eq(f.schema.domainEvents.aggregateId, p.id));
    expect(events.filter(e => e.eventType === EventTypes.ChurchContentSuggestionReviewed).length)
      .toBe(versions.length);
  });

  it("replays the committed revision receipt without a second review audit or publication", async () => {
    const f = await fixture();
    const p = await f.propose("Our church welcomed neighbors for decades and serves families locally.");
    const input = { suggestionId: p.id, decision: "accepted" as const,
      expectedRevision: 0, rightsConfirmed: true };
    const first = await f.review.reviewChurchSourceExcerpt(f.actor, input);
    expect(first.publication?.revision).toBe(1);
    const replay = await f.review.reviewChurchSourceExcerpt(f.actor, input);
    expect(replay.alreadyReviewed).toBe(true);
    expect(replay.publication?.revision).toBe(1);
    expect(await f.versions()).toHaveLength(1);
    const audit = await f.db.select().from(f.schema.auditEvents)
      .where(eq(f.schema.auditEvents.resourceId, p.id));
    expect(audit.filter(x => x.action === "site.website.source_excerpt.reviewed")).toHaveLength(1);
    const capture = audit.find(x => x.action === "site.website.source_excerpt.submitted");
    expect(capture?.after?.origin).toBe("manual_summary");
    expect(capture?.after?.sourceUrlAtCapture).toBe(`${f.url}/`);
    expect(typeof capture?.after?.excerptDigest).toBe("string");
    expect(audit.find(x => x.action === "site.website.source_excerpt.reviewed")
      ?.after?.publicationRevision).toBe(1);
  });

  it("rejects a source URL silently replaced within the same origin", async () => {
    const f = await fixture();
    const p = await f.propose();
    // Mimic a migration or a competing writer that did not use the canonical
    // reference-save command. The immutable capture audit must still detect it.
    await f.db.update(f.schema.churchSourceReferences).set({
      normalizedUrl: `${f.url}/new-campus`,
    }).where(eq(f.schema.churchSourceReferences.id, f.reference.id));
    await expect(f.review.reviewChurchSourceExcerpt(f.actor, {
      suggestionId: p.id, decision: "accepted", expectedRevision: 0, rightsConfirmed: true,
    })).rejects.toThrow(/source changed|source changed or the proposed page is invalid/i);
    expect(await f.versions()).toHaveLength(0);
    const [proposal] = await f.db.select().from(f.schema.churchContentSuggestions)
      .where(eq(f.schema.churchContentSuggestions.id, p.id));
    expect(proposal.reviewDecision).toBe("pending");
  });

  it("preserves already-reviewed copy on source revocation and flags a provenance check", async () => {
    const f = await fixture();
    const p = await f.propose();
    await f.review.reviewChurchSourceExcerpt(f.actor, {
      suggestionId: p.id, decision: "accepted", expectedRevision: 0, rightsConfirmed: true,
    });
    await f.sources.removeChurchSourceReference(f.actor, { kind: "website" });
    expect(await f.versions()).toHaveLength(1);
    const flags = await f.db.select().from(f.schema.actions).where(and(
      eq(f.schema.actions.subjectId, f.reference.id),
      eq(f.schema.actions.type, "site_website_source_provenance_review"),
    ));
    expect(flags).toHaveLength(1);
  });

  it("returns the committed receipt after source withdrawal without a second publication", async () => {
    const f = await fixture();
    const p = await f.propose();
    const input = {
      suggestionId: p.id, decision: "accepted" as const,
      expectedRevision: 0, rightsConfirmed: true,
    };
    const first = await f.review.reviewChurchSourceExcerpt(f.actor, input);
    expect(first.publication?.revision).toBe(1);
    await f.sources.removeChurchSourceReference(f.actor, { kind: "website" });
    const replay = await f.review.reviewChurchSourceExcerpt(f.actor, input);
    expect(replay.alreadyReviewed).toBe(true);
    expect(replay.publication?.revision).toBe(1);
    expect(await f.versions()).toHaveLength(1);
    const events = await f.db.select().from(f.schema.domainEvents)
      .where(eq(f.schema.domainEvents.aggregateId, p.id));
    expect(events.filter(x => x.eventType === EventTypes.ChurchContentSuggestionReviewed)).toHaveLength(1);
  });

  it("coalesces repeated source withdrawal into one open provenance review task", async () => {
    const f = await fixture();
    const p = await f.propose();
    await f.review.reviewChurchSourceExcerpt(f.actor, {
      suggestionId: p.id, decision: "accepted", expectedRevision: 0, rightsConfirmed: true,
    });
    await f.sources.saveChurchSourceReference(f.actor, {
      kind: "website", url: `${f.url}/another-campus`, authorizedToSubmit: true,
    });
    await f.sources.removeChurchSourceReference(f.actor, { kind: "website" });
    const flags = await f.db.select().from(f.schema.actions).where(and(
      eq(f.schema.actions.subjectId, f.reference.id),
      eq(f.schema.actions.type, "site_website_source_provenance_review"),
      eq(f.schema.actions.status, "open"),
    ));
    expect(flags).toHaveLength(1);
    expect(flags[0]?.metadata?.reviewedSuggestionId).toBe(p.id);
    expect(await f.versions()).toHaveLength(1);
  });

  it("rejects source-derived admissions promises before suggestion persistence", async () => {
    const f = await fixture();
    await expect(f.propose("Our school is enrolling students and accepting applications."))
      .rejects.toThrow(/admissions|school/);
    const rows = await f.db.select().from(f.schema.churchContentSuggestions)
      .where(eq(f.schema.churchContentSuggestions.siteId, f.site.id));
    expect(rows).toHaveLength(0);
    expect(await f.versions()).toHaveLength(0);
  });

  it("rejects missing rights, stale revisions, unauthorized sites and unsafe content with no partial publish", async () => {
    const f = await fixture();
    const p = await f.propose();
    const base = { suggestionId: p.id, decision: "accepted" as const,
      expectedRevision: 0, rightsConfirmed: true };
    await expect(f.review.reviewChurchSourceExcerpt(f.actor, {
      ...base, rightsConfirmed: false,
    })).rejects.toThrow(/rights/);
    await expect(f.review.reviewChurchSourceExcerpt(f.actor, {
      ...base, expectedRevision: 999,
    })).rejects.toThrow(/updated|changed/);
    await expect(f.review.reviewChurchSourceExcerpt({
      ...f.actor, grantSiteId: crypto.randomUUID(),
    }, base)).rejects.toThrow();
    await expect(f.review.reviewChurchSourceExcerpt(f.actor, {
      ...base, decision: "edited", editedText: "<script>alert('unsafe')</script>",
    })).rejects.toThrow();
    const [proposal] = await f.db.select().from(f.schema.churchContentSuggestions)
      .where(eq(f.schema.churchContentSuggestions.id, p.id));
    expect(proposal.reviewDecision).toBe("pending");
    expect(await f.versions()).toHaveLength(0);
  });
});
