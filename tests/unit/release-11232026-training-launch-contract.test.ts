import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(new URL("../../" + path, import.meta.url), "utf8");

/** Source contract tests complement server, migration and browser acceptance. */
describe("release-11232026 national training pilot launch", () => {
  it("persists the self-reported Organization type through email verification", () => {
    const schema = source("src/domain/school-setup.ts");
    const start = source("src/routes/site.new.tsx");
    const challenge = source("src/modules/identity/passwordless-access.server.ts");
    const provision = source("src/modules/identity/school-setup-signup.server.ts");
    expect(schema).toContain('organizationType: publicSignupOrganizationTypeSchema.default("other_partner")');
    expect(schema).not.toContain('"can_network",');
    expect(start).toContain('name="organizationType"');
    expect(challenge).toContain("organizationType:data.organizationType");
    expect(provision).toContain("initialVerifiedSignupOrganizationType(requestedType)");
    expect(provision).toContain('classification: initialType === requestedType ? "self_reported" : "pending_verification"');
    expect(provision).not.toContain('type: "christian_school", name: signup.organizationName');
  });

  it("never grants denominational powers on self-asserted signup", () => {
    const provision = source("src/modules/identity/school-setup-signup.server.ts");
    const mapping = source("src/domain/school-setup.ts");
    expect(mapping).toContain('requested === "denomination" || requested === "consortium"');
    expect(provision).toContain("type: initialType");
    expect(provision).toContain("requestedOrganizationType: requestedType");
    expect(provision).toContain('role: "site_admin"');
    expect(provision).not.toContain('role: "network_admin"');
  });

  it("keeps Site in noncredit handoff while retaining publisher-only authorization", () => {
    const prepare = source("src/components/launch-studio/LaunchPrepareV61.tsx");
    const ready = source("src/components/launch-studio/ProgramOfferingJourneyReadinessV61.tsx");
    const publisher = source("src/modules/enrollment/noncredit-enrollment-publication.functions.ts");
    expect(prepare).toContain('"/programs/noncredit/enrollment?publicSiteId=" + scoped(id)');
    expect(prepare).toContain("Only an independently authorized provider");
    expect(ready).toContain('noncredit.state==="ready" && (journey.publisherCandidateCount??0)>0');
    expect(ready).toContain("offeringCode:journey.solution.offeringCode");
    expect(publisher).toContain('requireCanonicalLabProvider("noncredit.enrollment.manage")');
  });

  it("never labels a published Solution as an approved Course or Offering", () => {
    const catalog = source("src/components/launch-studio/SolutionCatalogV61.tsx");
    const reader = source("src/modules/blueprints/blueprint-workspace.server.ts");
    expect(catalog).toContain("Learning content not yet published");
    expect(catalog).toContain("selected.linkedPublishedOffering");
    expect(reader).toContain('eq(offeringVersions.lifecycle, "published")');
    expect(reader).toContain("linkedPublishedOffering: linkedProduct ?");
  });
});
