/** Deep links may request a child, but only server-authorized children can be selected. */
export function resolveGuardianChild<T extends {studentPersonId:string}>(
 students:readonly T[],requested:string|null|undefined,
):string {
 return students.find(student=>student.studentPersonId===requested)?.studentPersonId
  ??students[0]?.studentPersonId??"";
}
