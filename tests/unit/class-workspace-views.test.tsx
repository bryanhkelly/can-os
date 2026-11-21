import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("canonical Class navigation", () => {
  it("uses one public Class directory and one exact-ID Class workspace", () => {
    const directory = source("src/routes/class.tsx");
    const workspace = source("src/routes/class_.$classId.tsx");
    expect(directory).toContain('createFileRoute("/class")');
    expect(workspace).toContain('createFileRoute("/class_/$classId")');
    expect(directory).not.toContain('import("./classes")');
    expect(directory).not.toContain("LegacySectionClassPage");
    expect(directory).not.toContain("SectionClassEntry");
    expect(workspace).toContain("getNativeClassWorkspace");
    expect(workspace).toContain('to="/class/$classId"');
  });

  it("does not register a parallel classroom route or carry old identifiers in the canonical directory", () => {
    const directory = source("src/routes/class.tsx");
    const navigation = source("src/components/shell/route-navigation.ts");
    expect(directory).not.toContain('section:selectedClassUuid');
    expect(navigation).not.toContain('"/classes": hidden(');
  });

  it("uses the authorized person profile for teacher links", () => {
    const teacherDirectory = source("src/routes/operations.teacher-marketplace.tsx");
    expect(teacherDirectory).toContain('to="/profiles" search={{person:teacher.personId}}');
    expect(teacherDirectory).not.toContain('teacher.isSynthetic ? teacher.name :');
  });

  it("deep-links enrolled student Classes by canonical Class ID with a safe directory fallback", () => {
    const panel = source("src/components/student/StudentContinueLearningPanel.tsx");
    expect(panel).toContain('to="/class"');
    expect(panel).not.toContain('to="/classes"');
    expect(panel).not.toContain('section:resume.sectionId');
    expect(panel).toContain('to="/class/$classId"');
    expect(panel).toContain('params={{classId:resumeClassId}}');
    expect(panel).toContain('search={{view:"learn",tab:"lessons"}}');
    const dashboard = source("src/components/home/StudentHome.tsx");
    expect(dashboard).toContain('getMyStudentClasses');
    expect(panel).not.toContain('params={{classId:resume.sectionId}}');
  });

  it("loads administration-only review and survey tools on demand", () => {
    const route = source("src/routes/class_.$classId.tsx");
    expect(route).toContain('await import("@/components/learning/NativeClassAssessmentReviewPanel")');
    expect(route).toContain('await import("@/components/learning/NativeClassSurveyCampaignPanel")');
    expect(route).not.toContain('import { NativeClassSurveyCampaignPanel }');
    expect(route).not.toContain('import { NativeClassAssessmentReviewPanel }');
    expect(route).toContain('Loading Class administrative tools');
  });

  it("does not reload the Class workspace for lesson/session-only navigation", () => {
    const route = source("src/routes/class_.$classId.tsx");
    const server = source("src/modules/classes/native-class-workspace.functions.ts");
    expect(route).toContain('queryKey:["native-unified-class",classId,search.view,search.tab]');
    expect(route).toContain('queryFn:()=>getNativeClassWorkspace({data:{classId,view:search.view,tab:search.tab}})');
    expect(route).toContain('selectedLessonId:search.lesson??null');
    expect(route).toContain('selectedSessionId:search.session??null');
    expect(server).toContain('selectedLessonId:data.lesson??null');
    expect(server).toContain('selectedSessionId:data.session??null');
  });

  it("keeps learner and operator commands behind the Class authority service", () => {
    const workspace = source("src/modules/classes/native-class-workspace.functions.ts");
    expect(workspace).toContain("getCanonicalCommandContext");
    expect(workspace).toContain("currentClassAuthority");
    expect(workspace).toContain("canonicalClassEnrollments");
  });
});
