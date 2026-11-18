import type { RubricCriterion } from "@/modules/learning/rubric";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function RubricScoreFields({
  criteria,
  values,
  onChange,
  total,
  pointsPossible,
}: {
  criteria: readonly RubricCriterion[];
  values: Readonly<Record<string, string>>;
  onChange: (criterionId: string, value: string) => void;
  total: number | null;
  pointsPossible: string | number | null | undefined;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="font-semibold">Rubric</legend>
      {criteria.map((criterion) => (
        <Field key={criterion.id} label={<>{criterion.label}{" "}
          <span className="font-normal text-muted-foreground">(0–{criterion.maxPoints})</span></>}
          description={criterion.description || undefined} required className="max-w-md">
          <Input type="number" min={0} max={criterion.maxPoints} step="any"
            className="max-w-32" value={values[criterion.id] ?? ""}
            onChange={(event) => onChange(criterion.id, event.target.value)}/>
        </Field>
      ))}
      <p role="status" className="text-sm font-semibold">
        Total: {total ?? "—"} / {pointsPossible ?? "—"}
      </p>
    </fieldset>
  );
}
