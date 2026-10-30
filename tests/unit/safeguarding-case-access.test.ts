import { describe, expect, it } from "vitest";
import { resolveAccessContext, type AccessContext, type VerifiedAccessGrant } from "@/domain/access-context";
import {
  assertSafeguardingCaseAccess,
  assertSafeguardingConfigurationScope,
  assertSafeguardingReporterRelationship,
  type SafeguardingCaseResource,
} from "@/domain/safeguarding-case-access";

const resource: SafeguardingCaseResource = {
  id: "incident-a",
  type: "safeguarding_concern",
  classification: "safeguarding_restricted",
  reporterPersonId: "reporter-a",
  organizationId: "org-a",
  siteId: "site-a",
  programId: "program-a",
};
const assignment = { personId: "person-a", responsibility: "primary", revokedAt: null };

function actor(role = "safeguarding_responder", personId = "person-a"): AccessContext {
  const grant: VerifiedAccessGrant = {
    id: "grant-a", accountId: "account-a", personId, role,
    organizationId: "org-a", siteId: "site-a", active: true,
  };
  const context = resolveAccessContext({
    accountId: "account-a", sessionId: "session-a", activeGrantId: grant.id,
  }, [grant]);
  context.scope.programIds = ["program-a"];
  return context;
}

describe("restricted safeguarding case authorization", () => {
  it("allows a named responder with capability, resource, scope and active relationship", () => {
    expect(() => assertSafeguardingCaseAccess(actor(), resource, assignment)).not.toThrow();
    expect(() => assertSafeguardingCaseAccess(
      actor("safeguarding_lead"), resource, assignment, "safeguarding.respond",
    )).not.toThrow();
  });

  it("denies a site colleague without an assignment or with a revoked assignment", () => {
    expect(() => assertSafeguardingCaseAccess(actor(), resource, null)).toThrow("active named");
    expect(() => assertSafeguardingCaseAccess(actor(), resource, {
      ...assignment, revokedAt: new Date("2026-10-28T00:00:00Z"),
    })).toThrow("active named");
    expect(() => assertSafeguardingCaseAccess(actor("safeguarding_responder", "person-b"), resource, assignment)).toThrow("active named");
  });

  it("denies wrong organization, sibling site and wrong program even with a named assignment", () => {
    expect(() => assertSafeguardingCaseAccess(actor(), { ...resource, organizationId: "org-b" }, assignment)).toThrow();
    expect(() => assertSafeguardingCaseAccess(actor(), { ...resource, siteId: "site-b" }, assignment)).toThrow();
    expect(() => assertSafeguardingCaseAccess(actor(), { ...resource, programId: "program-b" }, assignment)).toThrow();
  });

  it("never treats ordinary incidents or support cases as safeguarding cases", () => {
    expect(() => assertSafeguardingCaseAccess(actor(), { ...resource, type: "student_support" }, assignment)).toThrow("restricted incident");
    expect(() => assertSafeguardingCaseAccess(actor(), { ...resource, classification: "legal_restricted" }, assignment)).toThrow("restricted incident");
  });

  it("does not grant case access through a registrar or reporter membership", () => {
    expect(() => assertSafeguardingCaseAccess(actor("registrar"), resource, assignment)).toThrow();
    expect(() => assertSafeguardingCaseAccess(actor("room_facilitator"), resource, assignment)).toThrow();
  });

  it("allows only the original onsite reporter to receive the limited receipt relationship", () => {
    const reporter = actor("room_facilitator", "reporter-a");
    expect(() => assertSafeguardingReporterRelationship(reporter, resource)).not.toThrow();
    expect(() => assertSafeguardingReporterRelationship(actor("site_staff", "person-b"), resource)).toThrow("own safeguarding");
    expect(() => assertSafeguardingReporterRelationship(reporter, { ...resource, siteId: "site-b" })).toThrow();
  });
});

describe("operational safeguarding configuration authorization", () => {
  it("allows scoped registrar and safeguarding lead policy management without case browsing", () => {
    expect(() => assertSafeguardingConfigurationScope(actor("registrar"), "org-a", "site-a")).not.toThrow();
    expect(() => assertSafeguardingConfigurationScope(actor("safeguarding_lead"), "org-a", "site-a")).not.toThrow();
    const registrar = actor("registrar");
    expect(registrar.capabilities.has("safeguarding.case.read")).toBe(false);
  });

  it("denies responders, onsite reporters and sibling-site configuration", () => {
    expect(() => assertSafeguardingConfigurationScope(actor(), "org-a", "site-a")).toThrow();
    expect(() => assertSafeguardingConfigurationScope(actor("room_facilitator"), "org-a", "site-a")).toThrow();
    expect(() => assertSafeguardingConfigurationScope(actor("registrar"), "org-a", "site-b")).toThrow();
  });
});
