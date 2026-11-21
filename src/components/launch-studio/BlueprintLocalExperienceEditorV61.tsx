import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { readableBlueprintKey } from "@/domain/blueprint-display";
import type { BlueprintConfigurationDetail } from "@/modules/blueprints/blueprint-configuration.server";

export type LocalExperienceDraft = BlueprintConfigurationDetail["localExperiences"][number] & {
  source: "proposed_local_experience";
};

export type LocalExperienceCategoryV61 = {
  id: string;
  key: string;
  kind: string;
};

/**
 * Controlled, reusable local experience proposal editor for Site Solution plans.
 * Only the parent can select an eligible published component and persist drafts.
 * A proposal is never an approved activity.
 */
export function BlueprintLocalExperienceEditorV61({
  categories, categoryId, title, summary, experiences, disabled,
  onCategoryChange, onTitleChange, onSummaryChange, onAdd, onRemove,
}: {
  categories: readonly LocalExperienceCategoryV61[];
  categoryId: string;
  title: string;
  summary: string;
  experiences: readonly LocalExperienceDraft[];
  disabled: boolean;
  onCategoryChange: (id:string) => void;
  onTitleChange: (value:string) => void;
  onSummaryChange: (value:string) => void;
  onAdd: () => void;
  onRemove: (index:number) => void;
}) {
  return <fieldset className="border p-4" disabled={disabled}>
    <legend className="px-2 font-semibold">Propose a local experience</legend>
    <p className="mb-3 text-sm text-muted-foreground">
      Describe a club, activity, community project, or experience unique to your Site.
      You can plan this now. It must be reviewed before it can be offered.
    </p>
    <div className="grid gap-3 sm:grid-cols-3">
      <Label className="text-sm" htmlFor="canonical-local-component">
        Category
        <Select id="canonical-local-component" className="mt-2" value={categoryId}
          onChange={event => onCategoryChange(event.currentTarget.value)}>
          <option value="">Choose category</option>
          {categories.map(component => <option key={component.id} value={component.id}>
            {readableBlueprintKey(component.key)}
          </option>)}
        </Select>
      </Label>
      <Label className="text-sm" htmlFor="canonical-local-title">
        Name
        <Input id="canonical-local-title" className="mt-2" maxLength={160} value={title}
          onChange={event => onTitleChange(event.currentTarget.value)}/>
      </Label>
      <Label className="text-sm" htmlFor="canonical-local-summary">
        Summary
        <Input id="canonical-local-summary" className="mt-2" maxLength={4000} value={summary}
          onChange={event => onSummaryChange(event.currentTarget.value)}/>
      </Label>
    </div>
    <Button type="button" variant="outline" className="mt-3"
      disabled={!categories.some(component => component.id === categoryId) ||
        title.trim().length < 2 || experiences.length >= 200}
      onClick={onAdd}>
      Add to my plan
    </Button>
    {experiences.length > 0 && <ul className="mt-4 space-y-2 text-sm">
      {experiences.map((item,index) => <li key={index}
        className="flex items-center justify-between gap-3 border p-3">
        <span>{item.title} · {readableBlueprintKey(item.kind)}</span>
        <Button type="button" variant="outline" onClick={() => onRemove(index)}>
          Remove
        </Button>
      </li>)}
    </ul>}
  </fieldset>;
}
