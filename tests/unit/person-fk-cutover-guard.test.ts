import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");

describe("P0 single Person FK rebind staged release",()=>{
  it("reports the complete Neon main graph without writes or email matching",()=>{
    const inventory=read("scripts/acceptance/check-main-person-fk-inventory.mjs");
    expect(inventory).toContain("br-restless-sea-ar9ooo55");
    expect(inventory).toContain("current_database()");
    expect(inventory).toContain("pg_get_constraintdef");
    expect(inventory).toContain("convalidated");
    expect(inventory).toContain("sql.query(query)");
    expect(inventory).toContain("WHERE "+'"'+");
    expect(inventory).toContain("runtimeCutoverApproved: false");
    expect(inventory).not.toContain("ALTER TABLE");
    expect(inventory).not.toContain("INSERT INTO");
    expect(inventory).not.toContain("UPDATE public.");
  });

  it("guards every Person FK change behind explicit reviewed release and one transaction",()=>{
    const migration=read("database/production/2026-11-17-stage-unified-person-fk-rebind.sql");
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
    expect(migration).toContain("br-restless-sea-ar9ooo55");
    expect(migration).toContain("can.one_person_runtime_cutover_verified");
    expect(migration).toContain("can.one_person_fk_rebind_approved");
    expect(migration).toContain("old_count <> 239");
    expect(migration).toContain("cardinality(c.conkey)<>1");
    expect(migration).toContain("NOT c.convalidated");
    expect(migration).toContain("sourcedata<>0");
    expect(migration).toContain("'REFERENCES public.people(id)'");
    expect(migration).toContain("IF rebound_count<>old_count");
    expect(migration).not.toContain("INSERT INTO public.people");
    expect(migration).not.toContain("DROP TABLE");
    expect(migration).not.toContain("CASCADE");
    const packageJson=JSON.parse(read("package.json")) as {scripts:Record<string,string>};
    expect(packageJson.scripts["verify:person:main-fk-inventory"])
      .toBe("node scripts/acceptance/check-main-person-fk-inventory.mjs");
    // Intentionally not wired to automatic schema migration or deploy.
    expect(packageJson.scripts["db:migrate"]).not.toContain("stage-unified-person");
    expect(packageJson.scripts["deploy:cloudflare"]).not.toContain("stage-unified-person");
  });
});
