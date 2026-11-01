import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const snapshot = n => JSON.parse(readFileSync(`drizzle/meta/${n}_snapshot.json`, "utf8"));
const old = snapshot("0056"), annual = snapshot("0057"), finance = snapshot("0058"), evidence = snapshot("0059");
const annualName = "public.curriculum_annual_adoptions";
const financeNames = ["finance_invoices","finance_payment_attempts","finance_provider_events","finance_receipts"].map(n => `public.${n}`);

describe("FullFlow 0057–0059 Drizzle snapshot source parity", () => {
  it("has distinct chained version-seven snapshots", () => {
    const entries=[old,annual,finance,evidence];
    for(let i=1;i<entries.length;i++) {
      expect(entries[i].prevId).toBe(entries[i-1].id);
      expect(entries[i].id).not.toBe(entries[i-1].id);
      expect(entries[i].version).toBe("7");
      expect(entries[i].dialect).toBe("postgresql");
    }
  });
  it("only adds the annual adoption at 0057", () => {
    expect(old.tables[annualName]).toBeUndefined();
    expect(annual.tables[annualName]?.foreignKeys).toHaveProperty("curriculum_annual_adoptions_entitlement_id_curriculum_entitlements_id_fk");
    expect(Object.keys(annual.tables)).toHaveLength(Object.keys(old.tables).length + 1);
  });
  it("adds exactly the four finance tables at 0058", () => {
    for (const name of financeNames) {
      expect(annual.tables[name]).toBeUndefined();
      expect(finance.tables[name]).toBeDefined();
    }
    expect(Object.keys(finance.tables)).toHaveLength(Object.keys(annual.tables).length + 4);
    expect(finance.tables["public.finance_provider_events"].indexes).toHaveProperty("finance_provider_event_uq");
  });
  it("preserves a real 0059 status check rather than copying the 0058 snapshot", () => {
    const table="public.church_onboarding_requests", name="church_onboarding_request_status_ck";
    expect(finance.tables[table].checkConstraints[name]).toBeUndefined();
    expect(evidence.tables[table].checkConstraints[name].value).toContain("'needs_evidence'");
    expect(Object.keys(evidence.tables)).toHaveLength(Object.keys(finance.tables).length);
  });
});
