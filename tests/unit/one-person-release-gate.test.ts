import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");
const journal=JSON.parse(read("drizzle/meta/_journal.json")) as {
 entries:Array<{idx:number;tag:string}>;
};
const snapshot=JSON.parse(read("drizzle/meta/0085_snapshot.json")) as {
 id:string; prevId:string;
 tables:Record<string,{
  columns:Record<string,unknown>;
  indexes:Record<string,{isUnique:boolean;where?:string}>;
  foreignKeys:Record<string,unknown>;
 }>;
};

describe("canonical CAN Person production cutover gate",()=>{
 it("registers the identity schema change as the next main Drizzle migration",()=>{
  expect(journal.entries.at(-1)).toMatchObject({
   idx:85,tag:"0085_historical_person_ownership",
  });
  expect(snapshot.id).toBe("7a1c0000-0000-4085-8085-000000000085");
  expect(snapshot.prevId).toBe("7a1c0000-0000-4084-8084-000000000084");
  const account=snapshot.tables["public.access_accounts"];
  expect(account?.columns).toHaveProperty("person_id");
  expect(account?.foreignKeys).toHaveProperty("access_accounts_person_id_people_id_fk");
  expect(account?.indexes.access_accounts_person_id_uq?.isUnique).toBe(true);
  expect(account?.indexes.access_accounts_person_id_uq?.where).toContain("IS NOT NULL");
 });
 it("keeps account identity permanent while allowing many roles on one Person",()=>{
  const migration=read("drizzle/0084_can_one_person_identity.sql");
  expect(migration).toContain("ADD COLUMN IF NOT EXISTS person_id uuid");
  expect(migration).toContain("REFERENCES public.people(id) ON DELETE RESTRICT");
  expect(migration).toContain("access_accounts_person_id_uq");
  expect(migration).toContain("can_account_person_immutable");
  expect(migration).toContain("can_account_grants_one_person_guard");
  expect(migration).toContain("COALESCE(account.person_id,NEW.person_id)");
  expect(migration).toContain("CAN account already belongs to another Person");
  expect(migration).toContain("Existing CAN role grant identity cannot be reassigned");
 });
 it("backfills unambiguous revoked-role ownership without reviving grants",()=>{
  const migration=read("drizzle/0085_historical_person_ownership.sql");
  expect(migration).toContain("COUNT(DISTINCT g.person_id)>1");
  expect(migration).toContain("another.person_id=old_membership.person_id");
  expect(migration).toContain("HAVING COUNT(DISTINCT g.person_id)=1");
  expect(migration).toContain("AND a.person_id IS NULL");
  expect(migration).not.toContain("UPDATE public.account_person_grants");
  expect(migration).not.toContain("DELETE FROM");
 });
 it("blocks an unprepared production Cloudflare deployment",()=>{
  const pkg=JSON.parse(read("package.json")) as {
   scripts:Record<string,string>;
  };
  const release=pkg.scripts["deploy:cloudflare"];
  expect(release).toMatch(/^node scripts\/acceptance\/check-one-person-deploy-schema\.mjs && /);
  const gate=read("scripts/acceptance/check-one-person-deploy-schema.mjs");
  expect(gate).toContain("br-restless-sea-ar9ooo55");
  expect(gate).toContain("has_person_anchor");
  expect(gate).toContain("single_person_grant_triggers");
  expect(gate).toContain("mismatched_active_grants");
  expect(gate).not.toContain("INSERT INTO");
  expect(gate).not.toContain("ALTER TABLE");
  const parity=read("scripts/acceptance/check-production-drizzle-parity.mjs");
  expect(parity).toContain("const tip = 85");
  expect(parity).toContain("account_person_immutable");
 });
});
