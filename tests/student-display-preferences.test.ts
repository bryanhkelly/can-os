import {describe,it,expect} from "vitest";
import {defaultStudentDisplayPreferences,parseStudentDisplayPreferences,studentDisplayPreferences,studentHomePath} from "../src/domain/student-display-preferences";
describe("student preferences",()=>{
 it("uses safe defaults for invalid or missing configuration",()=>{expect(parseStudentDisplayPreferences(null)).toEqual(defaultStudentDisplayPreferences);expect(parseStudentDisplayPreferences({density:"invalid"})).toEqual(defaultStudentDisplayPreferences);});
 it("rejects unknown keys and accepts supported values",()=>{expect(studentDisplayPreferences.safeParse({isAdmin:true}).success).toBe(false);expect(parseStudentDisplayPreferences({density:"compact",defaultStudentTab:"assignments",reduceMotion:true,showCompletedAssignments:false}).density).toBe("compact");});
 it.each([["today","/home"],["courses","/student/courses"],["assignments","/student/assignments"],["support","/student/support"]] as const)("opens the configured %s section through a fixed product route",(tab,path)=>{
  expect(studentHomePath({...defaultStudentDisplayPreferences,defaultStudentTab:tab})).toBe(path);
 });
});
