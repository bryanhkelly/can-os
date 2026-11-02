import type { RubricCriterion } from "@/modules/learning/rubric";

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
        <label key={criterion.id} className="block text-sm font-semibold">
          {criterion.label}{" "}
          <span className="font-normal text-muted-foreground">(0–{criterion.maxPoints})</span>
          {criterion.description && (
            <span className="mt-1 block text-sm font-normal text-muted-foreground">
              {criterion.description}
            </span>
          )}
          <input
            className="mt-2 w-28 rounded-lg border bg-background p-2"
            type="number"
            min={0}
            max={criterion.maxPoints}
            value={values[criterion.id] ?? ""}
            onChange={(event) => onChange(criterion.id, event.target.value)}
          />
        </label>
      ))}
      <p role="status" className="text-sm font-semibold">
        Total: {total ?? "—"} / {pointsPossible ?? "—"}
      </p>
    </fieldset>
  );
}
