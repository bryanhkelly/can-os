import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { safeAccessReturnTo } from "@/domain/access-navigation";
import { embeddedSourceRevision } from "@/domain/build-source-revision";

const read=(path:string)=>readFileSync(path,"utf8");
const link="/calendar?date=2026-11-20&event=b6744a3c-b9cc-4e2d-ad1d-30644f7fe5c3";

describe("V6.1 calendar login and build footer",()=>{
 it("preserves a safe exact event return path while rejecting external redirects",()=>{
   expect(safeAccessReturnTo(link)).toBe(link);
   expect(safeAccessReturnTo("//example.com/calendar")).toBeUndefined();
   expect(safeAccessReturnTo("/access/verify?token=private")).toBeUndefined();
 });
 it("guards calendar before rendering the Event unavailable state",()=>{
   const calendar=read("src/routes/calendar.tsx");
   expect(calendar).toContain("loader: async ({ location })");
   expect(calendar).toContain("const session = await getWorkspaceSession()");
   expect(calendar).toContain("if (session.error) throw new Error");
   expect(calendar).toContain('throw redirect({ to: "/access"');
   expect(calendar).toContain("accessReturnToFromLocation(location)");
   expect(calendar).toContain("replace: true");
   expect(calendar).toContain('normalizeClientError(error).kind === "authentication"');
   expect(calendar).toContain('title="Event unavailable"');
 });
 it("displays actual Vite-embedded revision at bottom of login screen",()=>{
   const login=read("src/routes/access.index.tsx");
   expect(login).toContain("embeddedSourceRevision()");
   expect(login).toContain('aria-label="Build information"');
   expect(login).toContain('buildId?.slice(0,12)??"unavailable"');
   const footer=login.indexOf('aria-label="Build information"');
   expect(footer).toBeGreaterThan(login.indexOf("</WorkspacePanel>"));
   expect(embeddedSourceRevision()).toBeNull();
 });
});

describe("Valor teacher and learner practice-only knowledge checks",()=>{
 it("keeps synthetic draft questions, canonical attempt scope and secure practice writes",()=>{
   const practice=read("src/modules/classes/native-valor-practice-check.functions.ts");
   expect(practice).toContain('actor.role!=="student"');
   expect(practice).toContain("authorizeCanonicalCourseAttempt(tx,actor,enrollment.courseAttemptId)");
   expect(practice).toContain("iv.lifecycle='draft'");
   expect(practice).toContain("public.formative_practice_attempts");
   expect(practice).toContain("education_v30_secure.formative_practice_responses");
   expect(practice).toContain("valor_draft_assessment_practice");
   expect(practice).not.toContain("UPDATE public.assessment_versions");
   expect(practice).not.toContain("INSERT INTO public.grading_decisions");
 });
 it("only lets the current Class teacher return synthetic practice feedback",()=>{
   const teacher=read("src/modules/classes/native-class-teacher-homework.functions.ts");
   expect(teacher).toContain("returnNativeClassDraftPracticeFeedback");
   expect(teacher).toContain("authorizedTeacher(tx,data.classId)");
   expect(teacher).toContain("currentClassAuthority(tx,cls.id,now)");
   expect(teacher).toContain('gs.response @> \'{"synthetic":true,"practiceResponse":true}\'::jsonb');
   expect(teacher).toContain("education_v30_secure.formative_practice_responses");
   expect(teacher).toContain("class.knowledge_check.practice_feedback.recorded");
   expect(teacher).toContain("canRecordOfficialGrade:false");
   expect(teacher).not.toContain("INSERT INTO public.grading_decisions");
 });
 it("keeps real Jordan submissions marked as synthetic while giving learner returned feedback",()=>{
   const homework=read("src/modules/classes/native-class-homework.functions.ts");
   const student=read("src/components/learning/NativeValorDraftPracticePanel.tsx");
   const teacher=read("src/components/learning/NativeClassTeacherReviewPanels.tsx");
   expect(homework).toContain("syntheticPractice");
   expect(homework).toContain("practiceResponse:true");
   expect(student).toContain("attempt.teacherFeedback");
   expect(student).toContain("Not an official grade");
   expect(teacher).toContain("returnNativeClassDraftPracticeFeedback");
   expect(teacher).toContain("Return practice-check feedback");
 });
});
