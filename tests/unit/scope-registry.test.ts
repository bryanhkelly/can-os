import { describe, expect, it } from "vitest";
import * as ops from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as s from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";
import {
  hasReadScope,
  readScope,
  registerReadScope,
  type ReadScopeHelpers,
} from "@/platform/scope";
import "@/modules/operations/insights.scope";

const dialect = new PgDialect();

function toQuery(fragment: SQL | undefined) {
  if (!fragment) throw new Error("expected a WHERE fragment");
  return dialect.sqlToQuery(fragment);
}

type SelectCapture = {
  columns: unknown;
  joinCondition: unknown;
  whereCondition: unknown;
};

/** Stubs the db.select().from().innerJoin().where() chain used by teacherSectionIds. */
function makeFakeServer(sectionRows: Array<{ sectionId: string }>) {
  const capture: SelectCapture = { columns: undefined, joinCondition: undefined, whereCondition: undefined };
  const db = {
    select(columns: unknown) {
      capture.columns = columns;
      return {
        from() {
          return {
            innerJoin(_table: unknown, condition: unknown) {
              capture.joinCondition = condition;
              return {
                where(condition: unknown) {
                  capture.whereCondition = condition;
                  return Promise.resolve(sectionRows);
                },
              };
            },
          };
        },
      };
    },
  };
  const helpers = { db, s, ops } as unknown as ReadScopeHelpers;
  return { helpers, capture };
}

function makeContext(
  role: string,
  scope: { siteIds?: string[]; organizationIds?: string[] } = {},
): AccessContext {
  return {
    accountId: "acct-1",
    sessionId: "sess-1",
    grantId: "grant-1",
    actorPersonId: "person-1",
    role,
    capabilities: new Set(),
    scope,
  };
}

describe("read-scope registry", () => {
  it("throws for an unregistered resource", async () => {
    const { helpers } = makeFakeServer([]);
    expect(hasReadScope("nonexistent-resource")).toBe(false);
    await expect(readScope("nonexistent-resource", makeContext("teacher"), helpers))
      .rejects.toThrow(/No read scope registered/);
  });

  it("resolves a registered resource through its resolver", async () => {
    registerReadScope("test-resource", () => ops.sql`true`);
    expect(hasReadScope("test-resource")).toBe(true);
    const { helpers } = makeFakeServer([]);
    const fragment = await readScope("test-resource", makeContext("teacher"), helpers);
    expect(toQuery(fragment)).toEqual(toQuery(ops.sql`true`));
  });
});

describe("insights read scope", () => {
  it("teacher sees only insights for sections they teach within their sites", async () => {
    const { helpers, capture } = makeFakeServer([
      { sectionId: "sec-1" },
      { sectionId: "sec-2" },
      { sectionId: "sec-1" },
    ]);
    const ctx = makeContext("teacher", { siteIds: ["site-1"], organizationIds: ["org-1"] });
    const fragment = await readScope("insights", ctx, helpers);

    // Section ids are deduplicated before building the fragment.
    expect(toQuery(fragment)).toEqual(
      toQuery(ops.inArray(s.insights.sectionId, ["sec-1", "sec-2"])),
    );

    // The lookup filters sections to the actor's sites and the actor's person id.
    expect(toQuery(capture.joinCondition as SQL)).toEqual(
      toQuery(ops.and(
        ops.eq(s.sections.id, s.sectionTeachers.sectionId),
        ops.inArray(s.sections.siteId, ["site-1"]),
      ) as SQL),
    );
    expect(toQuery(capture.whereCondition as SQL)).toEqual(
      toQuery(ops.eq(s.sectionTeachers.personId, "person-1")),
    );
  });

  it("teacher with no sections gets an always-false fragment", async () => {
    const { helpers } = makeFakeServer([]);
    const fragment = await readScope("insights", makeContext("teacher", { siteIds: ["site-1"] }), helpers);
    expect(toQuery(fragment)).toEqual(toQuery(ops.sql`false`));
    expect(toQuery(fragment).sql).toBe("false");
  });

  it("specialist sees section-scoped insights at their sites", async () => {
    const { helpers } = makeFakeServer([]);
    const ctx = makeContext("specialist", { siteIds: ["site-1", "site-2"] });
    const fragment = await readScope("insights", ctx, helpers);
    expect(toQuery(fragment)).toEqual(
      toQuery(ops.and(
        ops.isNotNull(s.insights.sectionId),
        ops.inArray(s.sections.siteId, ["site-1", "site-2"]),
      ) as SQL),
    );
  });

  it("specialist with no sites gets an always-false fragment", async () => {
    const { helpers } = makeFakeServer([]);
    const fragment = await readScope("insights", makeContext("specialist"), helpers);
    expect(toQuery(fragment).sql).toBe("false");
  });

  it("registrar additionally sees site-wide and org-wide insights", async () => {
    const { helpers } = makeFakeServer([]);
    const ctx = makeContext("registrar", { siteIds: ["site-1"], organizationIds: ["org-1"] });
    const fragment = await readScope("insights", ctx, helpers);
    expect(toQuery(fragment)).toEqual(
      toQuery(ops.or(
        ops.and(ops.isNotNull(s.insights.sectionId), ops.inArray(s.sections.siteId, ["site-1"])),
        ops.and(ops.isNull(s.insights.sectionId), ops.or(
          ops.inArray(s.insights.siteId, ["site-1"]),
          ops.inArray(s.insights.organizationId, ["org-1"]),
        )),
      ) as SQL),
    );
  });

  it("registrar without organization scope sees only site-wide extras", async () => {
    const { helpers } = makeFakeServer([]);
    const ctx = makeContext("registrar", { siteIds: ["site-1"] });
    const fragment = await readScope("insights", ctx, helpers);
    expect(toQuery(fragment)).toEqual(
      toQuery(ops.or(
        ops.and(ops.isNotNull(s.insights.sectionId), ops.inArray(s.sections.siteId, ["site-1"])),
        ops.and(ops.isNull(s.insights.sectionId), ops.or(
          ops.inArray(s.insights.siteId, ["site-1"]),
        )),
      ) as SQL),
    );
  });

  it("registrar with no sites gets an always-false fragment", async () => {
    const { helpers } = makeFakeServer([]);
    const fragment = await readScope(
      "insights",
      makeContext("registrar", { organizationIds: ["org-1"] }),
      helpers,
    );
    expect(toQuery(fragment).sql).toBe("false");
  });

  it.each(["student", "guardian", "unknown-role"])(
    "role %s has no insights access",
    async (role) => {
      const { helpers } = makeFakeServer([]);
      await expect(
        readScope("insights", makeContext(role, { siteIds: ["site-1"] }), helpers),
      ).rejects.toThrow(AuthorizationError);
    },
  );
});
