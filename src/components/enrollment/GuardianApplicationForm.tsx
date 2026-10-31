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
  originTransferActionId?: string;
  confirmedTransferDestination?: true;
  destinationRecordsReleaseAuthorized?: true;
}

export interface GuardianApplicationTransferRequest {
  id:string;
  studentProfileId:string;
  originProgramId:string|null;
  originSchoolName:string;
  destinationSchoolName:string;
  destinationFamilyStartRequestId:string|null;
  destinationFamilyStartProgramId:string|null;
  originExited:boolean;
}

const setupSteps: readonly GuidedSetupStep[] = [
  { id: "application", title: "Application", description: "Student, household and program", status: "current" },
  { id: "verification", title: "Verification", description: "Independent guardian review", status: "upcoming" },
  { id: "requirements", title: "Requirements", description: "School-specific checklist", status: "upcoming" },
  { id: "decision", title: "Decision", description: "Authorized school review", status: "upcoming" },
];

export function GuardianApplicationForm({ programs, households, students = [], transferRequests = [], requestedProgramId,
  familyStartRequestId, onSubmit, onSubmitted }: {
  programs: readonly GuardianApplicationProgram[];
  households: readonly GuardianApplicationHousehold[];
  students?: readonly GuardianApplicationStudent[];
  transferRequests?: readonly GuardianApplicationTransferRequest[];
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
  // A redeemed transfer email binds the real receiving Program and original
  // parent-owned transfer Action. Preselect the SAME verified student Person;
  // never create a duplicate child to continue this journey.
  const linkedTransfer = familyStartRequestId && requestedProgramId
    ? transferRequests.find(transfer =>
        transfer.destinationFamilyStartRequestId===familyStartRequestId &&
        transfer.destinationFamilyStartProgramId===requestedProgramId)
    : undefined;
  const linkedStudent = linkedTransfer
    ? students.find(student => student.studentProfileId===linkedTransfer.studentProfileId)
    : undefined;
  const [studentOptionId, setStudentOptionId] = useState(
    linkedStudent ? linkedStudent.studentProfileId+":"+linkedStudent.householdId : "");
  const [studentProfileId, setStudentProfileId] = useState(linkedStudent?.studentProfileId??"");
  const [originTransferActionId,setOriginTransferActionId] = useState(linkedStudent?linkedTransfer?.id??"":"");
  const [confirmedDestination,setConfirmedDestination] = useState(false);
  const [authorizedDestinationRecords,setAuthorizedDestinationRecords] = useState(false);
  const [householdId, setHouseholdId] = useState(linkedStudent?.householdId??households[0]?.id??"");
  const [firstName, setFirstName] = useState(linkedStudent?.studentFirstName??"");
  const [lastName, setLastName] = useState(linkedStudent?.studentLastName??"");
  const [grade, setGrade] = useState(linkedStudent?.gradeLevel??"");
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
    setOriginTransferActionId("");setConfirmedDestination(false);setAuthorizedDestinationRecords(false);
    if (!student) {
      setFirstName(""); setLastName(""); setGrade("");
      return;
    }
    setHouseholdId(student.householdId);
    setFirstName(student.studentFirstName);
    setLastName(student.studentLastName);
    setGrade(student.gradeLevel);
  }

  const availableTransfers=transferRequests.filter(transfer=>
    transfer.studentProfileId===studentProfileId&&transfer.originProgramId!==selectedProgram?.id);
  const selectedTransfer=availableTransfers.find(transfer=>transfer.id===originTransferActionId);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if(linkedTransfer&&!linkedStudent){
      setError("This transfer requires the student's existing verified household identity. Contact admissions rather than creating a second student.");
      return;
    }
    if (!selectedProgram || !selection.year || selection.unavailable) {
      setError("Choose an available school and its configured academic year before submitting.");
      return;
    }
    if(selectedTransfer&&(!confirmedDestination||!authorizedDestinationRecords)){
      setError("Confirm that you selected the intended destination school before linking this transfer.");
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
        ...(selectedTransfer ? {originTransferActionId:selectedTransfer.id,
          confirmedTransferDestination:true as const,
          destinationRecordsReleaseAuthorized:true as const} : {}),
        ...(familyStartRequestId ? { familyStartRequestId } : {}),
      });
      setNotice(`Application received (${result.applicationId}). Review its real school-managed status, checklist and offers here.`);
      setRequestId(crypto.randomUUID());
      setStudentProfileId(""); setStudentOptionId("");
      setOriginTransferActionId("");setConfirmedDestination(false);setAuthorizedDestinationRecords(false);
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
    {linkedTransfer&&!linkedStudent&&<WorkspaceNotice tone="danger" className="mb-5">
      This verified receiving-school invitation belongs to an existing student transfer,
      but the student's household membership cannot be matched. Contact admissions to
      reconcile the verified household. Do not create a second student identity.
    </WorkspaceNotice>}
    {linkedTransfer&&linkedStudent&&<WorkspaceNotice tone="info" className="mb-5">
      Your receiving-school email is linked to the transfer for {linkedStudent.studentFirstName}
      {" "}{linkedStudent.studentLastName}. Their existing verified student and household
      are preselected. Confirm the receiving school before submitting.
    </WorkspaceNotice>}
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
            onChange={event => { setProgramId(event.target.value); setSchoolYearId(""); setStudentProfileId(""); setStudentOptionId(""); setOriginTransferActionId("");setConfirmedDestination(false); }}>
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
          <Select id={`${id}-student`} value={studentOptionId} disabled={!!linkedTransfer}
            onChange={event => selectStudent(event.target.value)}>
            <option value="">A new student</option>
            {students.map(student => <option key={`${student.studentProfileId}:${student.householdId}`}
              value={`${student.studentProfileId}:${student.householdId}`}>
              {student.studentFirstName} {student.studentLastName}
            </option>)}
          </Select>
          <p className="text-xs leading-5 text-muted-foreground">Existing students appear only through a verified managing relationship and shared household.</p>
          {transferRequests.length>0&&<p role="status" className="mt-2 rounded-lg border p-3 text-sm">
            Transferring an existing student? Select that student above instead of creating a new student identity. After selecting the student, link the original transfer request below.
          </p>}
        </div>
        {availableTransfers.length>0&&studentProfileId&&<div className="space-y-3 rounded-xl border p-4 sm:col-span-2">
          <Label htmlFor={`${id}-transfer`}>Connecting a move from another school?</Label>
          <Select id={`${id}-transfer`} value={originTransferActionId}
            onChange={event=>{setOriginTransferActionId(event.target.value);setConfirmedDestination(false);setAuthorizedDestinationRecords(false);}}>
            <option value="">No, this is a regular application</option>
            {availableTransfers.map(transfer=><option key={transfer.id} value={transfer.id}>
              From {transfer.originSchoolName} to {transfer.destinationSchoolName}
              {transfer.originExited?" · origin exit completed":" · origin exit pending"}
            </option>)}
          </Select>
          {selectedTransfer&&<>
            <p className="text-sm">Your transfer request names <strong>{selectedTransfer.destinationSchoolName}</strong>.
              This application is for <strong>{selectedProgram?.name}</strong>. It will remain subject to this school's
              admissions decision, seat capacity and a separately accepted offer.</p>
            {!selectedTransfer.originExited&&<WorkspaceNotice tone="info">
              Your original school has not yet completed the official exit. Destination enrollment activation will wait for that decision.
            </WorkspaceNotice>}
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={confirmedDestination}
                onChange={event=>setConfirmedDestination(event.target.checked)} className="mt-1" required />
              <span>I confirm that the selected Program is the school I am applying to for this transfer.
                I understand that the origin-school request does not grant admission to the new school.</span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={authorizedDestinationRecords} required
                onChange={event=>setAuthorizedDestinationRecords(event.target.checked)} className="mt-1"/>
              <span>I authorize the official transcript from my child's originating CAN school to be made available
                to this specifically selected receiving-school Program for admissions and academic placement,
                after the issuing records office has completed its authorized transfer. This does not authorize
                other schools or grant access to medical, custody or safeguarding records.</span>
            </label>
          </>}
        </div>}
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
          <Button type="submit" size="lg" disabled={busy || !selectedProgram || !selection.year || selection.unavailable || !!linkedTransfer&&!linkedStudent || !!selectedTransfer&&(!confirmedDestination||!authorizedDestinationRecords)} aria-busy={busy}>
            {busy && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {busy ? "Submitting application…" : "Submit application"}
          </Button>
        </div>
      </fieldset>
    </form>}
  </GuidedSetupShell>;
}

