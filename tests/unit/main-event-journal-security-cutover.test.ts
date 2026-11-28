import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");

describe("CAN OS public journal security and native writer cutover",()=>{
  it("restricts authenticated direct access without changing event history",()=>{
    const migration=read("database/production/2026-11-17-secure-shared-event-journals.sql");
    expect(migration).toContain(
      "REVOKE ALL PRIVILEGES ON TABLE public.audit_events, public.domain_events FROM authenticated",
    );
    for(const table of ["audit_events","domain_events"]){
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain("Historical event records");
    expect(migration).not.toMatch(/^DROP (?:TABLE|SCHEMA)\b/m);
    expect(migration).not.toMatch(/^CREATE TABLE\b/m);
  });

  it("routes ordinary native writes to one public journal while retaining event context",()=>{
    const adapter=read("src/platform/canonical-mutation.server.ts");
    const shared=read("src/platform/mutation.ts");
    expect(adapter).toContain('from "@/platform/mutation"');
    expect(adapter).toContain("await writeAudit(tx, {");
    expect(adapter).toContain("await emitEvent(tx, {");
    expect(adapter).toContain('source: "canonical_v301"');
    expect(adapter).toContain("nativeAuditPayload: entry.payload");
    expect(adapter).toContain("organizationId: entry.owningOrganizationId");
    expect(adapter).toContain("occurredAt: entry.occurredAt");
    expect(adapter).not.toContain("tx.insert(auditEvents)");
    expect(adapter).not.toContain("tx.insert(domainEvents)");
    expect(shared).toContain("occurredAt?: Date");
    expect(shared).toContain("occurredAt: event.occurredAt");
  });

  it("routes restricted Blueprint writes to one public journal with scoped roles",()=>{
    const gateway=read("src/modules/blueprints/blueprint-journal.server.ts");
    const migration=read("drizzle/0097_blueprint_public_journal_gateway.sql");
    const provision=read("database/canonical/v3.0.1/provision-blueprint-roles.sql");
    for(const path of [
      "src/modules/blueprints/blueprint-review.server.ts",
      "src/modules/blueprints/blueprint-execution.server.ts",
      "src/modules/blueprints/blueprint-configuration.server.ts",
    ]){
      const source=read(path);
      expect(source).toContain("SET LOCAL ROLE");
      expect(source).toContain("writeBlueprintTransition(");
      expect(source).not.toContain("tx.insert(auditEvents)");
      expect(source).not.toContain("tx.insert(domainEvents)");
    }
    expect(gateway).toContain("writeCanonicalAudit(tx, audit)");
    expect(gateway).toContain("emitCanonicalDomainEvent(tx, event)");
    expect(gateway).toContain("public.append_restricted_blueprint_transition(");
    expect(migration).toContain("current_setting('role',true)");
    expect(migration).toContain("public.database_role_organization_bindings");
    expect(migration).toContain("public.audit_events");
    expect(migration).toContain("public.domain_events");
    expect(migration).toContain("blueprint_author_history_reviewer_read");
    expect(provision).toContain("GRANT SELECT (actor_person_id,action,resource_type,resource_id) ON public.audit_events");
    expect(provision).not.toContain("education_v30.audit_events");
    expect(provision).not.toContain("education_v30.evidence_documents");
    for(const path of [
      "src/modules/operations/canonical-survey-draft.server.ts",
      "src/modules/operations/canonical-survey-approvals.server.ts",
    ]){
      const source=read(path);
      expect(source).toContain("SET LOCAL ROLE");
      expect(source).toContain("tx.insert(auditEvents)");
    }
    const gate=read("scripts/acceptance/check-native-event-journal-cutover.mjs");
    expect(gate).toContain("roleScopedSharedWriters");
    expect(gate).toContain("schema_drop_authorized:false");
  });
});
