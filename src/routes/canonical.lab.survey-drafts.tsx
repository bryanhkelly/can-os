import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { CapabilityLabNav } from "@/components/capability-lab/CapabilityLabNav";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { safeLoader } from "@/lib/safe-loader";
import { normalizeClientError } from "@/lib/client-error";
import { createCanonicalSurveyDraft, readCanonicalSurveyDraftAccess } from
  "@/modules/operations/canonical-survey-draft.functions";
import type { CreateSurveyDraftInput } from "@/domain/canonical-survey-draft";

export const Route = createFileRoute("/canonical/lab/survey-drafts")({
  loader: () => safeLoader(() => readCanonicalSurveyDraftAccess())(),
  component: SurveyDraftPage,
});

type Kind = CreateSurveyDraftInput["questions"][number]["type"];
type Question = {
  prompt: string; type: Kind; required: boolean;
  options: string; min: string; max: string;
};
const emptyQuestion = (): Question => ({
  prompt: "", type: "rating", required: true, options: "", min: "1", max: "5",
});
function SurveyDraftPage() {
  const result = Route.useLoaderData();
  if (!result.ok) return <CanonicalBlueprintLoadError
    title="Survey draft authoring" message={result.message}/>;
  return <SurveyDraftForm organizationId={result.data.organizationId}/>;
}
function SurveyDraftForm({ organizationId }: { organizationId: string }) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [purposeCode, setPurposeCode] = useState("training_feedback");
  const [audience, setAudience] = useState<CreateSurveyDraftInput["intendedAudience"]>("learner");
  const [questions, setQuestions] = useState<Question[]>([emptyQuestion()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{surveyId:string;surveyVersionId:string}|null>(null);

  function edit(index: number, patch: Partial<Question>) {
    setQuestions(rows => rows.map((row, position) =>
      position === index ? {...row, ...patch} : row));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setSaved(null);
    try {
      const data: CreateSurveyDraftInput = {
        code, title, purposeCode, intendedAudience: audience,
        questions: questions.map(question => {
          const choice = question.type === "single_choice" || question.type === "multiple_choice";
          const numeric = ["rating", "likert", "nps"].includes(question.type);
          return {
            prompt: question.prompt, type: question.type, required: question.required,
            options: choice ? question.options.split(/\r?\n/).map(o => o.trim()).filter(Boolean) : [],
            ratingMin: numeric ? Number(question.min) : null,
            ratingMax: numeric ? Number(question.max) : null,
          };
        }),
      };
      const outcome = await createCanonicalSurveyDraft({ data });
      setSaved({surveyId: outcome.surveyId, surveyVersionId: outcome.surveyVersionId});
    } catch (cause) {
      setError(normalizeClientError(cause, "Could not create the survey draft.").message);
    } finally { setBusy(false); }
  }
  return <WorkspaceShell width="wide" eyebrow="Internal · Canonical v3.0.1"
    title="Create survey draft"
    subtitle="Save a real reusable survey definition and its first draft version. Questions are data, not hardcoded for a particular program.">
    <CapabilityLabNav current="survey-drafts"/>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="font-semibold">Draft-only boundary</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        This creates persistent canonical records and a durable audit event.
        It does not publish the survey, invite learners, or change campaign status.
        Publication requires independent privacy, accessibility and safeguarding reviews.
        Work only with authorized synthetic testing content.
      </p>
      <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
        Organization: {organizationId}
      </p>
    </section>
    {saved && <section role="status" className="mt-5 border border-success bg-card p-4 text-sm">
      <strong>Draft created.</strong> No review or publication was performed.
      <p className="mt-2 break-all font-mono text-xs">Survey {saved.surveyId}</p>
      <p className="mt-1 break-all font-mono text-xs">Version {saved.surveyVersionId}</p>
      <Link to="/canonical/lab/surveys" className="mt-3 inline-flex font-semibold text-primary underline underline-offset-4">
        Return to survey inventory
      </Link>
    </section>}
    {error && <p role="alert" className="mt-5 border border-destructive p-4 text-sm text-destructive">{error}</p>}
    <form onSubmit={event => void submit(event)} className="mt-6 space-y-5">
      <section className="border border-border bg-card p-5">
        <h2 className="font-serif text-2xl">Survey identity</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="survey-title">Title</Label>
            <Input id="survey-title" required minLength={5} maxLength={160}
              value={title} onChange={e => setTitle(e.target.value)} placeholder="Pilot training feedback"/></div>
          <div className="space-y-2"><Label htmlFor="survey-code">Unique survey code</Label>
            <Input id="survey-code" required pattern="[a-z][a-z0-9_-]{2,63}" maxLength={64}
              value={code} onChange={e => setCode(e.target.value.toLowerCase())}
              placeholder="pilot_feedback_01"/></div>
          <div className="space-y-2"><Label htmlFor="survey-purpose">Purpose code</Label>
            <Input id="survey-purpose" required maxLength={80}
              value={purposeCode} onChange={e => setPurposeCode(e.target.value.toLowerCase())}/></div>
          <div className="space-y-2"><Label htmlFor="survey-audience">Intended audience</Label>
            <Select id="survey-audience" value={audience}
              onChange={e => setAudience(e.target.value as CreateSurveyDraftInput["intendedAudience"])}>
              <option value="learner">Learner</option><option value="guardian">Guardian</option>
              <option value="professional">Professional</option><option value="operator">Operator</option>
              <option value="any">Any approved audience</option>
            </Select></div>
        </div>
      </section>
      <section aria-label="Survey questions" className="space-y-4">
        <h2 className="font-serif text-2xl">Questions</h2>
        {questions.map((question, index) => {
          const choice = question.type === "single_choice" || question.type === "multiple_choice";
          const numeric = ["rating","likert","nps"].includes(question.type);
          return <article key={index} className="border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Question {index + 1}</h3>
              {questions.length > 1 && <Button type="button" size="sm" variant="outline"
                onClick={() => setQuestions(rows => rows.filter((_, i) => i !== index))}>
                Remove question</Button>}
            </div>
            <div className="mt-4 space-y-2"><Label htmlFor={"prompt-"+index}>Question text</Label>
              <Textarea id={"prompt-"+index} required minLength={5} maxLength={1000}
                value={question.prompt} onChange={e => edit(index, {prompt:e.target.value})}
                placeholder="What did you learn?"/></div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor={"kind-"+index}>Answer format</Label>
                <Select id={"kind-"+index} value={question.type}
                  onChange={e => edit(index, {type: e.target.value as Kind})}>
                  <option value="rating">Rating</option><option value="likert">Likert</option>
                  <option value="nps">Net promoter score</option><option value="text">Text response</option>
                  <option value="single_choice">Single choice</option>
                  <option value="multiple_choice">Multiple choice</option>
                </Select></div>
              <label className="flex items-center gap-3 pt-6 text-sm font-medium">
                <input type="checkbox" checked={question.required}
                  onChange={e => edit(index, {required:e.target.checked})}
                  className="size-4 accent-primary"/>Required answer</label>
            </div>
            {numeric && <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor={"min-"+index}>Minimum rating</Label>
                <Input id={"min-"+index} inputMode="numeric" type="number" min={0} max={100}
                  value={question.min} onChange={e => edit(index,{min:e.target.value})}/></div>
              <div className="space-y-2"><Label htmlFor={"max-"+index}>Maximum rating</Label>
                <Input id={"max-"+index} inputMode="numeric" type="number" min={1} max={100}
                  value={question.max} onChange={e => edit(index,{max:e.target.value})}/></div>
            </div>}
            {choice && <div className="mt-4 space-y-2"><Label htmlFor={"options-"+index}>Options, one per line (2–12)</Label>
              <Textarea id={"options-"+index} value={question.options}
                onChange={e => edit(index,{options:e.target.value})}
                placeholder={"Yes\nNo"} rows={4}/></div>}
          </article>;
        })}
        <Button type="button" variant="outline" disabled={questions.length >= 20 || busy}
          onClick={() => setQuestions(rows => [...rows, emptyQuestion()])}>Add question</Button>
      </section>
      <div className="flex flex-wrap gap-3 border-t border-border pt-5">
        <Button type="submit" disabled={busy}>{busy ? "Saving draft…" : "Create draft"}</Button>
        <Button asChild variant="outline"><Link to="/canonical/lab/surveys">Back to surveys</Link></Button>
      </div>
    </form>
  </WorkspaceShell>;
}
