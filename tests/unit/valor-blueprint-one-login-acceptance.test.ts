import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");

describe("Valor single CAN login and independent Blueprint acceptance contracts",()=>{
  const bridge=read("src/modules/identity/canonical-command-context.server.ts");
  const blueprint=read("src/modules/blueprints/blueprint-studio.functions.ts");
  const staffFixture=read("database/canonical/v3.0.1/accept-can-staff-restricted-auth-test01.sql");
  const blueprintFixture=read("database/canonical/v3.0.1/accept-valor-blueprint-roles-test01.sql");
  const blueprintRunner=read("scripts/acceptance/run-valor-blueprint-roles-test01.mjs");
  const issuerFixture=read("database/canonical/v3.0.1/accept-sensitive-credential-issuer-test01.sql");

  it("authoring requires one original CAN Site Admin session with reviewed identity link",()=>{
    expect(bridge).toContain("resolveCanonicalSiteStaffFromCan(actor, request)");
    for(const endpoint of [
      "createCanonicalBlueprintConfiguration",
      "saveCanonicalBlueprintConfiguration",
      "submitCanonicalBlueprintConfiguration",
      "decideCanonicalBlueprintReview",
      "executeCanonicalBlueprintConfiguration",
    ])expect(blueprint).toContain(endpoint);
    expect(blueprint).toContain("getCanonicalCommandContext(getRequest())");
    expect(staffFixture).toContain("v301_can_staff_session_context(repeat('a',64))");
    expect(staffFixture).toContain("second CAN Person grant was not rejected");
    expect(staffFixture).toContain("ROLLBACK TO SAVEPOINT can_staff_sso_accept");
  });

  it("runs different author and reviewer SQL roles and never activates a deployment",()=>{
    expect(blueprintFixture).toContain("SET LOCAL ROLE can_v30_blueprint_author_");
    expect(blueprintFixture).toContain("SET LOCAL ROLE can_v30_blueprint_reviewer_");
    expect(blueprintFixture).toContain("author_scope_pass");
    expect(blueprintFixture).toContain("reviewer_scope_pass");
    expect(blueprintFixture).toContain("blueprint_planning_pass");
    expect(blueprintFixture).toContain("status='planning'");
    expect(blueprintFixture).toContain("'proposed'");
    expect(blueprintFixture).not.toContain("'active')");
    expect(blueprintFixture).toContain("ROLLBACK TO SAVEPOINT valor_blueprint_acceptance");
  });

  it("refuses production and requires all three acceptance observations and cleanup",()=>{
    expect(blueprintRunner).toContain('const BRANCH="br-bitter-feather-ar0u63x7"');
    expect(blueprintRunner).toContain('const PROJECT="sweet-hall-62441909"');
    expect(blueprintRunner).toContain('const RESTRICTED_USER="can_v301_blueprint_acceptance_app"');
    expect(blueprintRunner).toContain('requireEnv("CAN_VALOR_BLUEPRINT_ACCEPTANCE")');
    expect(blueprintRunner).toContain('assert.notEqual(ownerUrl,process.env.DATABASE_URL');
    for(const indicator of ["author_scope_pass","reviewer_scope_pass","blueprint_planning_pass"])
      expect(blueprintRunner).toContain(indicator);
    expect(blueprintRunner).toContain("await client.query(\"ROLLBACK\")");
    expect(blueprintRunner).toContain("fixtureCleanup");
  });

  it("separately denies credential issuance until issuer approval and full release flags",()=>{
    const issuer=read("src/modules/learning/credential-issuance.functions.ts");
    expect(issuer).toContain('process.env.CAN_CREDENTIAL_ISSUANCE_ENABLED !== "true"');
    expect(issuer).toContain("assertCurrentCredentialIssuer(tx, getRequest(), actor)");
    expect(issuer).toContain("assertNoncreditCompletionSiteScope(tx, actor, registration)");
    expect(issuer).toContain("registration.participantPersonId === actor.actorPersonId");
    expect(issuerFixture).toContain("independent active issuer authority not recognized");
    expect(issuerFixture).toContain("issuer approval transferred to another CAN account");
  });
});
