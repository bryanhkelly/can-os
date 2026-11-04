import { useEffect, useState } from "react";
import { QueryState } from "@/components/workspace";
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

  return <section className="mt-6 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Professional background</h2>
    <p className="mt-2 text-sm">Share your education, teaching experience, and subject specialties. This is optional and self-reported; it does not affect access or verify a degree, license, or certification.</p>
    <p className="mt-2 text-sm">Submit licenses, certificates, and supporting documents separately under Qualification evidence for independent review.</p>
    <QueryState loading={!snapshot && !error ? "Loading professional profile..." : undefined}
      error={error || undefined} onRetry={() => {
        setSnapshot(null);
        setError("");
        setRevision(value => value + 1);
      }}>
      {snapshot && <TeacherProfessionalProfileEditor snapshot={snapshot}
        changed={async () => setSnapshot(await getTeacherProfessionalProfile())} />}
    </QueryState>
  </section>;
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
          <input type="number" min="0" max="60" step="1" value={years}
            onChange={event => setYears(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2" />
        </label>
        <label className="text-sm">Subject or specialty areas (comma-separated)
          <input value={specialties} maxLength={1200} placeholder="For example: mathematics, literacy, special education"
            onChange={event => setSpecialties(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2" />
        </label>
      </div>
      <fieldset className="grid gap-3">
        <legend className="font-semibold">Education and degrees</legend>
        {education.map((item, index) => <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
          <label className="text-sm">University or institution
            <input required maxLength={160} value={item.institution}
              onChange={event => updateEducation(index, { institution: event.target.value })}
              className="mt-1 block w-full rounded border bg-background p-2" />
          </label>
          <label className="text-sm">Degree
            <input required maxLength={120} value={item.degree} placeholder="For example: B.A., M.Ed., Ph.D."
              onChange={event => updateEducation(index, { degree: event.target.value })}
              className="mt-1 block w-full rounded border bg-background p-2" />
          </label>
          <label className="text-sm">Field of study
            <input maxLength={120} value={item.fieldOfStudy}
              onChange={event => updateEducation(index, { fieldOfStudy: event.target.value })}
              className="mt-1 block w-full rounded border bg-background p-2" />
          </label>
          <label className="text-sm">Graduation year (optional)
            <input type="number" min="1900" max="2100" step="1" value={item.graduationYear}
              onChange={event => updateEducation(index, { graduationYear: event.target.value })}
              className="mt-1 block w-full rounded border bg-background p-2" />
          </label>
          <button type="button"
            onClick={() => setEducation(current => current.filter((_, itemIndex) => itemIndex !== index))}
            className="justify-self-start text-sm underline sm:col-span-2">Remove education item</button>
        </div>)}
        {education.length < 10 && <button type="button"
          onClick={() => setEducation(current => [...current, {
            institution: "", degree: "", fieldOfStudy: "", graduationYear: "",
          }])} className="justify-self-start text-sm underline">Add education</button>}
      </fieldset>
      <button type="submit"
        className="justify-self-start rounded border px-4 py-2 text-sm disabled:opacity-50">Save professional background</button>
    </fieldset>
  </form>;
}
