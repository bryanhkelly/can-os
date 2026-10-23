/**
 * Daily onsite attendance reconciliation from the canonical scheduled roster.
 * A review of staff observation coverage, NOT student checkout, custody,
 * absence adjudication, site safety certification or a closed attendance book.
 */
export type ReconciliationProgram = {
  id: string;
  name: string;
  configuration: string;
  expectedDays: number;
  missingCalendarDates: number;
};
export type ReconciliationStudent = {
  studentProfileId: string;
  programId: string;
  studentName: string;
  status: string;
  attendanceEventId: string | null;
};
export type ReconciliationIssue = {
  kind: "unrecorded" | "invalid_record" | "configuration" | "duplicate";
  programId: string;
  studentProfileId: string | null;
  label: string;
};

const validMarks = new Set(["present","absent","tardy","excused"]);
export function deriveOnsiteDayReconciliation(
  programs: readonly ReconciliationProgram[],
  students: readonly ReconciliationStudent[],
) {
  const issues: ReconciliationIssue[] = [];
  const seen = new Set<string>();
  const byProgram = programs.map(program => {
    const members = students.filter(row => row.programId === program.id);
    const configurationReady = program.configuration === "configured" &&
      program.missingCalendarDates === 0 && program.expectedDays > 0;
    if (!configurationReady) issues.push({
      kind:"configuration",programId:program.id,studentProfileId:null,
      label:program.name+" — instructional calendar or schedule needs review",
    });
    let marked=0;
    let unrecorded=0;
    let invalid=0;
    for (const student of members) {
      const key=student.programId+":"+student.studentProfileId;
      if (!student.studentProfileId || seen.has(key)) {
        issues.push({kind:"duplicate",programId:program.id,
          studentProfileId:student.studentProfileId||null,
          label:student.studentName+" — duplicate or unidentified roster entry"});
        invalid++;
        continue;
      }
      seen.add(key);
      const hasRecord=!!student.attendanceEventId;
      if (validMarks.has(student.status) && hasRecord) marked++;
      else if (!hasRecord && (student.status==="unmarked" || student.status==="expected")) {
        unrecorded++;
        issues.push({kind:"unrecorded",programId:program.id,
          studentProfileId:student.studentProfileId,
          label:student.studentName+" — no onsite attendance observation recorded"});
      } else {
        invalid++;
        issues.push({kind:"invalid_record",programId:program.id,
          studentProfileId:student.studentProfileId,
          label:student.studentName+" — inconsistent attendance status or missing record"});
      }
    }
    return {programId:program.id,programName:program.name,
      configured:configurationReady,expectedEntries:members.length,
      markedEntries:marked,unrecordedEntries:unrecorded,
      invalidEntries:invalid};
  });
  const unknownProgramEntries=students.filter(row=>
    !programs.some(program=>program.id===row.programId));
  for (const student of unknownProgramEntries) {
    issues.push({kind:"invalid_record",programId:student.programId,
      studentProfileId:student.studentProfileId,
      label:student.studentName+" — roster entry outside selected program scope"});
  }
  const expectedEntries=students.length;
  const markedEntries=byProgram.reduce((sum,row)=>sum+row.markedEntries,0);
  const unrecordedEntries=byProgram.reduce((sum,row)=>sum+row.unrecordedEntries,0);
  const distinctStudentCount=new Set(students.map(row=>row.studentProfileId)
    .filter(Boolean)).size;
  const readyForAttendanceReview=programs.length>0 && expectedEntries>0 &&
    issues.length===0 && markedEntries===expectedEntries;
  return {
    programs:byProgram,expectedEntries,markedEntries,unrecordedEntries,
    distinctStudentCount,issues,readyForAttendanceReview,
    notReadyReason:!programs.length?"No scoped onsite programs"
      :!expectedEntries?"No scheduled roster entries"
      :issues.length?issues.length+" unresolved attendance or configuration issues"
      :null,
    note:"Review-ready means only that every scheduled student-program entry has a recorded attendance mark and calendar configuration. It does not close official attendance, verify absence reasons, confirm staff supervision or certify that a child was released.",
  };
}
