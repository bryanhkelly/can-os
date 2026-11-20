import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");

describe("delegated Blueprint and Program Catalog least-privilege database routing",()=>{
  const endpoints=[
    "src/modules/blueprints/blueprint-configuration.server.ts",
    "src/modules/blueprints/blueprint-review.server.ts",
    "src/modules/blueprints/blueprint-execution.server.ts",
    "src/modules/blueprints/blueprint-workspace.server.ts",
    "src/modules/blueprints/blueprint-reference-catalog.server.ts",
    "src/modules/blueprints/blueprint-review-evidence.server.ts",
    "src/modules/blueprints/blueprint-review-queue.server.ts",
    "src/modules/programs/program-discovery.server.ts",
  ];
  it("uses one dedicated operations DB pool for all delegated authorization transactions",()=>{
    const scope=read("src/modules/blueprints/blueprint-database-scope.server.ts");
    const client=read("src/db/client.ts");
    expect(scope).toContain("withCanonicalOperationsDatabase(operation)");
    expect(scope).toContain("isVerifiedCanSitePlanning(context)");
    expect(client).toContain("restrictedOperationsDatabase");
    expect(client).toContain("canonicalOperationsUrlValid(");
    expect(client).toContain("getRequestScopedResource(\"canonical-operations-database\"");
    for(const path of endpoints){
      const source=read(path);
      expect(source).toContain("withBlueprintDatabase(context, () => db.transaction(");
    }
  });
  it("never turns a verified Site planning right into reviewer or execution authority",()=>{
    const scope=read("src/modules/blueprints/blueprint-database-scope.server.ts");
    const planner=read("src/modules/blueprints/verified-site-planning.server.ts");
    expect(scope).toContain("? operation()");
    expect(planner).toContain('new Set(["blueprint.read", "blueprint.configure", "program.launch.start"])');
    expect(planner).not.toContain('"blueprint.review", "blueprint.execute"');
    const events=read("src/modules/blueprints/blueprint-journal.server.ts");
    expect(events).toContain('isVerifiedCanSitePlanning(context)');
    expect(events).toContain('throw new AuthorizationError("verified CAN planning cannot review or execute")');
  });
  it("keeps reviewer evidence and actor history on the canonical public schema",()=>{
    for(const path of [
      "src/modules/blueprints/blueprint-review.server.ts",
      "src/modules/blueprints/blueprint-review-queue.server.ts",
      "src/modules/programs/native-offering-adoption-review.functions.ts",
    ])expect(read(path)).toContain("sharedAuditEvents");
    expect(read("src/modules/blueprints/blueprint-review-evidence.server.ts"))
      .toContain('sql<string>`public.evidence_documents.title`');
    const grant=read("database/canonical/v3.0.1/provision-blueprint-roles.sql");
    expect(grant).toContain("public.evidence_documents");
    expect(grant).toContain("public.evidence_document_versions");
    expect(grant).not.toContain("education_v30.audit_events");
    expect(grant).not.toContain("education_v30.evidence_documents");
  });
});
