import { useEffect, useState } from "react";
import { QueryState, WorkspacePanel } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Save, Trash2 } from "lucide-react";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import {
  getTeacherProfessionalProfile,
  saveTeacherProfessionalProfile,
} from "@/modules/profiles/teacher-professional-profile.functions";

type Snapshot = Awaited<ReturnType<typeof getTeacherProfessionalProfile>>;
type EducationDraft = {
  institution: string;
  degree: string;
  fieldOfStudy: string;
  graduationYear: string;
};

function educationDrafts(education: Snapshot["education"]): EducationDraft[] {
  return education.map(item => ({
    ...item,
    fieldOfStudy: item.fieldOfStudy ?? "",
    graduationYear: item.graduationYear?.toString() ?? "",
  }));
}

export function TeacherProfessionalProfile() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    getTeacherProfessionalProfile().then(result => {
      if (active) setSnapshot(result);
    }).catch(cause => {
      if (active) setError(mutationErrorMessage(cause, "Professional profile details are unavailable."));
    });
    return () => { active = false; };
  }, [revision]);

  return <WorkspacePanel title="Professional background" description="Optional, self-reported education and experience.">
    <p className="text-sm text-muted-foreground">Degrees and experience recorded here are not independently verified. Licenses, certificates, and supporting documents belong under Qualification evidence.</p>
    <QueryState loading={!snapshot && !error ? "Loading professional profile..." : undefined}
      error={error || undefined} onRetry={() => {
        setSnapshot(null);
        setError("");
        setRevision(value => value + 1);
      }}>
      {snapshot && <TeacherProfessionalProfileEditor snapshot={snapshot}
        changed={async () => setSnapshot(await getTeacherProfessionalProfile())} />}
    </QueryState>
  </WorkspacePanel>;
}

export function TeacherProfessionalProfileEditor({ snapshot, changed }: {
  snapshot: Snapshot;
  changed: () => Promise<void>;
}) {
  const [education, setEducation] = useState(() => educationDrafts(snapshot.education));
  const [years, setYears] = useState(snapshot.teachingExperienceYears?.toString() ?? "");
  const [specialties, setSpecialties] = useState(snapshot.specialties.join(", "));
  const mutation = useMutationFeedback(changed);

  async function save() {
    const parsedYears = years.trim() ? Number(years) : null;
    const data = {
      education: education.map(item => ({
        institution: item.institution,
        degree: item.degree,
        fieldOfStudy: item.fieldOfStudy.trim() || null,
        graduationYear: item.graduationYear.trim() ? Number(item.graduationYear) : null,
      })),
      teachingExperienceYears: parsedYears,
      specialties: specialties.split(",").map(item => item.trim()).filter(Boolean),
    };
    await mutation.run(() => saveTeacherProfessionalProfile({ data }), {
      successMessage: "Professional background saved.",
      commandErrorMessage: "Unable to save your professional background.",
    });
  }

  function updateEducation(index: number, patch: Partial<EducationDraft>) {
    setEducation(current => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item));
  }

  return <form className="mt-4 grid gap-4" onSubmit={event => {
    event.preventDefault();
    void save();
  }}>
    <MutationFeedback state={mutation} pendingMessage="Saving professional background..." />
    <fieldset disabled={mutation.pending || mutation.refreshFailed} className="grid gap-4">
      <legend className="sr-only">Professional background</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Years of teaching experience
          <Input type="number" min="0" max="60" step="1" value={years}
            onChange={event => setYears(event.target.value)} className="mt-2" />
        </label>
        <label className="text-sm">Subject or specialty areas (comma-separated)
          <Input value={specialties} maxLength={1200} placeholder="For example: mathematics, literacy, special education"
            onChange={event => setSpecialties(event.target.value)} className="mt-2" />
        </label>
      </div>
      <fieldset className="grid gap-3">
        <legend className="font-semibold">Education and degrees</legend>
        {education.map((item, index) => <div key={index} className="grid gap-3 border-b py-4 sm:grid-cols-2">
          <label className="text-sm">University or institution
            <Input required maxLength={160} value={item.institution}
              onChange={event => updateEducation(index, { institution: event.target.value })}
              className="mt-2" />
          </label>
          <label className="text-sm">Degree
            <Input required maxLength={120} value={item.degree} placeholder="For example: B.A., M.Ed., Ph.D."
              onChange={event => updateEducation(index, { degree: event.target.value })}
              className="mt-2" />
          </label>
          <label className="text-sm">Field of study
            <Input maxLength={120} value={item.fieldOfStudy}
              onChange={event => updateEducation(index, { fieldOfStudy: event.target.value })}
              className="mt-2" />
          </label>
          <label className="text-sm">Graduation year (optional)
            <Input type="number" min="1900" max="2100" step="1" value={item.graduationYear}
              onChange={event => updateEducation(index, { graduationYear: event.target.value })}
              className="mt-2" />
          </label>
          <Button type="button" variant="ghost"
            onClick={() => setEducation(current => current.filter((_, itemIndex) => itemIndex !== index))}
            className="justify-self-start sm:col-span-2"><Trash2 aria-hidden="true"/>Remove education item</Button>
        </div>)}
        {education.length < 10 && <Button type="button" variant="outline"
          onClick={() => setEducation(current => [...current, {
            institution: "", degree: "", fieldOfStudy: "", graduationYear: "",
          }])} className="justify-self-start"><Plus aria-hidden="true"/>Add education</Button>}
      </fieldset>
      <Button type="submit" variant="outline" className="justify-self-start"><Save aria-hidden="true"/>Save professional background</Button>
    </fieldset>
  </form>;
}
