import { describe, expect, it } from "vitest";
import {
  blueprintDatabaseRole,
  blueprintReadDatabaseRole,
} from "@/domain/blueprint-database-role";
import type { CommandContext } from "@/domain/command-context";

const orgId = "11110000-0000-4000-8000-000000000001";
const scope = { organizationIds: [orgId] };

function context(capabilities: string[], organizationIds = [orgId]): CommandContext {
  return {
    actorPersonId: "44440000-0000-4000-8000-000000000001",
    capabilities: new Set(capabilities),
    scope: { organizationIds },
  };
}

describe("native canonical Blueprint SQL role selection", () => {
  it("selects a deterministic, Organization-bound author role", () => {
    expect(blueprintDatabaseRole(context(["blueprint.configure"]), "blueprint_author"))
      .toBe("can_v30_blueprint_author_11110000000040008000000000000001");
  });

  it("separates reviewers from authors", () => {
    const reviewer = context(["blueprint.read", "blueprint.review"]);
    expect(blueprintReadDatabaseRole(reviewer))
      .toBe("can_v30_blueprint_reviewer_11110000000040008000000000000001");
    expect(() => blueprintDatabaseRole(reviewer, "blueprint_author")).toThrow();
    expect(() => blueprintDatabaseRole(context(["blueprint.configure"]), "blueprint_reviewer"))
      .toThrow();
  });

  it("rejects missing, mixed or untrusted Organization scope", () => {
    for (const ids of [[], [orgId, "22220000-0000-4000-8000-000000000001"], ["untrusted"]]) {
      expect(() => blueprintDatabaseRole(
        context(["blueprint.configure"], ids), "blueprint_author"
      )).toThrow();
    }
  });

  it("uses the author role for Site-admin read access without review capability", () => {
    expect(blueprintReadDatabaseRole(context(["blueprint.read", "blueprint.configure"])))
      .toBe("can_v30_blueprint_author_11110000000040008000000000000001");
  });
});
