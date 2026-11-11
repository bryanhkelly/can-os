import { programTypes, programTypeLabels, type ProgramType } from "@/domain/program-offerings";
import { Button } from "@/components/ui/button";

export type SchoolModelPreset = ProgramType;
export type ExtendedLearningPreset = Extract<ProgramType, "summer_program" | "summer_enrichment" | "after_school_enrichment">;

const descriptions: Record<ProgramType, string> = {
  hosted_academy: "A school that meets at a church.",
  high_school_extension: "Add high-school grades to an existing school.",
  full_school: "A complete school community.",
  microschool: "A small, focused school community.",
  hybrid_program: "Combine in-person and online learning.",
  homeschool_cohort: "Shared learning for a homeschool community.",
  summer_enrichment: "Summer activities without academic credit.",
  summer_program: "Summer classes, with or without academic credit.",
  after_school_enrichment: "Activities outside the school day.",
};

export function LaunchSchoolModelPicker({ value, onSchoolModel }: {
  value?: ProgramType;
  onSchoolModel: (value: ProgramType) => void;
  onNinthGradeHybrid?: () => void;
  onExtendedLearning?: (value: ExtendedLearningPreset) => void;
}) {
  return (
    <section aria-label="School type">
      <p className="text-sm text-muted-foreground">Choose the kind of school or offering you're building.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {programTypes.map(type => {
          const selected = value === type;
          return <Button key={type} type="button" variant="outline" aria-pressed={selected}
            onClick={() => onSchoolModel(type)}
            className={`min-h-24 w-full flex-col items-start justify-start gap-1 whitespace-normal border p-4 text-left focus-visible:outline-2 focus-visible:outline-ring ${selected
              ? "border-primary bg-primary/5 ring-2 ring-primary"
              : "hover:border-primary hover:bg-muted"}`}>
            <span className="block font-semibold">{programTypeLabels[type]}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{descriptions[type]}</span>
            {selected && <span className="mt-2 block text-xs font-semibold text-primary">Selected</span>}
          </Button>;
        })}
      </div>
    </section>
  );
}
