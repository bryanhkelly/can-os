import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("P0 retired duplicate native Person grant table",()=>{
 it("drops only the empty unused legacy grant authority under a main-only guard",()=>{
  const sql=readFileSync(
    "database/production/2026-11-17-retire-empty-native-person-access-grants.sql","utf8");
  expect(sql).toContain("br-restless-sea-ar9ooo55");
  expect(sql).toContain("sweet-hall-62441909");
  expect(sql).toContain("to_regclass('public.account_person_grants')");
  expect(sql).toContain("(SELECT count(*) FROM public.account_person_grants)<21");
  expect(sql).toContain("EXISTS(SELECT 1 FROM education_v30.persons)");
  expect(sql).toContain("count(*) FROM education_v30.person_access_grants");
  expect(sql).toContain("pg_get_functiondef");
  expect(sql).toContain("pg_constraint");
  expect(sql).toContain("pg_rewrite");
  expect(sql).toContain("DROP TABLE education_v30.person_access_grants RESTRICT");
  expect(sql).not.toContain("DROP TABLE public.account_person_grants");
  expect(sql).not.toContain("CASCADE");
  expect(sql).not.toContain("DELETE FROM");
  expect(sql).not.toContain("TRUNCATE");
 });
});
