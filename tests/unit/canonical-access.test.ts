import { describe, expect, it } from "vitest";
import {
  canonicalSessionCookie,
  canonicalSessionRowSchema,
  projectCanonicalCommandContext,
} from "@/domain/canonical-access";

const session = {
  account_id: "55550000-0000-4000-8000-000000000001",
  session_id: "88880000-0000-4000-8000-000000000001",
  grant_id: "66660000-0000-4000-8000-000000000001",
  person_id: "44440000-0000-4000-8000-000000000001",
  role_code: "site_admin" as const,
  organization_id: "11110000-0000-4000-8000-000000000001",
  site_id: "22220000-0000-4000-8000-000000000001",
};

describe("net-new CAN OS v3.0.1 identity", () => {
  it("is not a public-schema session or credential", () => {
    expect(canonicalSessionCookie).toBe("__Host-can_os_v3_session");
    expect(canonicalSessionCookie).not.toBe("__Host-can_os_session");
  });

  it("derives exactly one Site from a native administrator grant", () => {
    const row = canonicalSessionRowSchema.parse(session);
    const context = projectCanonicalCommandContext(row);
    expect(context.actorPersonId).toBe(row.person_id);
    expect(context.scope.organizationIds).toEqual([row.organization_id]);
    expect(context.scope.siteIds).toEqual([row.site_id]);
    expect(context.capabilities.has("blueprint.configure")).toBe(true);
    expect(context.capabilities.has("blueprint.execute")).toBe(true);
    expect(context.capabilities.has("blueprint.review")).toBe(false);
  });

  it("allows independent Organization reviewers but no Site writes", () => {
    const reviewer = canonicalSessionRowSchema.parse({
      ...session, role_code: "blueprint_reviewer", site_id: null,
    });
    const context = projectCanonicalCommandContext(reviewer);
    expect(context.capabilities.has("blueprint.review")).toBe(true);
    expect(context.capabilities.has("blueprint.execute")).toBe(false);
    expect(context.capabilities.has("blueprint.configure")).toBe(false);
    expect(context.scope.siteIds).toEqual([]);
  });

  it("separates independent survey review from provider publication and blueprint review", () => {
    const reviewer = canonicalSessionRowSchema.parse({...session,role_code:"survey_reviewer",site_id:null});
    const context = projectCanonicalCommandContext(reviewer);
    expect(context.capabilities.has("survey.review")).toBe(true);
    expect(context.capabilities.has("survey.publish")).toBe(false);
    expect(context.capabilities.has("survey.draft.create")).toBe(false);
    expect(context.capabilities.has("blueprint.review")).toBe(false);
    expect(() => projectCanonicalCommandContext(canonicalSessionRowSchema.parse({
      ...session,role_code:"survey_reviewer",
    }))).toThrow();
    const author=projectCanonicalCommandContext(canonicalSessionRowSchema.parse(session));
    expect(author.capabilities.has("survey.review")).toBe(false);
    expect(author.capabilities.has("survey.publish")).toBe(true);
  });
  it("gives a non-Site learner participation but no Blueprint or Site authority", () => {
    const learner = canonicalSessionRowSchema.parse({...session, role_code: "learner", site_id: null});
    const context = projectCanonicalCommandContext(learner);
    expect(context.role).toBe("learner");
    expect(context.scope.siteIds).toEqual([]);
    expect(context.capabilities.has("learning.participate")).toBe(true);
    expect(context.capabilities.has("blueprint.execute")).toBe(false);
    expect(() => projectCanonicalCommandContext(canonicalSessionRowSchema.parse({
      ...session, role_code: "learner",
    }))).toThrow();
  });

  it("gives a site-scoped facilitator playback powers without registrar or learner powers", () => {
    const facilitator = projectCanonicalCommandContext(canonicalSessionRowSchema.parse({
      ...session,role_code:"room_facilitator",
    }));
    expect(facilitator.scope.siteIds).toEqual([session.site_id]);
    expect(facilitator.capabilities.has("learning.room.facilitate")).toBe(true);
    for(const forbidden of ["noncredit.assessment.provision","noncredit.completion.decide",
      "blueprint.configure","credential.issue","learning.participate","survey.publish"]){
      expect(facilitator.capabilities.has(forbidden)).toBe(false);
    }
    expect(() => projectCanonicalCommandContext(canonicalSessionRowSchema.parse({
      ...session,role_code:"room_facilitator",site_id:null,
    }))).toThrow();
  });
  it("rejects site-less operators and Site-assigned independent reviewers", () => {
    expect(() => projectCanonicalCommandContext(canonicalSessionRowSchema.parse({
      ...session, site_id: null,
    }))).toThrow();
    expect(() => projectCanonicalCommandContext(canonicalSessionRowSchema.parse({
      ...session, role_code: "blueprint_reviewer",
    }))).toThrow();
  });

  it("never accepts caller-defined capabilities or substituted IDs", () => {
    expect(canonicalSessionRowSchema.safeParse({
      ...session, capabilities: ["blueprint.review"],
    }).success).toBe(false);
    expect(canonicalSessionRowSchema.safeParse({
      ...session, organization_id: "not-a-uuid",
    }).success).toBe(false);
  });
});
