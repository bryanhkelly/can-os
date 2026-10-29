import { guidedSchoolJourney, type LaunchJourneyRecord, type SchoolProgramRecord } from "@/domain/guided-school-journey";

/**
 * Turns existing, separately authorized Program and Launch records into one
 * navigable route. No completion is asserted from a click or manual checkbox.
 */
export function GuidedSchoolJourney({program,journey}:{
  program:SchoolProgramRecord;
  journey:LaunchJourneyRecord;
}) {
  const steps=guidedSchoolJourney(program,journey);
  const recorded=steps.filter(s=>s.state==="recorded").length;
  return <section className="rounded-xl border bg-card p-5" aria-label={program.name+" guided launch"}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="font-serif text-xl">{program.name} · guided operating journey</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {recorded} of {steps.length} steps have direct operational evidence.
          Review steps require verification; they never self-complete.
        </p>
      </div>
      <a href={steps[0]?.href} className="text-sm underline">{steps[0]?.nextAction} →</a>
    </div>
    <ol className="mt-4 grid gap-3 md:grid-cols-2">
      {steps.map((step,index)=><li key={step.key} className="rounded-lg border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-xs text-muted-foreground">Step {index+1} · Suggested: {step.suggestedRole}</span>
            <h4 className="mt-1 font-semibold">{step.title}</h4>
          </div>
          <span className="rounded-full border px-2 py-1 text-[11px] whitespace-nowrap">
            {step.state==="recorded"?"Recorded":step.state==="review"?"Review":"Needs setup"}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{step.evidence}</p>
        <a href={step.href} className="mt-3 inline-block text-sm font-semibold underline">
          {step.nextAction} →
        </a>
      </li>)}
    </ol>
  </section>;
}
