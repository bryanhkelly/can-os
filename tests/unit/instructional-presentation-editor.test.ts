import {describe,expect,it} from "vitest";
import {addSupplementalPresentation,removePresentation,replacePrimaryPresentation,unresolvedPresentationCount} from "@/domain/instructional-presentation-editor";
const source={courseLessonId:"lesson",assetVersionId:"old",presentationKind:"supplement" as const,ordinal:2,accessibilityNotes:{reviewRequired:true}};
describe("instructional presentation editor",()=>{
 it("removes only the targeted supplemental binding without changing others",()=>{
  const other={...source,courseLessonId:"other"};
  expect(removePresentation([source,other],source)).toEqual([other]);
 });
 it("adds a supplemental selection without overwriting existing bindings or duplicating",()=>{
  const added=addSupplementalPresentation([source],"lesson","new");
  expect(added).toHaveLength(2);
  expect(added[1]).toMatchObject({presentationKind:"supplement",ordinal:1,assetVersionId:"new"});
  expect(addSupplementalPresentation(added,"lesson","new")).toEqual(added);
 });
 it("preserves supplements when changing primary and detects unresolved references",()=>{
  const added=replacePrimaryPresentation([source],"lesson","new");
  expect(added).toHaveLength(2);
  expect(unresolvedPresentationCount(added,new Set(["new"]))).toBe(1);
  expect(replacePrimaryPresentation(added,"lesson","")).toEqual([source]);
 });
});
