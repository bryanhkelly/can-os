import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { safeAccessReturnTo } from "@/domain/access-navigation";
import { embeddedSourceRevision } from "@/domain/build-source-revision";

const read=(path:string)=>readFileSync(path,"utf8");

describe("calendar sign-in and build provenance",()=>{
  const route=read("src/routes/calendar.tsx");
  const access=read("src/routes/access.index.tsx");
  it("preserves the requested event URL across a new sign-in",()=>{
    const path="/calendar?date=2026-11-20&event=b6744a3c-b9cc-4e2d-ad1d-30644f7fe5c3";
    expect(safeAccessReturnTo(path)).toBe(path);
    expect(route).toContain('loader: async ({ location }) =>');
    expect(route).toContain("const session = await getWorkspaceSession()");
    expect(route).toContain('if (!session.session?.authenticated)');
    expect(route).toContain('to: "/access"');
    expect(route).toContain("accessReturnToFromLocation(location)");
    expect(route).toContain('normalizeClientError(error).kind === "authentication"');
  });
  it("does not disguise infrastructure errors as a signed-out event",()=>{
    expect(route).toContain('if (session.error) throw new Error');
    expect(route).toContain('title="Event unavailable"');
  });
  it("shows the deployed source revision, never a hardcoded branch SHA",()=>{
    expect(access).toContain("embeddedSourceRevision()");
    expect(access).toContain('aria-label="Build information"');
    expect(access).toContain('buildId?.slice(0,12)??"unavailable"');
    expect(embeddedSourceRevision()).toBeNull();
  });
});

describe("Valor synthetic knowledge checks and practice grading",()=>{
  const draft=read("src/modules/classes/native-class-draft-practice.functions.ts");
  const teacher=read("src/modules/classes/native-class-teacher-homework.functions.ts");
  const route=read("src/routes/class_.$classId.tsx");
  it("allows only an exact synthetic current Class learner to respond privately",()=>{
    for(const expected of [
      'actor.role === "student"', "authorizeCanonicalCourseAttempt",
      "exact synthetic Course practice questions", "classEnrollmentId",
      'aa.status=\'draft\'', "formativePracticeAttempts", "formativePracticeResponses",
      "practiceOnly: true",
    ])expect(draft).toContain(expected);
    expect(draft).not.toContain("assessmentAccess");
    expect(draft).not.toContain("grading_decisions");
    expect(draft).not.toContain("UPDATE public.assessment_versions");
    expect(route).toContain("<NativeValorDraftPracticePanel");
  });
  it("does not promote synthetic teacher feedback to official grade authority",()=>{
    expect(teacher).toContain("returnNativeClassPracticeFeedback");
    expect(teacher).toContain('class.homework.practice_feedback.recorded');
    expect(teacher).toContain('canRecordOfficialGrade:false');
    expect(teacher).not.toContain("INSERT INTO public.grading_decisions");
    expect(teacher).not.toContain("UPDATE public.grading_assignments");
    expect(teacher).toContain('gs.response @>');
  });
});
