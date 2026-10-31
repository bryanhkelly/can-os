export type SchoolModelPreset = "elementary" | "middle" | "high" | "k12" | "micro" | "hybrid";
export type ExtendedLearningPreset = "summer_program" | "summer_enrichment" | "after_school_enrichment";

export function LaunchSchoolModelPicker({ onSchoolModel, onNinthGradeHybrid, onExtendedLearning }: {
  onSchoolModel: (model: SchoolModelPreset) => void;
  onNinthGradeHybrid: () => void;
  onExtendedLearning: (offering: ExtendedLearningPreset) => void;
}) {
  return (
            <section className="mt-4 rounded-xl border bg-card p-5" aria-label="Recommended school models">
              <h3 className="font-serif text-xl font-semibold">Choose your school model</h3>
              <p className="mt-2 text-sm text-muted-foreground">Start with a recommended proposal, then customize the details below. Selecting a model does not save or approve your school, staffing, or academic program.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {([
                  ["elementary","Elementary School","K–5 · five onsite days"],
                  ["middle","Middle School","6–8 · five onsite days"],
                  ["high","High School","9–12 · five onsite days"],
                  ["k12","K–12 School","K–12 · five onsite days"],
                  ["micro","Microschool","K–8 · four onsite days + independent study"],
                  ["hybrid","Hybrid School","6–12 · two onsite days + independent study"],
                ] as const).map(([key,label,detail])=><button key={key} type="button"
                  onClick={()=>onSchoolModel(key)}
                  className="min-h-24 rounded-xl border p-4 text-left hover:border-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
                  <span className="block font-semibold">{label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
                  <span className="mt-2 block text-xs font-semibold text-primary">Use recommended setup</span>
                </button>)}
              </div>
              <details className="mt-4 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">Additional program options</summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onNinthGradeHybrid}>Grade 9 extension</button>
                  <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={()=>onExtendedLearning("summer_program")}>Summer academic</button>
                  <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={()=>onExtendedLearning("summer_enrichment")}>Summer enrichment</button>
                  <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={()=>onExtendedLearning("after_school_enrichment")}>After-school enrichment</button>
                </div>
              </details>
            </section>
  );
}
