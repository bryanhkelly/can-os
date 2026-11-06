import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { LaunchDraftButton } from "@/components/launch-studio/LaunchDraftButton";
import type { LaunchDraftRecord } from "@/domain/launch-draft";
import { guardianApplicationSelection } from "@/domain/guardian-application-selection";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { WorkspaceNotice } from "@/components/workspace";
import { GuidedSetupShell, type GuidedSetupStep } from "@/components/workflow";
import { useLaunchDraftChanges, LaunchUnsavedChangesGuard } from "@/components/launch-studio/useLaunchUnsavedChanges";
import { LaunchFieldHelp } from "@/components/launch-studio/LaunchFieldHelp";

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
  familyStartRequestId, onSubmit, onSubmitted, embedded = false, draft, draftContext, restoreDraft = true }: {
  restoreDraft?: boolean;
  embedded?: boolean;
  draft?: LaunchDraftRecord | null;
  draftContext?: string;
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
  const saved = restoreDraft && draft?.value.audience === "family" ? draft.value.fields : undefined;
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const requested = programs.find(item => item.id === requestedProgramId);
  const [programId, setProgramId] = useState(
    requestedProgramId ? requested?.id ?? "" : saved?.programId ?? (programs.length === 1 ? programs[0]!.id : ""));
  const [schoolYearId, setSchoolYearId] = useState(saved?.schoolYearId ?? "");
  const [previousRequestedProgramId, setPreviousRequestedProgramId] = useState(requestedProgramId);
  if (previousRequestedProgramId !== requestedProgramId) {
    setPreviousRequestedProgramId(requestedProgramId);
    if (requestedProgramId) {
      setProgramId(requested?.id ?? "");
      setSchoolYearId("");
    }
  }

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
  const initialStudent = linkedStudent ?? students.find(student =>
    `${student.studentProfileId}:${student.householdId}` === saved?.studentOptionId);
  const [unavailableDraftStudent, setUnavailableDraftStudent] = useState(Boolean(saved?.studentOptionId && !initialStudent));
  const [studentOptionId, setStudentOptionId] = useState(
    initialStudent ? initialStudent.studentProfileId+":"+initialStudent.householdId : "");
  const [studentProfileId, setStudentProfileId] = useState(initialStudent?.studentProfileId??"");
  const [originTransferActionId,setOriginTransferActionId] = useState(linkedStudent?linkedTransfer?.id??"":"");
  const [confirmedDestination,setConfirmedDestination] = useState(false);
  const [authorizedDestinationRecords,setAuthorizedDestinationRecords] = useState(false);
  const [householdId, setHouseholdId] = useState(initialStudent?.householdId ??
    (households.some(item => item.id === saved?.householdId) ? saved!.householdId : households[0]?.id) ?? "");
  const [firstName, setFirstName] = useState(initialStudent?.studentFirstName??saved?.firstName??"");
  const [lastName, setLastName] = useState(initialStudent?.studentLastName??saved?.lastName??"");
  const [grade, setGrade] = useState(initialStudent?.gradeLevel??saved?.grade??"");
  const [requestId, setRequestId] = useState(() => saved?.requestId ?? crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const submitted = useRef(false);
  const draftFields = { requestId, programId, schoolYearId, studentOptionId, householdId, firstName, lastName, grade };
  const changes = useLaunchDraftChanges(draftFields);

  useEffect(() => {
    if (notice || error) feedbackRef.current?.focus();
  }, [notice, error]);

  function selectStudent(optionId: string) {
    setUnavailableDraftStudent(false);
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
    setAttempted(true);
    if (unavailableDraftStudent) {
      setError("The student selected in this draft is no longer available to your verified household. Contact admissions before continuing.");
      return;
    }
    if(linkedTransfer&&!linkedStudent){
      setError("This transfer requires the student's existing verified household identity. Contact admissions rather than creating a second student.");
      return;
    }
    if (!selectedProgram || !selection.year || selection.unavailable || !firstName.trim() || !lastName.trim() || !grade.trim() ||
      selectedTransfer&&(!confirmedDestination||!authorizedDestinationRecords)) return;
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
      submitted.current = true;
      setAttempted(false);
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
      setError(mutationErrorMessage(cause, "Unable to submit application"));
    } finally {
      setBusy(false);
    }
  }

  const content = <>
    {embedded && <LaunchUnsavedChangesGuard dirty={() => !submitted.current &&
      (changes.dirty || busy || confirmedDestination || authorizedDestinationRecords)} />}
    {unavailableDraftStudent && <WorkspaceNotice tone="danger" className="mb-5">
      The student selected in this draft is no longer available to your verified household.
      No new student identity will be created from their draft details. Contact admissions to restore access.
      <Button type="button" variant="outline" className="mt-3" onClick={() => {
        selectStudent("");
        setRequestId(crypto.randomUUID());
      }}>Start a different student's application</Button>
    </WorkspaceNotice>}
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
    </WorkspaceNotice> : <form noValidate onSubmit={event => void submit(event)} onChange={() => { submitted.current = false; }}
      aria-busy={busy} className="grid gap-5 sm:grid-cols-2">
      <fieldset disabled={busy} className="contents">
        <Field label="School or offering" className="sm:col-span-2" required
          error={attempted&&!selectedProgram?"Choose an available school and program.":undefined}>
          <Select id={`${id}-program`} name="programId" value={selectedProgram?.id ?? ""}
            onChange={event => { setProgramId(event.target.value); setSchoolYearId(""); setStudentProfileId(""); setStudentOptionId(""); setOriginTransferActionId("");setConfirmedDestination(false); }}>
            <option value="">Choose a school or offering</option>
            {selection.programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
          </Select>
        </Field>
        <Field label="School year" className="sm:col-span-2" required
          description={!selectedProgram?.schoolYears?.length?"This school has not opened a configured academic year for family applications. Contact admissions.":undefined}
          error={attempted&&!selection.year?"Choose a configured academic year for this school.":undefined}>
          <Select id={`${id}-year`} name="schoolYearId" value={selection.year?.id ?? ""}
            onChange={event => setSchoolYearId(event.target.value)}>
            <option value="">Select an academic year</option>
            {selectedProgram?.schoolYears?.map(year => <option key={year.id} value={year.id}>{year.name}</option>)}
          </Select>
        </Field>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${id}-student`}>Who are you applying for?</Label>
          <Select id={`${id}-student`} value={studentOptionId} disabled={!!linkedTransfer}
            onChange={event => selectStudent(event.target.value)}>
            <option value="">A new student</option>
            {students.map(student => <option key={`${student.studentProfileId}:${student.householdId}`}
              value={`${student.studentProfileId}:${student.householdId}`}>
              {student.studentFirstName} {student.studentLastName}
            </option>)}
          </Select>
          <LaunchFieldHelp label="Why isn't my child listed?">Only students linked to your verified household appear here. If an existing child is missing, ask admissions for help instead of creating another record.</LaunchFieldHelp>
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
            <Field label="I confirm that the selected Program is the school I am applying to for this transfer. I understand that the origin-school request does not grant admission to the new school."
              required error={attempted&&!confirmedDestination?"Confirm the receiving school for this transfer.":undefined}>
              <Checkbox checked={confirmedDestination} onChange={event=>setConfirmedDestination(event.target.checked)}/>
            </Field>
            <Field label="I authorize the official transcript from my child's originating CAN school to be made available to this specifically selected receiving-school Program for admissions and academic placement, after the issuing records office has completed its authorized transfer. This does not authorize other schools or grant access to medical, custody or safeguarding records."
              required error={attempted&&!authorizedDestinationRecords?"Authorize records release to this receiving-school Program.":undefined}>
              <Checkbox checked={authorizedDestinationRecords} onChange={event=>setAuthorizedDestinationRecords(event.target.checked)}/>
            </Field>
          </>}
        </div>}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${id}-household`}>Your family</Label>
          <Select id={`${id}-household`} name="householdId" value={householdId} disabled={!!studentProfileId}
            aria-describedby={`${id}-household-hint`} onChange={event => setHouseholdId(event.target.value)}>
            <option value="">Create a new family household</option>
            {households.map(family => <option key={family.id} value={family.id}>{family.name}</option>)}
          </Select>
          <p id={`${id}-household-hint`} className="text-xs leading-5 text-muted-foreground">
            Choose the same family for siblings. Only families linked to your account can be used.
          </p>
        </div>
        <Field label="Student legal first name" required error={attempted&&!firstName.trim()?"Enter the student's legal first name.":undefined}>
          <Input id={`${id}-first-name`} name="studentFirstName" autoComplete="off" required maxLength={100}
            readOnly={!!studentProfileId} value={firstName} onChange={event => setFirstName(event.target.value)} />
        </Field>
        <Field label="Student legal last name" required error={attempted&&!lastName.trim()?"Enter the student's legal last name.":undefined}>
          <Input id={`${id}-last-name`} name="studentLastName" autoComplete="off" required maxLength={100}
            readOnly={!!studentProfileId} value={lastName} onChange={event => setLastName(event.target.value)} />
        </Field>
        <Field label="Entering grade level" className="sm:col-span-2" required
          description="Use the grade the student is applying to enter."
          error={attempted&&!grade.trim()?"Enter the grade the student is applying to enter.":undefined}>
          <Input id={`${id}-grade`} name="gradeLevel" required maxLength={10} value={grade}
            readOnly={!!studentProfileId} placeholder="For example, 9"
            onChange={event => setGrade(event.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          {draftContext !== undefined && <LaunchDraftButton initial={draft ?? null}
            selection={{ audience: "family", context: draftContext }} disabled={busy || unavailableDraftStudent}
            onSaved={value => { if (value.audience === "family") changes.markSaved(value.fields); }}
            value={() => ({ audience: "family", fields: { requestId, programId, schoolYearId,
              studentOptionId, householdId, firstName, lastName, grade } })} />}
          <Button type="submit" size="lg" disabled={busy || unavailableDraftStudent || selection.unavailable || !!linkedTransfer&&!linkedStudent} aria-busy={busy}>
            {busy && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {busy ? "Submitting application…" : "Submit application"}
          </Button>
        </div>
      </fieldset>
    </form>}
  </>;
  return embedded ? <section className="border bg-card p-5">
    <p className="mb-5 text-sm text-muted-foreground">Save draft keeps your entries. Submit application sends them to the school for review.</p>
    {content}</section> :
    <GuidedSetupShell title="Student application"
      description="Start one canonical application. Return here for independent verification and next steps."
      steps={setupSteps} aside={<p className="text-sm leading-6 text-muted-foreground">
        Submission does not establish legal guardianship, accept an offer, activate enrollment or place a student into classes.
      </p>}>{content}</GuidedSetupShell>;
}
