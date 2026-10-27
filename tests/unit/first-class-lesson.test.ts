import { describe,expect,it } from "vitest";
import { hasAccessibleFirstLesson,isLearnerFacingInstruction,requireAccessibleFirstLesson,FIRST_PUBLISHED_LESSON_ROUTE } from "@/domain/first-class-lesson";

const course=(lesson:Record<string,unknown>)=>({learning:{
 version:1,modules:[{id:"intro",title:"Introduction",lessons:[{
   id:"first",title:"First lesson",body:"",resources:[],...lesson,
 }]}],
}});
describe("first student accessible classroom lesson",()=>{
 it("never counts published shell without learner content",()=>{
  expect(hasAccessibleFirstLesson({})).toBe(false);
  expect(hasAccessibleFirstLesson({learning:{version:1,modules:[]}})).toBe(false);
  expect(hasAccessibleFirstLesson(course({}))).toBe(false);
  expect(()=>requireAccessibleFirstLesson(course({}))).toThrow("Publish at least one student-accessible instructional lesson before placing students into this class");
 });
 it("resolves the route-only first-lesson shortcut to actual published instruction",()=>{
  const lessons=[
   {id:"shell",body:" ",resources:[]},
   {id:"first-real",body:"Read and explore this topic.",resources:[]},
  ];
  expect(lessons.find(isLearnerFacingInstruction)?.id).toBe("first-real");
  expect(isLearnerFacingInstruction(lessons[0]!)).toBe(false);
  expect(FIRST_PUBLISHED_LESSON_ROUTE).not.toBe("first-real");
 });
 it("accepts an actual readable lesson or meaningful practice",()=>{
  expect(hasAccessibleFirstLesson(course({body:"Read and explain three causes."}))).toBe(true);
  expect(hasAccessibleFirstLesson(course({activities:[{
   id:"practice",kind:"guided_practice",title:"Practice",
   instructions:"Describe the relationship between the observations.",
  }]}))).toBe(true);
  expect(hasAccessibleFirstLesson(course({resources:[{
   id:"reader",title:"Open reading",url:"https://example.org/reading",
  }]}))).toBe(true);
 });
});
