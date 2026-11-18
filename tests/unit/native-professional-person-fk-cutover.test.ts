import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const path="database/production/2026-11-17-rebind-13-professional-qualification-person-fks.sql";
const source=()=>readFileSync(path,"utf8");
const expected=[
 "creator_commissions_creator_person_id_fkey",
 "equipment_assignments_participant_person_id_fkey",
 "improvement_actions_action_owner_person_id_fkey",
 "participant_technology_assessments_assessor_person_id_fkey",
 "participant_technology_assessments_participant_person_id_fkey",
 "professional_capability_authorizations_person_id_fkey",
 "professional_role_assignments_person_id_fkey",
 "professional_screening_decisions_person_id_fkey",
 "qualification_applications_contact_person_id_fkey",
 "qualification_person_consents_subject_person_id_fkey",
 "qualification_subjects_person_id_fkey",
 "survey_invitations_invited_person_id_fkey",
 "workforce_compensation_agreements_payee_person_id_fkey",
];
describe("Main one-Person cutover for professional and qualification evidence",()=>{
 it("rebinds exactly thirteen formerly native Person FKs to public.people",()=>{
   const sql=source();
   expect(new Set(expected).size).toBe(13);
   for(const name of expected)expect(sql).toContain("'"+name+"'");
   expect(sql).toContain("count(*) FROM _can_person_fk_release_preflight");
   expect(sql).toContain("count(DISTINCT(table_name,column_name,constraint_name))");
   expect(sql).toContain("br-restless-sea-ar9ooo55");
   expect(sql).toContain("sweet-hall-62441909");
   expect(sql).toContain("REFERENCES public.people(id)");
   expect(sql).toContain("convalidated");
   expect(sql).toContain("condeferrable");
   expect(sql).toContain("confdeltype");
   expect(sql).toContain("confupdtype");
   expect(sql).toContain("Unexpected FK definition");
   expect(sql).toContain("Native Person FK verification failed");
   expect(sql).toContain("Nonempty source %, rows=%");
 });
 it("does not remove People, change scoped grants or introduce correspondence",()=>{
   const sql=source();
   expect(sql).not.toContain("DROP TABLE public.people");
   expect(sql).not.toContain("DROP TABLE education_v30.persons");
   expect(sql).not.toContain("account_person_grants");
   expect(sql).not.toContain("access_account_canonical_principals");
   expect(sql).not.toContain("access_account_noncredit_principals");
   expect(sql).not.toContain("CASCADE");
   expect(sql).not.toContain("INSERT INTO public.people");
   expect(sql).not.toContain("ALTER TABLE public.access_accounts");
 });
});
