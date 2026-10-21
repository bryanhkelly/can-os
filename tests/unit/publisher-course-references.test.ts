import { describe,it,expect } from "vitest";
import { assertPublisherLessonReference,publisherLessonChoices } from "@/domain/publisher-course-references";
import { classContentSchema } from "@/domain/class-content";
const published=classContentSchema.parse({
 version:1,syllabus:"Publisher Algebra I",
 modules:[{id:"algebra1-u01",title:"Unit One",lessons:[
  {id:"u01-d01",title:"Expressions",body:"Learn equivalent expressions.",resources:[]},
  {id:"u01-d02",title:"Equations",body:"Solve equations.",resources:[]},
 ]}],resources:[],
});
const source={learning:published,teacherGuides:{private:"do not expose"}};
describe("publisher content vs teacher classroom additions",()=>{
 it("lists actual lessons only from the published publisher release",()=>{
  expect(publisherLessonChoices(source,"published")).toEqual([
   {id:"u01-d01",title:"Expressions"},{id:"u01-d02",title:"Equations"},
  ]);
  expect(publisherLessonChoices(source,"draft")).toEqual([]);
 });
 it("rejects cross-course or merely planned lessons without modifying source",()=>{
  const before=JSON.stringify(source);
  expect(()=>assertPublisherLessonReference(source,"published","u01-d01")).not.toThrow();
  expect(()=>assertPublisherLessonReference(source,"published",undefined)).not.toThrow();
  for(const bad of ["week-02-planned","different-course","u01-d01/other"])
   expect(()=>assertPublisherLessonReference(source,"published",bad)).toThrow("currently published");
  expect(()=>assertPublisherLessonReference(source,"draft","u01-d01")).toThrow("currently published");
  expect(JSON.stringify(source)).toBe(before);
 });
});
