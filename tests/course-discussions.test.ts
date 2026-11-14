import {describe,it,expect} from "vitest";import {discussionTree,isValidDiscussionPost,selectTeacherDiscussionThreads} from "../src/domain/course-discussions";
describe("course discussions",()=>{it("retains valid replies but drops dangling parents",()=>{const messages=[{id:"2",body:"Reply",authorLabel:"Demo",createdAt:"2026-10-15T12:01:00Z",parentMessageId:"1"},{id:"1",body:"Question",authorLabel:"Demo",createdAt:"2026-10-15T12:00:00Z",parentMessageId:null},{id:"3",body:"Other",authorLabel:"Demo",createdAt:"2026-10-15T12:02:00Z",parentMessageId:"missing"}];const result=discussionTree(messages);expect(result.map(x=>x.id)).toEqual(["1","2","3"]);expect(result[1].parentMessageId).toBe("1");expect(result[2].parentMessageId).toBeNull();});it("rejects blank and oversized posts",()=>{expect(isValidDiscussionPost(" ")).toBe(false);expect(isValidDiscussionPost("hello")).toBe(true);expect(isValidDiscussionPost("x".repeat(5001))).toBe(false);});});

describe("teacher discussion deep links",()=>{
 const threads=[
  {id:"one",sectionId:"algebra",curriculumLessonId:"lesson-1"},
  {id:"wide",sectionId:"algebra",curriculumLessonId:null},
  {id:"two",sectionId:"algebra",curriculumLessonId:"lesson-2"},
  {id:"other",sectionId:"science",curriculumLessonId:"lesson-1"},
 ];
 it("keeps only the selected Section and publisher lesson plus class-wide threads",()=>{
  expect(selectTeacherDiscussionThreads(threads,{section:"algebra",lesson:"lesson-1"}).map(x=>x.id)).toEqual(["one","wide"]);
 });
 it("respects direct thread selection without displaying a foreign class",()=>{
  expect(selectTeacherDiscussionThreads(threads,{section:"algebra",thread:"other"})).toEqual([]);
  expect(selectTeacherDiscussionThreads(threads,{section:"algebra",thread:"one"}).map(x=>x.id)).toEqual(["one"]);
 });
});
