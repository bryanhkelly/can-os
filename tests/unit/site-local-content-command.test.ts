import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions, siteLocalContentVersions } from "@/db/schema";
import { emptySiteLocalContent, type SiteLocalContent } from "@/domain/site-local-content";
import type { AccessContext } from "@/domain/access-context";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  inserts: [] as Array<{ table: unknown; value: any }>,
  denied: false,
  audit: vi.fn(),
  emit: vi.fn(),
  publishSite:vi.fn(),
}));
vi.mock("@/modules/sites/site-publication.server",()=>({changeSitePublicationWithinTransaction:state.publishSite}));
vi.mock("@/platform/mutation", () => ({ writeAudit: state.audit, emitEvent: state.emit }));
vi.mock("@/modules/sites/site-website-authorization.server", () => ({
  requirePartnerWebsiteEditor: vi.fn(async () => {
    if (state.denied) throw new Error("cross-site website publisher denied");
    return { id: "site-a", organizationId: "org-a", name: "Site", organizationName: "Church", canPublish: true };
  }),
}));

const tx = {
  select: vi.fn(() => {
    const rows = state.rows.shift() ?? [];
    const query: any = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      orderBy: () => query,
      for: () => query,
      limit: async () => rows,
    };
    return query;
  }),
  insert: vi.fn((table: unknown) => ({ values: (value: unknown) => {
    state.inserts.push({ table, value });
    const result = {
      returning: async () => [{ id: "revision-1" }],
      then: (resolve: (value: unknown) => unknown) => resolve(undefined),
    };
    return result;
  } })),
};
vi.mock("@/db/client", () => ({ db: { transaction: async (callback: (executor: unknown) => Promise<unknown>) => callback(tx) } }));

import { publishPartnerLocalContent } from "@/modules/sites/site-local-content.server";

const actor = {
  accountId: "account-a", sessionId: "session-a", grantId: "grant-a", grantSiteId: "site-a",
  actorPersonId: "person-a", role: "site_website_editor",
  capabilities: new Set(["site.website.draft.read", "site.website.local.publish"]),
  scope: { organizationIds: ["org-a"], siteIds: ["site-a"] },
} satisfies AccessContext;
const copy: SiteLocalContent = {
  ...emptySiteLocalContent,
  welcomeMessage: "Welcome to our church community",
  statementOfFaith: "We affirm our historic creed and practice weekly prayer.",
};
const revision = (number: number, content = copy, status = "published") => ({
  id: `revision-${number}`, siteId: "site-a", revision: number, content, status,
  flaggedFields: [], createdByPersonId: "person-a", restoredFromRevision: null,
  createdAt: new Date("2026-10-28T00:00:00Z"),
});

beforeEach(() => {
  state.rows = []; state.inserts = []; state.denied = false;
  state.audit.mockReset(); state.emit.mockReset(); state.publishSite.mockReset(); tx.select.mockClear(); tx.insert.mockClear();
});

describe("transactional church-local publication", () => {
  it("publishes routine theological content without creating a CAN approval action", async () => {
    state.rows.push([{ siteId: "site-a" }], []);
    await expect(publishPartnerLocalContent(actor, { operation: "save", expectedRevision: 0, content: copy }))
      .resolves.toMatchObject({ changed: true, revision: 1, status: "published" });
    expect(state.inserts.find(row => row.table === siteLocalContentVersions)?.value).toMatchObject({
      siteId: "site-a", revision: 1, status: "published", createdByPersonId: "person-a",
    });
    expect(state.inserts.some(row => row.table === actions)).toBe(false);
    expect(state.audit).toHaveBeenCalledOnce();
    expect(state.emit).toHaveBeenCalledOnce();
  });

  it("pins the original suggested text across later edits and rejects resetting its stored baseline", async () => {
    const baseline = {
      version: 1 as const,
      fields: {
        heroHeadline: "A place to belong. A future to build.",
        welcomeMessage: "Purposeful learning and connection.",
        localDescription: "School-specific original story",
        schoolVision: "A community of curiosity.",
        communityOutreach: "Hope to serve our neighbors.",
      },
    };
    const prior = { ...copy, editorialBaseline: baseline };
    state.rows.push([{ siteId: "site-a" }], [revision(2, prior)]);
    const alteredBaseline = { ...baseline, fields: {
      ...baseline.fields, heroHeadline: "An altered original",
    } };
    await expect(publishPartnerLocalContent(actor, {
      operation: "draft", expectedRevision: 2,
      content: { ...prior, welcomeMessage: "My newly customized words",
        editorialBaseline: alteredBaseline },
    })).rejects.toThrow(/original website copy cannot be replaced/);
    expect(state.inserts).toHaveLength(0);
    expect(state.audit).not.toHaveBeenCalled();
  });

  it("saves private design drafts without publishing or issuing a CAN approval Action", async () => {
    const proposal = { ...copy, localDescription: "A private proposal for a fully accredited school.",
      branding: { ...copy.branding, templateId: "summit" as const } };
    state.rows.push([{ siteId: "site-a" }], [revision(4)]);
    await expect(publishPartnerLocalContent(actor, {
      operation: "draft", expectedRevision: 4, content: proposal,
    })).resolves.toMatchObject({ changed: true, revision: 5, status: "draft", flaggedFields: [] });
    expect(state.inserts.find(row => row.table === siteLocalContentVersions)?.value)
      .toMatchObject({ status: "draft", revision: 5, content: proposal });
    expect(state.inserts.some(row => row.table === actions)).toBe(false);
    expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.anything(),
      expect.objectContaining({ action: "site.website.local_content.draft_saved" }));
    expect(state.emit).toHaveBeenCalledOnce();
  });

  it("saves unfinished private artwork but refuses to publish it", async () => {
    const unfinished = { ...copy, branding: { ...copy.branding, heroImage: {
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/9sZcAAAAASUVORK5CYII=",
      altText: "", rightsConfirmed: false, childImageConsent: "unconfirmed" as const,
    } } };
    state.rows.push([{ siteId: "site-a" }], []);
    await expect(publishPartnerLocalContent(actor, {
      operation: "draft", expectedRevision: 0, content: unfinished,
    })).resolves.toMatchObject({ status: "draft", revision: 1 });
    expect(state.inserts.find(row => row.table === siteLocalContentVersions)?.value)
      .toMatchObject({ status: "draft", content: unfinished });

    state.inserts = [];
    state.rows.push([{ siteId: "site-a" }], [revision(1, unfinished, "draft")]);
    await expect(publishPartnerLocalContent(actor, {
      operation: "save", expectedRevision: 1, content: unfinished,
    })).rejects.toThrow(/Describe the website artwork/);
    expect(state.inserts).toHaveLength(0);
  });

  it("rechecks protected claims on publishing a previously private draft", async () => {
    const proposal = { ...copy, localDescription: "We are fully accredited.",
      branding: { ...copy.branding, templateId: "modern" as const } };
    state.rows.push([{ siteId: "site-a" }], [revision(5, proposal, "draft")]);
    await expect(publishPartnerLocalContent(actor, {
      operation: "save", expectedRevision: 5, content: proposal,
    })).resolves.toMatchObject({ revision: 6, status: "review_required" });
    expect(state.inserts.find(row => row.table === actions)).toBeTruthy();
  });

  it("holds only protected copy and preserves the prior published revision", async () => {
    const held = { ...copy, localDescription: "Our school is fully accredited." };
    state.rows.push([{ siteId: "site-a" }], [revision(4)]);
    await expect(publishPartnerLocalContent(actor, { operation: "save", expectedRevision: 4, content: held }))
      .resolves.toMatchObject({ changed: true, revision: 5, status: "review_required" });
    expect(state.inserts.find(row => row.table === actions)?.value).toMatchObject({
      subjectId: "revision-1", siteId: "site-a", organizationId: "org-a", status: "open",
    });
    expect(state.inserts.find(row => row.table === siteLocalContentVersions)?.value).toMatchObject({
      revision: 5, status: "review_required",
    });
  });

  it("rejects stale writes and unrelated Site actors before inserting content", async () => {
    state.rows.push([{ siteId: "site-a" }], [revision(2)]);
    await expect(publishPartnerLocalContent(actor, { operation: "save", expectedRevision: 1, content: copy }))
      .rejects.toThrow(/updated/);
    expect(state.inserts).toEqual([]);

    state.denied = true;
    await expect(publishPartnerLocalContent(actor, { operation: "save", expectedRevision: 0, content: copy }))
      .rejects.toThrow(/cross-site/);
    expect(state.inserts).toEqual([]);
  });

  it("restores an older published snapshot as a new attributed revision", async () => {
    const oldCopy = { ...copy, welcomeMessage: "Earlier welcome" };
    state.rows.push([{ siteId: "site-a" }], [revision(3)], [{ content: oldCopy }]);
    await expect(publishPartnerLocalContent(actor, { operation: "restore", expectedRevision: 3, restoreRevision: 1 }))
      .resolves.toMatchObject({ changed: true, revision: 4, status: "published" });
    expect(state.inserts.find(row => row.table === siteLocalContentVersions)?.value).toMatchObject({
      revision: 4, restoredFromRevision: 1, content: oldCopy,
    });
  });

  it("returns an idempotent no-op for identical current content", async () => {
    state.rows.push([{ siteId: "site-a" }], [revision(2)]);
    await expect(publishPartnerLocalContent(actor, { operation: "save", expectedRevision: 2, content: copy }))
      .resolves.toEqual({ changed: false, revision: 2, status: "published", flaggedFields: [] });
    expect(state.inserts).toEqual([]);
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.emit).not.toHaveBeenCalled();
  });
});


describe("Site Administrator publication through the canonical Site publisher",()=>{
  it("publishes the school shell in the same transaction as reviewed local content",async()=>{
    const updatedAt=new Date("2026-11-06T00:00:00Z");
    state.rows.push([{siteId:"site-a",updatedAt}],[]);
    await publishPartnerLocalContent({...actor,role:"site_admin"},{operation:"save",expectedRevision:0,content:copy});
    expect(state.publishSite).toHaveBeenCalledWith(expect.objectContaining({role:"site_admin"}),expect.objectContaining({siteId:"site-a",action:"publish",expectedRevision:updatedAt.toISOString(),contentReviewed:true}),tx);
  });
  it("does not publish a private draft or a revision requiring institutional review",async()=>{
    for(const operation of ["draft","save"] as const){
      state.rows.push([{siteId:"site-a",updatedAt:new Date()}],[]);
      await publishPartnerLocalContent({...actor,role:"site_admin"},{operation,expectedRevision:0,content:{...copy,welcomeMessage:"We are fully accredited."}});
    }
    expect(state.publishSite).not.toHaveBeenCalled();
  });
});
