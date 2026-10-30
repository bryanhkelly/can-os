import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { guardianApplicationSelection } from "@/domain/guardian-application-selection";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { WorkspaceNotice } from "@/components/workspace";
import { GuidedSetupShell, type GuidedSetupStep } from "@/components/workflow";

export interface GuardianApplicationProgram {
  id: string;
  name: string;
  schoolYears?: readonly { id: string; name: string }[];
}
export interface GuardianApplicationHousehold { id: string; name: string }
export interface GuardianApplicationStudent {
  studentProfileId: string;
  studentFirstName: string;
  studentLastName: string;
  gradeLevel: string;
  householdId: string;
}
export interface GuardianApplicationSubmission {
  requestId: string;
  programId: string;
  studentFirstName: string;
  studentLastName: string;
  gradeLevel: string;
  householdId?: string;
  schoolYearId?: string;
  studentProfileId?: string;
  familyStartRequestId?: string;
}

const setupSteps: readonly GuidedSetupStep[] = [
  { id: "application", title: "Application", description: "Student, household and program", status: "current" },
  { id: "verification", title: "Verification", description: "Independent guardian review", status: "upcoming" },
  { id: "requirements", title: "Requirements", description: "School-specific checklist", status: "upcoming" },
  { id: "decision", title: "Decision", description: "Authorized school review", status: "upcoming" },
];

export function GuardianApplicationForm({ programs, households, students = [], requestedProgramId,
  familyStartRequestId, onSubmit, onSubmitted }: {
  programs: readonly GuardianApplicationProgram[];
  households: readonly GuardianApplicationHousehold[];
  students?: readonly GuardianApplicationStudent[];
  requestedProgramId?: string;
  familyStartRequestId?: string;
  onSubmit: (input: GuardianApplicationSubmission) => Promise<{ applicationId: string }>;
  onSubmitted?: (applicationId: string) => Promise<void> | void;
}) {
  const id = useId();
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const requested = programs.find(item => item.id === requestedProgramId);
  const [programId, setProgramId] = useState(
    requestedProgramId ? requested?.id ?? "" : programs.length === 1 ? programs[0]!.id : "");

  const [schoolYearId, setSchoolYearId] = useState("");
  const selection = guardianApplicationSelection(programs, {
    requestedProgramId, familyStartRequestId, programId, schoolYearId,
  });
  const selectedProgram = selection.program;
  const [studentOptionId, setStudentOptionId] = useState("");
  const [studentProfileId, setStudentProfileId] = useState("");
  const [householdId, setHouseholdId] = useState(households[0]?.id ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [grade, setGrade] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (notice || error) feedbackRef.current?.focus();
  }, [notice, error]);

  function selectStudent(optionId: string) {
    setStudentOptionId(optionId);
    const student = students.find(item =>
      `${item.studentProfileId}:${item.householdId}` === optionId);
    setStudentProfileId(student?.studentProfileId ?? "");
    if (!student) {
      setFirstName(""); setLastName(""); setGrade("");
      return;
    }
    setHouseholdId(student.householdId);
    setFirstName(student.studentFirstName);
    setLastName(student.studentLastName);
    setGrade(student.gradeLevel);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!selectedProgram || !selection.year || selection.unavailable) {
      setError("Choose an available school and its configured academic year before submitting.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await onSubmit({
        requestId, programId: selectedProgram.id, studentFirstName: firstName,
        studentLastName: lastName, gradeLevel: grade,
        ...(householdId ? { householdId } : {}),
        schoolYearId: selection.year.id,
        ...(studentProfileId ? { studentProfileId } : {}),
        ...(familyStartRequestId ? { familyStartRequestId } : {}),
      });
      setNotice(`Application received (${result.applicationId}). Review its real school-managed status, checklist and offers here.`);
      setRequestId(crypto.randomUUID());
      setStudentProfileId(""); setStudentOptionId("");
      setFirstName("");
      setLastName("");
      setGrade("");
      try {
        await onSubmitted?.(result.applicationId);
      } catch {
        setError("Your application was saved, but its status could not be refreshed. Return to Your applications to continue; do not submit another application.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit application");
    } finally {
      setBusy(false);
    }
  }

  return <GuidedSetupShell title="Student application"
    description="Start one canonical application. You can return to this workspace for the school's independent verification and next steps."
    steps={setupSteps} aside={<div className="text-sm leading-6 text-muted-foreground">
      <h3 className="font-semibold text-foreground">What submission does</h3>
      <p className="mt-2">It creates an application and enrollment journey. A new guardian relationship remains pending independent verification.</p>
      <h3 className="mt-5 font-semibold text-foreground">What it does not do</h3>
      <p className="mt-2">It does not establish legal guardianship, accept an offer, activate enrollment or place a student into classes.</p>
    </div>}>
    {notice && <WorkspaceNotice ref={feedbackRef} tone="success" className="mb-5">{notice}</WorkspaceNotice>}
    {error && <WorkspaceNotice ref={feedbackRef} tone="danger" className="mb-5">{error}</WorkspaceNotice>}
    {selection.unavailable ? <WorkspaceNotice tone="danger">
      The school linked to this invitation is unavailable to this verified account.
      Contact that school's admissions team. No other school has been selected.
    </WorkspaceNotice> : programs.length === 0 ? <WorkspaceNotice>
      No eligible school is currently available to this verified family account. Contact the school's admissions team about your invitation and application opening.
    </WorkspaceNotice> : <form onSubmit={event => void submit(event)} aria-busy={busy} className="grid gap-5 sm:grid-cols-2">
      <fieldset disabled={busy} className="contents">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${id}-program`}>School and program</Label>
          <Select id={`${id}-program`} name="programId" required value={selectedProgram?.id ?? ""}
            onChange={event => { setProgramId(event.target.value); setSchoolYearId(""); setStudentProfileId(""); setStudentOptionId(""); }}>
            <option value="">Choose a school and program</option>
            {selection.programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${id}-year`}>Application academic year</Label>
          <Select id={`${id}-year`} name="schoolYearId" required value={selection.year?.id ?? ""}
            onChange={event => setSchoolYearId(event.target.value)}>
            <option value="">Select an academic year</option>
            {selectedProgram?.schoolYears?.map(year => <option key={year.id} value={year.id}>{year.name}</option>)}
          </Select>
          {!selectedProgram?.schoolYears?.length && <p className="text-xs text-muted-foreground">
            This school has not opened a configured academic year for family applications. Contact admissions.
          </p>}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${id}-student`}>Student identity</Label>
          <Select id={`${id}-student`} value={studentOptionId} onChange={event => selectStudent(event.target.value)}>
            <option value="">A new student</option>
            {students.map(student => <option key={`${student.studentProfileId}:${student.householdId}`}
              value={`${student.studentProfileId}:${student.householdId}`}>
              {student.studentFirstName} {student.studentLastName}
            </option>)}
          </Select>
          <p className="text-xs leading-5 text-muted-foreground">Existing students appear only through a verified managing relationship and shared household.</p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${id}-household`}>Family household</Label>
          <Select id={`${id}-household`} name="householdId" value={householdId} disabled={!!studentProfileId}
            aria-describedby={`${id}-household-hint`} onChange={event => setHouseholdId(event.target.value)}>
            <option value="">Create a new family household</option>
            {households.map(family => <option key={family.id} value={family.id}>{family.name}</option>)}
          </Select>
          <p id={`${id}-household-hint`} className="text-xs leading-5 text-muted-foreground">
            Reuse your household for siblings. The server verifies that you belong to the selected household.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-first-name`}>Student legal first name</Label>
          <Input id={`${id}-first-name`} name="studentFirstName" autoComplete="off" required maxLength={100}
            readOnly={!!studentProfileId} value={firstName} onChange={event => setFirstName(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-last-name`}>Student legal last name</Label>
          <Input id={`${id}-last-name`} name="studentLastName" autoComplete="off" required maxLength={100}
            readOnly={!!studentProfileId} value={lastName} onChange={event => setLastName(event.target.value)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${id}-grade`}>Entering grade level</Label>
          <Input id={`${id}-grade`} name="gradeLevel" required maxLength={10} value={grade}
            readOnly={!!studentProfileId} aria-describedby={`${id}-grade-hint`} placeholder="For example, 9"
            onChange={event => setGrade(event.target.value)} />
          <p id={`${id}-grade-hint`} className="text-xs leading-5 text-muted-foreground">Use the grade the student is applying to enter.</p>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="lg" disabled={busy || !selectedProgram || !selection.year || selection.unavailable} aria-busy={busy}>
            {busy && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {busy ? "Submitting application…" : "Submit application"}
          </Button>
        </div>
      </fieldset>
    </form>}
  </GuidedSetupShell>;
}

