import {describe,expect,it} from "vitest";
import {schoolCourseOutline} from "@/domain/school-course-outline";

describe("school curriculum discovery previews",()=>{
 it("exposes course structure but never restricted publisher guide or full lesson text",()=>{
  const secret="PRIVATE_PUBLISHER_ANSWER_42";
  const raw={
   learning:{version:1,syllabus:"Public course summary",modules:[{
    id:"unit1",title:"Equations",lessons:[{
     id:"lesson1",title:"Solve linear equations",
     body:"Copyrighted full publisher instructional lesson content.",resources:[],
     activities:[{id:"secret-work",kind:"guided_practice",title:"Guided",
       instructions:"Private exercise full instructions"}],
    }],
   }],resources:[]},
   teacherGuides:{units:[{workedAnswers:[{answer:secret}]}]},
  };
  const output=schoolCourseOutline(raw);
  expect(output).toMatchObject({moduleCount:1,lessonCount:1,
   modules:[{id:"unit1",title:"Equations",lessonTitles:["Solve linear equations"]}]});
  expect(JSON.stringify(output)).not.toContain(secret);
  expect(JSON.stringify(output)).not.toContain("Copyrighted full");
  expect(JSON.stringify(output)).not.toContain("Private exercise");
 });
 it("rejects missing or malformed publisher learning content",()=>{
  expect(schoolCourseOutline({})).toBeNull();
  expect(schoolCourseOutline({learning:{version:99,modules:[]}})).toBeNull();
 });
 it("bounds long course summaries and high-unit previews",()=>{
  const modules=Array.from({length:27},(_,i)=>({
   id:"u"+i,title:"Unit "+i,
   lessons:Array.from({length:8},(_,j)=>({id:`u${i}l${j}`,title:"Lesson "+j,
    body:"lesson",resources:[]})),
  }));
  const output=schoolCourseOutline({learning:{version:1,syllabus:"a".repeat(400),modules,resources:[]}});
  expect(output?.syllabusSummary.length).toBe(240);
  expect(output?.moduleCount).toBe(27);
  expect(output?.lessonCount).toBe(216);
  expect(output?.modules).toHaveLength(24);
  expect(output?.modules[0]?.lessonTitles).toHaveLength(5);
  expect(output?.outlineTruncated).toBe(true);
 });
});
