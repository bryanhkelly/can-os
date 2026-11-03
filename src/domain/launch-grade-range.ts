/** Compare only supported UI grades, preserving other existing Program vocabularies. */
const launchGradeSequence = ["TK","K","1","2","3","4","5","6","7","8","9","10","11","12"] as const;

export function launchGradeRangeIsOrdered(range:{min:string;max:string}):boolean {
  const start=launchGradeSequence.indexOf(range.min as typeof launchGradeSequence[number]);
  const end=launchGradeSequence.indexOf(range.max as typeof launchGradeSequence[number]);
  return start!==-1 && end!==-1 && start<=end;
}
