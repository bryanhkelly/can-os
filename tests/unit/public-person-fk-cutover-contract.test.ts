import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");

describe("P0 public Person FK cutover without correspondence",()=>{
 it("rebinds precisely seven Class and facilitator FK columns",()=>{
   const sql=read("database/production/2026-11-17-rebind-seven-public-class-person-fks.sql");
   const expected=[
     "class_enrollment_approval_requests_applicant_person_id_fkey",
     "class_enrollment_approval_requests_guardian_person_id_fkey",
     "class_enrollment_approval_requests_learner_person_id_fkey",
     "class_enrollment_invitations_learner_person_id_fkey",
     "class_enrollment_repeat_authorizations_learner_person_id_fkey",
     "class_enrollment_transfer_requests_learner_person_id_fkey",
     "facilitated_room_assisted_activity_evide_learner_person_id_fkey",
   ];
   expect(new Set(expected).size).toBe(7);
   for(const name of expected)expect(sql).toContain("'"+name+"'");
   expect(sql).toContain("br-restless-sea-ar9ooo55");
   expect(sql).toContain("sweet-hall-62441909");
   expect(sql).toContain("REFERENCES public.people(id)");
   expect(sql).toContain("c.convalidated");
   expect(sql).toContain("NOT c.condeferrable");
   expect(sql).toContain("c.confupdtype='a'");
   expect(sql).toContain("c.confdeltype='a'");
   expect(sql).toContain("c.relrowsecurity AND c.relforcerowsecurity");
   expect(sql).toContain("EXISTS(SELECT 1 FROM education_v30.persons)");
   expect(sql).toContain("Class/facilitator table % contains % records");
   expect(sql).not.toContain("access_account_canonical_principals'");
   expect(sql).not.toContain("access_account_noncredit_principals'");
   const executable=sql.split("\n").filter(line=>!line.trimStart().startsWith("--")).join("\n");
   expect(executable).not.toMatch(/\bCASCADE\b|\bINSERT INTO\b|\bTRUNCATE\b|\bDELETE FROM\b/);
 });
 it("rebinds the empty public feedback Person FK without modifying identity grants",()=>{
   const sql=read("database/production/2026-11-17-rebind-public-feedback-professional-person-to-people.sql");
   expect(sql).toContain("FOREIGN KEY (professional_person_id) REFERENCES public.people(id)");
   expect(sql).toContain("feedback_subjects_professional_person_id_fkey");
   expect(sql).toContain("pg_get_constraintdef");
   expect(sql).toContain("c.convalidated");
   expect(sql).toContain("NOT c.condeferrable");
   expect(sql).toContain("c.confdeltype='a'");
   expect(sql).toContain("c.confupdtype='a'");
   expect(sql).toContain("t.relrowsecurity AND t.relforcerowsecurity");
   expect(sql).not.toContain("INSERT INTO public.people");
   expect(sql).not.toContain("DROP TABLE public.account_person_grants");
 });
});
