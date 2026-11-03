import {z} from "zod";
/** Preferences are deliberately presentation-only, never an authorization signal. */
export const studentDisplayPreferences=z.object({
  density:z.enum(["comfortable","compact"]).default("comfortable"),
  defaultStudentTab:z.enum(["today","courses","assignments","support"]).default("today"),
  reduceMotion:z.boolean().default(false),
  showCompletedAssignments:z.boolean().default(true)
}).strict();
export type StudentDisplayPreferences=z.infer<typeof studentDisplayPreferences>;
export const defaultStudentDisplayPreferences=studentDisplayPreferences.parse({});
export function studentHomePath(preferences:StudentDisplayPreferences){
 const paths={today:"/student",courses:"/student/courses",assignments:"/student/assignments",support:"/student/support"} as const;
 return paths[preferences.defaultStudentTab];
}
export function parseStudentDisplayPreferences(value:unknown):StudentDisplayPreferences{
 const result=studentDisplayPreferences.safeParse(value);
 return result.success?result.data:defaultStudentDisplayPreferences;
}
