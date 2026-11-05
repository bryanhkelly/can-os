import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { QueryState } from "@/components/workspace";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getStudentSelfProfile, saveStudentSelfProfile } from "@/modules/profiles/student-self-profile.functions";

type Snapshot = Awaited<ReturnType<typeof getStudentSelfProfile>>;
export type StudentProfileFields = { preferredName: string; pronouns: string; interests: string };

export function StudentProfileSetup() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    getStudentSelfProfile().then(result => {
      if (active) setSnapshot(result);
    }).catch(cause => {
      if (active) setError(mutationErrorMessage(cause, "Student profile setup is unavailable."));
    });
    return () => { active = false; };
  }, [revision]);

  return <section className="mt-6 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Set up your student profile</h2>
    <p className="mt-2 text-sm">This quick setup is optional. Your preferred name may appear to your school. Pronouns and interests are private to you here. You can skip this and use your learning workspace.</p>
    <QueryState loading={!snapshot && !error ? "Loading student profile..." : undefined}
      error={error || undefined} onRetry={() => {
        setSnapshot(null);
        setError("");
        setRevision(value => value + 1);
      }}>
      {snapshot && <StudentProfileEditor snapshot={snapshot}
        changed={async () => setSnapshot(await getStudentSelfProfile())} />}
    </QueryState>
  </section>;
}

export function StudentProfileEditor({ snapshot, changed, fields, onFieldsChange }: {
  snapshot: Snapshot;
  changed: () => Promise<void>;
  fields?: StudentProfileFields;
  onFieldsChange?: (fields: StudentProfileFields) => void;
}) {
  const [localFields, setLocalFields] = useState({ preferredName: snapshot.preferredName,
    pronouns: snapshot.preferredPronouns, interests: snapshot.interests.join(", ") });
  const { preferredName, pronouns, interests } = fields ?? localFields;
  function update(patch: Partial<StudentProfileFields>) {
    const next = { ...(fields ?? localFields), ...patch };
    if (onFieldsChange) onFieldsChange(next);
    else setLocalFields(next);
  }
  const mutation = useMutationFeedback(changed);

  async function save() {
    const data = {
      preferredName: preferredName.trim() || null,
      preferredPronouns: pronouns.trim() || null,
      interests: interests.split(",").map(value => value.trim()).filter(Boolean),
    };
    await mutation.run(() => saveStudentSelfProfile({ data }), {
      successMessage: "Student profile saved.",
      commandErrorMessage: "Unable to save your student profile.",
    });
  }

  return <form className="mt-4 grid gap-4" onSubmit={event => {
    event.preventDefault();
    void save();
  }}>
    <MutationFeedback state={mutation} pendingMessage="Saving student profile..." />
    <fieldset disabled={mutation.pending || mutation.refreshFailed} className="grid gap-3 sm:grid-cols-2">
      <legend className="sr-only">Student profile setup</legend>
      <Field label="Preferred name (optional)" className="text-sm"><Input maxLength={80} value={preferredName} onChange={event => update({ preferredName: event.target.value })}/></Field>
      <Field label="Pronouns (optional)" className="text-sm"><Input maxLength={60} value={pronouns} onChange={event => update({ pronouns: event.target.value })}/></Field>
      <Field label="Interests or hobbies (optional)" className="text-sm sm:col-span-2">
        <Input maxLength={700} placeholder="For example: drawing, soccer, robotics" value={interests} onChange={event => update({ interests: event.target.value })}/>
      </Field>
    </fieldset>
    <p className="text-xs text-muted-foreground">Add or change your profile picture above. Your school manages your legal identity, grade, enrollment, and access.</p>
    <Button type="submit" variant="outline" disabled={mutation.pending || mutation.refreshFailed} className="justify-self-start">Save student profile</Button>
    <Link to="/home" className="justify-self-start text-sm underline">Skip for now and go to my learning workspace</Link>
  </form>;
}
