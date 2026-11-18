import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service=()=>readFileSync("src/modules/classes/class-staff.functions.ts","utf8");
const migration=()=>readFileSync(
  "database/production/2026-11-17-rebind-native-class-staff-person-to-public.sql","utf8");

describe("P0 native Class staff with one CAN Person and explicit Site grant",()=>{
 it("never uses native Person/account or identity correspondence for staff eligibility",()=>{
  const source=service();
  expect(source).toContain("accessAccounts, accountPersonGrants, people");
  expect(source).toContain("eq(accessAccounts.personId,accountPersonGrants.personId)");
  expect(source).toContain("eq(people.id,data.personId)");
  expect(source).toContain("eq(people.active,true)");
  expect(source).toContain("eq(accountPersonGrants.organizationId,instance.operatingOrganizationId)");
  expect(source).toContain("eq(accountPersonGrants.siteId,instance.siteId!)");
  expect(source).toContain('eq(accountPersonGrants.role,"room_facilitator")');
  expect(source).toContain("eq(accountPersonGrants.active,true)");
  expect(source).toContain("eq(accessAccounts.disabled,false)");
  expect(source).toContain("isNotNull(accessAccounts.emailVerifiedAt)");
  expect(source).toContain('for("share")');
  expect(source).toContain("staffGrants.length!==1");
  expect(source).toContain("isDemoAccountEmail(staffGrants[0]!.email)");
  expect(source).toContain("assertCurrentCanonicalStaffForMutation(tx,getRequest(),manager.actor)");
  expect(source).toContain("validateClassAuthority(tx,manager");
  expect(source).not.toContain("canonicalPersons");
  expect(source).not.toContain("canonicalAccountGrants");
  expect(source).not.toContain("canonicalAccounts");
  expect(source).not.toContain("accessAccountCanonicalPrincipals");
  expect(source).not.toContain("tx.insert(people)");
 });
 it("keeps exact Class staff FK name, RLS and append-only authority",()=>{
  const sql=migration();
  expect(sql).toContain("class_staff_assignments_person_id_fkey");
  expect(sql).toContain("REFERENCES public.people(id)");
  expect(sql).toContain("convalidated");
  expect(sql).toContain("relrowsecurity AND c.relforcerowsecurity");
  expect(sql).toContain("confdeltype='a'");
  expect(sql).toContain("confupdtype='a'");
  expect(sql).toContain("EXISTS(SELECT 1 FROM education_v30.class_staff_assignments)");
  expect(sql).toContain("br-restless-sea-ar9ooo55");
  const executable=sql.split("\n").filter(l=>!l.trimStart().startsWith("--")).join("\n");
  expect(executable).not.toMatch(/\bDROP TABLE\b|\bCASCADE\b|\bINSERT INTO\b|\bDELETE FROM\b/);
 });
});
