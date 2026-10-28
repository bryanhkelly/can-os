import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { WorkspaceNotice } from "@/components/workspace";
import { GuidedSetupShell, type GuidedSetupStep } from "@/components/workflow";

export interface GuardianApplicationProgram { id: string; name: string }
export interface GuardianApplicationHousehold { id: string; name: string }
export interface GuardianApplicationSubmission {
  requestId: string;
  programId: string;
  studentFirstName: string;
  studentLastName: string;
  gradeLevel: string;
  householdId?: string;
}

const setupSteps: readonly GuidedSetupStep[] = [
  { id: "application", title: "Application", description: "Student, household and program", status: "current" },
  { id: "verification", title: "Verification", description: "Independent guardian review", status: "upcoming" },
  { id: "requirements", title: "Requirements", description: "School-specific checklist", status: "upcoming" },
  { id: "decision", title: "Decision", description: "Authorized school review", status: "upcoming" },
];

export function GuardianApplicationForm({ programs, households, requestedProgramId, onSubmit, onSubmitted }: {
  programs: readonly GuardianApplicationProgram[];
  households: readonly GuardianApplicationHousehold[];
  requestedProgramId?: string;
  onSubmit: (input: GuardianApplicationSubmission) => Promise<{ applicationId: string }>;
  onSubmitted?: () => Promise<void> | void;
}) {
  const id = useId();
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const requested = programs.find(item => item.id === requestedProgramId);
  const [programId, setProgramId] = useState(requested?.id ?? programs[0]?.id ?? "");
  useEffect(() => {
    if (requestedProgramId && programs.some(program => program.id === requestedProgramId)) {
      setProgramId(requestedProgramId);
    }
  }, [requestedProgramId, programs]);
  const [householdId, setHouseholdId] = useState(households[0]?.id ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [grade, setGrade] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function focusFeedback() {
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await onSubmit({
        requestId, programId, studentFirstName: firstName,
        studentLastName: lastName, gradeLevel: grade,
        ...(householdId ? { householdId } : {}),
      });
      setNotice(`Application received (${result.applicationId}). The school must independently verify your guardian relationship before forms, offers and academic access are enabled.`);
      setRequestId(crypto.randomUUID());
      setFirstName("");
      setLastName("");
      setGrade("");
      focusFeedback();
      await onSubmitted?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit application");
      focusFeedback();
    } finally {
      setBusy(false);
    }
  }

  return <GuidedSetupShell title="New student application"
    description="Start one canonical application. You can return to this workspace for the school's independent verification and next steps."
    steps={setupSteps} aside={<div className="text-sm leading-6 text-muted-foreground">
      <h3 className="font-semibold text-foreground">What submission does</h3>
      <p className="mt-2">It creates an application and enrollment journey with guardian verification pending.</p>
      <h3 className="mt-5 font-semibold text-foreground">What it does not do</h3>
      <p className="mt-2">It does not establish legal guardianship, accept an offer, activate enrollment or place a student into classes.</p>
    </div>}>
    {notice && <WorkspaceNotice ref={feedbackRef} tone="success" className="mb-5">{notice}</WorkspaceNotice>}
    {error && <WorkspaceNotice ref={feedbackRef} tone="danger" className="mb-5">{error}</WorkspaceNotice>}
    {programs.length === 0 ? <WorkspaceNotice>
      No eligible school is currently available to this verified family account. Contact the school's admissions team about your invitation and application opening.
    </WorkspaceNotice> : <form onSubmit={event => void submit(event)} aria-busy={busy} className="grid gap-5 sm:grid-cols-2">
      <fieldset disabled={busy} className="contents">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${id}-program`}>School and program</Label>
          <Select id={`${id}-program`} name="programId" required value={programId} onChange={event => setProgramId(event.target.value)}>
            {programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${id}-household`}>Family household</Label>
          <Select id={`${id}-household`} name="householdId" value={householdId}
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
            value={firstName} onChange={event => setFirstName(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-last-name`}>Student legal last name</Label>
          <Input id={`${id}-last-name`} name="studentLastName" autoComplete="off" required maxLength={100}
            value={lastName} onChange={event => setLastName(event.target.value)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${id}-grade`}>Entering grade level</Label>
          <Input id={`${id}-grade`} name="gradeLevel" required maxLength={10} value={grade}
            aria-describedby={`${id}-grade-hint`} placeholder="For example, 9" onChange={event => setGrade(event.target.value)} />
          <p id={`${id}-grade-hint`} className="text-xs leading-5 text-muted-foreground">Use the grade the student is applying to enter.</p>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="lg" disabled={busy || !programId} aria-busy={busy}>
            {busy && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {busy ? "Submitting application…" : "Submit application"}
          </Button>
        </div>
      </fieldset>
    </form>}
  </GuidedSetupShell>;
}
