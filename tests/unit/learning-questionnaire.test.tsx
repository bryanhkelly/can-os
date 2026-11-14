import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LearningQuestionnaire } from "@/components/learning/LearningQuestionnaire";
describe("shared learner question form",()=>{
  it("supports published choices, ratings and written responses with the same component",()=>{
    const html=renderToStaticMarkup(<LearningQuestionnaire
      title="Course feedback"
      questions={[
        {id:"q1",prompt:"How useful was this?",type:"rating",required:true,options:[],min:1,max:5},
        {id:"q2",prompt:"Choose a topic",type:"single_choice",required:true,
          options:[{id:"o1",label:"AI basics"}],min:null,max:null},
        {id:"q3",prompt:"Tell us more",type:"text",required:false,options:[],min:null,max:null},
      ]}
      onSubmit={vi.fn()}/>);
    expect(html).toContain("Course feedback");
    expect(html).toContain("How useful was this?");
    expect(html).toContain("AI basics");
    expect(html).toContain("Tell us more");
    expect(html).toContain('type="radio"');
    expect(html).toContain("Submit responses");
  });
  it("restores previously saved noncredit choices without rendering an answer key",()=>{
    const html=renderToStaticMarkup(<LearningQuestionnaire
      title="Recovered knowledge check"
      questions={[{id:"question-1",prompt:"Choose the best answer",
        type:"single_choice",required:true,min:null,max:null,
        options:[{id:"yes",label:"Continue"},{id:"no",label:"Stop"}]}]}
      initialAnswers={[{questionId:"question-1",optionIds:["yes"]}]}
      onSubmit={vi.fn()}/>);
    expect(html).toContain("Recovered knowledge check");
    expect(html).toMatch(/value="yes"[^>]*checked=""/);
    expect(html).not.toContain("correctOptionIds");
  });
});
