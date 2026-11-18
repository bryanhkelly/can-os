import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => children }));
import { renderToStaticMarkup } from "react-dom/server";
import { GradebookScoringEditor } from "./GradebookScoringEditor";
import type { getGradebook } from "@/modules/learning/gradebook.functions";

type Assessment=Awaited<ReturnType<typeof getGradebook>>["assessments"][number];
const sample={rubric:[],pointsPossible:"10",title:"Quiz"} as unknown as Assessment;

describe("GradebookScoringEditor",()=>{
 it("provides numeric entry and separate draft and posted-grade actions",()=>{
  const html=renderToStaticMarkup(<GradebookScoringEditor assessment={sample}
   score="" comment="" rubricInputs={{}} busy={false} sectionId="section-id" liveTotal={null}
   onScoreChange={()=>{}} onCommentChange={()=>{}} onRubricChange={()=>{}}
   onSaveDraft={()=>{}} onPostGrade={()=>{}}/>);
  expect(html).toContain("Save grading draft");
  expect(html).toContain("Post grade");
  expect(html).toContain('type="number"');
  expect(html).toMatch(/<label[^>]*for="[^"]+"[^>]*>Score/);
  expect(html).toMatch(/<label[^>]*for="[^"]+"[^>]*>Feedback comment/);
  expect(html).toContain("Saving a draft does not release feedback.");
  expect(html).toContain("Close review");
 });
 it("disables inputs and grading commands while saving",()=>{
  const html=renderToStaticMarkup(<GradebookScoringEditor assessment={sample}
   score="8" comment="Good reasoning" rubricInputs={{}} busy={true} sectionId="section-id" liveTotal={null}
   onScoreChange={()=>{}} onCommentChange={()=>{}} onRubricChange={()=>{}}
   onSaveDraft={()=>{}} onPostGrade={()=>{}}/>);
  expect(html).toMatch(/<input[^>]*disabled=""/);
  expect(html).toMatch(/<textarea[^>]*disabled=""/);
  expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(4);
 });
});
