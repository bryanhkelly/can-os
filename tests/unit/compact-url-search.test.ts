import { describe, expect, it } from "vitest";
import { parseSearchWith, stringifySearchWith } from "@tanstack/react-router";
import { compactUuidSearchSelections, expandUuidSearchSelections } from "@/domain/compact-url-search";
import { encodeUuidForPath } from "@/domain/opaque-url-id";

const uuid = "6f3c2a81-91b4-47e6-a8c2-5b29d0137f64";
const token = encodeUuidForPath(uuid);

describe("compact router search selections", () => {
  it("round trips selected UUIDs and preserves unrelated structured search data", () => {
    const search = {
      siteId: uuid, classId: uuid, section: uuid,
      view: "manage", step: 2, page: "/about",
      token: uuid, code: uuid, returnTo: "/launch/site?siteId=" + uuid,
      filters: { siteId: uuid }, array: [uuid],
    };
    const encoded = compactUuidSearchSelections(search);
    expect(encoded.siteId).toBe(token);
    expect(encoded.classId).toBe(token);
    expect(encoded.section).toBe(token);
    expect(encoded.view).toBe(search.view);
    expect(encoded.filters).toEqual(search.filters);
    expect(encoded.token).toBe(uuid);
    expect(encoded.code).toBe(uuid);
    expect(encoded.returnTo).toBe(search.returnTo);
    expect(expandUuidSearchSelections(encoded)).toEqual(search);
  });

  it("round trips deep links from notifications, referrals and collaboration", () => {
    const selections = {
      thread:uuid, case:uuid, submission:uuid, gradeAction:uuid,
      attendance:uuid, trip:uuid, referral:uuid, offer:uuid, person:uuid,
    };
    const encoded = compactUuidSearchSelections(selections);
    expect(Object.values(encoded)).toEqual(Array(9).fill(token));
    expect(expandUuidSearchSelections(encoded)).toEqual(selections);
  });

  it("accepts old UUID query links and never mutates malformed identifiers", () => {
    expect(expandUuidSearchSelections({siteId:uuid})).toEqual({siteId:uuid});
    expect(expandUuidSearchSelections({siteId:"not-an-id",session:"abc"}))
      .toEqual({siteId:"not-an-id",session:"abc"});
    expect(compactUuidSearchSelections({siteId:"not-an-id"})).toEqual({siteId:"not-an-id"});
  });

  it("uses the application's actual TanStack JSON query semantics", () => {
    const parse = parseSearchWith(JSON.parse);
    const stringify = stringifySearchWith(JSON.stringify);
    const initial = {siteId:uuid,programId:uuid,view:"manage",count:3,token:"leave-me"};
    const href = stringify(compactUuidSearchSelections(initial));
    expect(href).toContain("siteId=" + token);
    expect(href).not.toContain(uuid);
    const decoded = expandUuidSearchSelections(parse(href));
    expect(decoded).toEqual(initial);
  });

  it("does not allow a compact URL selector to become a new access grant", () => {
    // No helper resolves tenants or people. Domain services still authorize UUIDs.
    expect(expandUuidSearchSelections({ siteId: token })).toEqual({ siteId: uuid });
  });
});
