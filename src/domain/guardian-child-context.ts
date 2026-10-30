/** Deep links may request a child, but only server-authorized children can be selected. */
export function resolveGuardianChild<T extends {studentPersonId:string}>(
 students:readonly T[],requested:string|null|undefined,
):string {
 if(requested)return students.find(student=>student.studentPersonId===requested)?.studentPersonId??"";
 return students[0]?.studentPersonId??"";
}
