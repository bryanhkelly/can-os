import {describe,it,expect} from "vitest";
import {defaultStudentDisplayPreferences,parseStudentDisplayPreferences,studentDisplayPreferences} from "../src/domain/student-display-preferences";
describe("student preferences",()=>{
 it("uses safe defaults for invalid or missing configuration",()=>{expect(parseStudentDisplayPreferences(null)).toEqual(defaultStudentDisplayPreferences);expect(parseStudentDisplayPreferences({density:"invalid"})).toEqual(defaultStudentDisplayPreferences);});
 it("rejects unknown keys and accepts supported values",()=>{expect(studentDisplayPreferences.safeParse({isAdmin:true}).success).toBe(false);expect(parseStudentDisplayPreferences({density:"compact",defaultStudentTab:"assignments",reduceMotion:true,showCompletedAssignments:false}).density).toBe("compact");});
});
