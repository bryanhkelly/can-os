import { programTypes, programTypeLabels, type ProgramType } from "@/domain/program-offerings";
import { SelectionCard } from "@/components/workspace";

export type SchoolModelPreset = ProgramType;
export type ExtendedLearningPreset = Extract<ProgramType, "summer_program" | "summer_enrichment" | "after_school_enrichment">;

const descriptions: Record<ProgramType, string> = {
  church_hosted_academy: "A school that meets at a church.",
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
          return <SelectionCard key={type} kind="radio" name="school-model"
            value={type} checked={selected} title={programTypeLabels[type]}
            detail={<>{descriptions[type]}{selected && <span className="mt-2 block font-semibold text-primary">Selected</span>}</>}
            onChange={checked => { if (checked) onSchoolModel(type); }}
            className="min-h-24" />;
        })}
      </div>
    </section>
  );
}
