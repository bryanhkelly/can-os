import { describe, expect, it } from "vitest";
import { validateCourseSurveyAnswers } from "@/domain/course-survey";
const questions=[
 {id:"useful",type:"rating" as const,required:true,options:[],min:1,max:5},
 {id:"topics",type:"multiple_choice" as const,required:true,options:[{id:"ai"},{id:"security"}],min:null,max:null},
 {id:"comment",type:"text" as const,required:false,options:[],min:null,max:null},
];
describe("reusable versioned survey answers",()=>{
 it("accepts valid rated, selected and optional textual responses",()=>{
   expect(validateCourseSurveyAnswers(questions,[
     {questionId:"useful",number:5},
     {questionId:"topics",optionIds:["ai","security"]},
     {questionId:"comment",text:"More classes, please"},
   ])).toHaveLength(3);
 });
 it("requires published-question membership and required answers",()=>{
   expect(()=>validateCourseSurveyAnswers(questions,[{questionId:"topics",optionIds:["ai"]}])).toThrow();
   expect(()=>validateCourseSurveyAnswers(questions,[{questionId:"unpublished",number:1}])).toThrow();
   expect(()=>validateCourseSurveyAnswers(questions,[{questionId:"useful",number:5},{questionId:"topics",optionIds:["other"]}])).toThrow();
 });
 it("rejects duplicate choices, ambiguous answers and unsupported matrix",()=>{
   expect(()=>validateCourseSurveyAnswers(questions,[{questionId:"useful",number:5},{questionId:"topics",optionIds:["ai","ai"]}])).toThrow();
   expect(()=>validateCourseSurveyAnswers(questions,[{questionId:"useful",number:5,text:"five"},{questionId:"topics",optionIds:["ai"]}])).toThrow();
   expect(()=>validateCourseSurveyAnswers([{id:"grid",type:"matrix",required:true,options:[],min:null,max:null}],[])).toThrow();
 });
});
