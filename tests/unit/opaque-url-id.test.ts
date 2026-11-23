import { describe, expect, it } from "vitest";
import {
  decodeUuidPathParam, encodeUuidForPath, opaqueUuidPathParam, shortUuidHref,
} from "@/domain/opaque-url-id";

const cases = [
  ["00000000-0000-0000-0000-000000000000", "AAAAAAAAAAAAAAAAAAAAAA"],
  ["ffffffff-ffff-ffff-ffff-ffffffffffff", "_____________________w"],
  ["550e8400-e29b-41d4-a716-446655440000", "VQ6EAOKbQdSnFkRmVUQAAA"],
  ["6f3c2a81-91b4-47e6-a8c2-5b29d0137f64", "bzwqgZG0R-aowlsp0BN_ZA"],
] as const;

describe("canonical UUID URL encoding", () => {
  it.each(cases)("round trips %s to its 22-character URL representation", (uuid, token) => {
    expect(encodeUuidForPath(uuid)).toBe(token);
    expect(token).toHaveLength(22);
    expect(decodeUuidPathParam(token)).toBe(uuid);
    expect(decodeUuidPathParam(uuid)).toBe(uuid);
  });

  it("supports existing case-insensitive UUID bookmarks", () => {
    expect(decodeUuidPathParam(cases[2][0].toUpperCase())).toBe(cases[2][0]);
  });

  it.each([
    "", "hello", "bzwqgZG0R-aowlsp0BN_Z",
    "bzwqgZG0R-aowlsp0BN_ZAA", // extra byte/non-canonical length
    "AAAAAAAAAAAAAAAAAAAAAB", // nonzero unused padding bits
    "_____________________x", // nonzero unused padding bits
    "../../admin", "<script>", "AAAAAAAAAAAAAAAAAAAAA=",
    "00000000000000000000000000000000", "any-valid-slug",
  ])("rejects malformed compact ID %s", value => {
    expect(decodeUuidPathParam(value)).toBeNull();
  });

  it("preserves full canonical UUID values within TanStack loaders", () => {
    const codec = opaqueUuidPathParam("classId");
    const [uuid, token] = cases[3];
    expect(codec.parse({ classId: token })).toEqual({ classId: uuid });
    expect(codec.parse({ classId: uuid })).toEqual({ classId: uuid });
    expect(codec.stringify({ classId: uuid })).toEqual({ classId: token });
    expect(codec.parse({ classId: "untrusted" })).toBe(false);
    expect(shortUuidHref("/class/", uuid)).toBe("/class/" + token);
  });

  it("rejects invalid outbound UUIDs rather than fabricating a stable link", () => {
    expect(() => encodeUuidForPath("invalid")).toThrow("Expected canonical UUID");
  });
});
