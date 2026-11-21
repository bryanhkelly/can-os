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
 it("uses the global server and client authentication gates before the calendar",()=>{
   const calendar=read("src/routes/calendar.tsx");
   const root=read("src/routes/__root.tsx");
   const gate=read("src/components/shell/ProtectedRouteAuthGate.tsx");
   expect(root).toContain("if (!isPublicCanPath(location.pathname)");
   expect(root).toContain('throw redirect({ to: "/access"');
   expect(root).toContain("accessReturnToFromLocation(location)");
   expect(root).toContain("<ProtectedRouteAuthGate>");
   expect(gate).toContain("!session?.authenticated");
   expect(calendar).not.toContain("const session = await getWorkspaceSession()");
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
   const revision=embeddedSourceRevision();
   expect(revision===null||/^[a-f0-9]{40}$/.test(revision)).toBe(true);
 });
});

describe("CAN Class practice and knowledge-check parity",()=>{
 it("uses Enrollment credit mode rather than synthetic Person or Site markers",()=>{
  const homework=read("src/modules/classes/native-class-homework.functions.ts");
  expect(homework).toContain('enrollment.creditMode==="not_applicable"');
  expect(homework).toContain("practiceResponse:true");
  expect(homework).not.toContain("f1000000-0000-4000-8000-000000000003");
  expect(homework).not.toContain("p.metadata @>");
 });
 it("Class teachers return formative-only feedback through the existing submission",()=>{
  const teacher=read("src/modules/classes/native-class-teacher-homework.functions.ts");
  expect(teacher).toContain("returnNativeClassPracticeFeedback");
  expect(teacher).toContain('gs.response @> \'{"practiceResponse":true}\'::jsonb');
  expect(teacher).not.toContain("synthetic Valor demonstration only");
  expect(teacher).not.toContain("returnNativeClassDraftPracticeFeedback");
  expect(teacher).not.toContain("INSERT INTO public.grading_decisions");
 });
 it("normal learner and teacher use published canonical assessment inventory",()=>{
  const student=read("src/routes/class_.$classId.tsx");
  const teacher=read("src/components/learning/NativeClassTeacherReviewPanels.tsx");
  expect(student).toContain("NativeClassKnowledgeCheckPanel");
  expect(student).not.toContain("NativeValorDraftPracticePanel");
  expect(teacher).toContain("getNativeClassTeacherAssessments");
  expect(teacher).not.toContain("getNativeClassTeacherDraftPractice");
 });
});
