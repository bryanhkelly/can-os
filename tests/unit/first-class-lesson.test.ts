import { describe,expect,it } from "vitest";
import { hasAccessibleFirstLesson,requireAccessibleFirstLesson } from "@/domain/first-class-lesson";

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
  expect(()=>requireAccessibleFirstLesson(course({}))).toThrow("first");
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
