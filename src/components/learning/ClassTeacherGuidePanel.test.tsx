import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClassTeacherGuidePanel } from "./ClassTeacherGuidePanel";

describe("private teacher guide presentation", () => {
  it("distinguishes missing published guide from public lesson materials", () => {
    const html=renderToStaticMarkup(<ClassTeacherGuidePanel
      teacherGuides={null} content={null}/>);
    expect(html).toContain("Teacher guide not published");
    expect(html).toContain("no private teacher guide");
  });
  it("labels answer keys as non-learner-facing teacher review content", () => {
    const guides={units:[{
      unitId:"unit-1",reviewStatus:"teacher_review",
      teacherOverview:"Preparation summary",
      lessons:[{lessonId:"lesson-1",preparation:"Plan materials",
        workedAnswers:[{prompt:"Question",answer:"Instructor answer"}],
        misconceptions:[],interventions:[],extensions:[]}],
      assessments:[{assessmentKey:"a-1",title:"Answer guide",
        answerGuide:[{item:1,correctResponse:"Answer",evidenceToLookFor:"Reasoning"}],
        scoringNotes:"Internal scoring"}],
    }]} as unknown as Parameters<typeof ClassTeacherGuidePanel>[0]["teacherGuides"];
    const html=renderToStaticMarkup(<ClassTeacherGuidePanel
      teacherGuides={guides} content={null}/>);
    expect(html).toContain("not student-facing instructional content");
    expect(html).toContain("Worked solutions");
    expect(html).toContain("Instructor answer");
  });
});
