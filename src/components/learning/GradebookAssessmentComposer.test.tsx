import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GradebookAssessmentComposer, emptyAssessmentContentInput } from "./GradebookAssessmentComposer";

const noop=()=>{};
const base={
 timezone:"America/Los_Angeles",title:"Practice quiz",points:"10",due:"",releaseAt:"",closeAt:"",
 assignmentKind:"quiz" as const,curriculumLessonId:"",maxAttempts:"",instructions:"",
 newRubric:[],publishConfirmed:false,busy:false,lessons:[],content:emptyAssessmentContentInput,
 onTitleChange:noop,onPointsChange:noop,onDueChange:noop,onReleaseChange:noop,onCloseChange:noop,
 onKindChange:noop,onLessonChange:noop,onAttemptsChange:noop,onInstructionsChange:noop,
 onRubricChange:noop,onPublishConfirmedChange:noop,onSubmit:noop,onContentChange:noop,
};

describe("GradebookAssessmentComposer",()=>{
 it("keeps publishing disabled without due date and confirmation",()=>{
  const html=renderToStaticMarkup(<GradebookAssessmentComposer {...base}/>);
  expect(html).toContain("Saving a draft never assigns work");
  expect(html).toContain("Times use your class timezone (America/Los_Angeles)");
  expect(html).toMatch(/disabled=""[^>]*>Publish &amp; assign/);
 });
 it("allows publishing only with due date and explicit confirmation",()=>{
  const html=renderToStaticMarkup(<GradebookAssessmentComposer {...base} due="2026-11-05" publishConfirmed/>);
  expect(html).toContain(">Publish &amp; assign</button>");
  expect(html).not.toMatch(/disabled=""[^>]*>Publish &amp; assign/);
 });
});
