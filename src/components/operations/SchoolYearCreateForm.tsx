import { useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { createStudioGradeScale, createStudioYear, type getSchoolYearStudio } from "@/modules/academic-time/school-year-studio.functions";
import { suggestedSchoolYear } from "@/domain/school-year-defaults";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormActions, FormSection, MutationFeedback, WorkspaceNotice, WorkspaceShell, useUnsavedChangesGuard } from "@/components/workspace";

type Snapshot = Awaited<ReturnType<typeof getSchoolYearStudio>>;
type Selection = { siteId?: string; programId?: string };

export function SchoolYearCreateForm({ data, selection }: { data: Snapshot; selection: Selection }) {
  const router = useRouter();
  const navigate = useNavigate();
  const [siteId, setSiteId] = useState(selection.siteId ?? data.programs.find(p => p.id === selection.programId)?.siteId ?? data.sites[0]?.id ?? "");
  const [programId, setProgramId] = useState(() =>
    data.programs.some(program => program.id === selection.programId && program.siteId === siteId) ? selection.programId! : "");
  const [scaleId, setScaleId] = useState("");
  const [newScaleName, setNewScaleName] = useState("Standard A–F");
  // Prefer the selected Program's persisted target; every field stays editable.
  const [suggestedYear] = useState(() => suggestedSchoolYear(new Date(),
    data.programs.find(program => program.id === selection.programId)?.targetOpeningDate));
  const [name, setName] = useState(suggestedYear.name);
  const [key, setKey] = useState(suggestedYear.key);
  const [start, setStart] = useState(suggestedYear.startsOn), [end, setEnd] = useState(suggestedYear.endsOn);
  const [touched, setTouched] = useState(false);
  const release = useUnsavedChangesGuard(touched);
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;

  const scopedPrograms = data.programs.filter(p => p.siteId === siteId);
  const site = data.sites.find(s => s.id === siteId);
  const siteScales = data.gradeScales.filter(scale => scale.organizationId === site?.organizationId);
  const targetOpeningDate = scopedPrograms.find(program => program.id === programId)?.targetOpeningDate;
  const selectedScaleId = siteScales.some(scale => scale.id === scaleId) ? scaleId
    : siteScales.length === 1 ? siteScales[0]!.id : "";
  const listSearch = { siteId: siteId || undefined, programId: programId || undefined };
  const edit = <T,>(setter: (value: T) => void) => (value: T) => { setTouched(true); setter(value); };

  return <WorkspaceShell width="reading" eyebrow="School years" title="Create school year"
    subtitle="Set the dates and grading scale for a site's school year. Terms, grading periods and calendars are added on the saved year; activation still requires readiness checks."
    breadcrumbs={<Link to="/operations/school-years" search={listSearch} className="underline">School years</Link>}>
    <form onSubmit={event => {
      event.preventDefault();
      let createdId = "";
      void mutation.run(async () => {
        const created = await createStudioYear({ data: { siteId, ...(programId ? { programId } : {}), gradeScaleId: selectedScaleId, key, name, startsOn: start, endsOn: end } });
        createdId = created.schoolYearId;
        return created;
      }, {
        successMessage: "School year saved.",
        commandErrorMessage: "Unable to create the school year.",
        refreshErrorMessage: "The school year was saved, but it could not be opened. Open School years instead of submitting again.",
        refresh: async () => {
          release();
          await navigate({ to: "/operations/school-years/$yearId", params: { yearId: createdId }, search: listSearch });
        },
      });
    }}>
      <fieldset disabled={busy} className="space-y-8">
        <FormSection title="Scope">
          <Field label="Site" required>
            <Select value={siteId} onChange={e => { edit(setSiteId)(e.target.value); setProgramId(""); setScaleId(""); }}>
              {data.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Program (optional)">
            <Select value={programId} onChange={e => edit(setProgramId)(e.target.value)}>
              <option value="">Site-wide</option>
              {scopedPrograms.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        </FormSection>
        <FormSection title="Dates" description="Suggested dates are planning defaults; review terms, instructional days and local calendar requirements before activation.">
          <Field label="Year name" required><Input value={name} onChange={e => edit(setName)(e.target.value)} minLength={3} maxLength={100} /></Field>
          <Field label="Year key" required><Input value={key} onChange={e => edit(setKey)(e.target.value)} minLength={2} maxLength={40} /></Field>
          <Field label="Starts" required><Input type="date" value={start} onChange={e => edit(setStart)(e.target.value)} /></Field>
          <Field label="Ends" required><Input type="date" value={end} onChange={e => edit(setEnd)(e.target.value)} /></Field>
          {targetOpeningDate && <div className="text-sm sm:col-span-2">
            <p className="text-muted-foreground">Program target opening: {targetOpeningDate}.</p>
            <Button type="button" variant="outline" className="mt-2" onClick={() => {
              const suggested = suggestedSchoolYear(new Date(), targetOpeningDate);
              setTouched(true); setName(suggested.name); setKey(suggested.key); setStart(suggested.startsOn); setEnd(suggested.endsOn);
            }}>Use saved target opening date</Button>
          </div>}
        </FormSection>
        <FormSection title="Grading">
          <Field label="Grading scale" required className="sm:col-span-2">
            <Select value={selectedScaleId} onChange={e => edit(setScaleId)(e.target.value)}>
              <option value="">Choose scale</option>
              {siteScales.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
          {!siteScales.length && <WorkspaceNotice className="sm:col-span-2">This school needs a grading scale. Create the standard scale, then continue with its school year.</WorkspaceNotice>}
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
            <Field label="New grading scale name"><Input value={newScaleName} onChange={e => setNewScaleName(e.target.value)} /></Field>
            <Button type="button" variant="outline" disabled={!site?.organizationId || !newScaleName.trim()}
              onClick={() => void mutation.run(() => createStudioGradeScale({ data: { organizationId: site!.organizationId, name: newScaleName } }), {
                successMessage: "Grading scale created.",
                commandErrorMessage: "Unable to create the grading scale.",
              }).then(outcome => { if (outcome.status === "saved" || outcome.status === "refresh-failed") setScaleId(outcome.value.gradeScaleId); })}>
              Create standard A–F scale
            </Button>
          </div>
        </FormSection>
      </fieldset>
      <MutationFeedback state={mutation} pendingMessage="Saving..." className="mt-6" />
      <FormActions submitLabel="Create school year" pendingLabel="Creating school year..." pending={mutation.pending}
        disabled={busy || !siteId || !selectedScaleId} cancel={<Link to="/operations/school-years" search={listSearch}>Cancel</Link>} />
    </form>
  </WorkspaceShell>;
}
