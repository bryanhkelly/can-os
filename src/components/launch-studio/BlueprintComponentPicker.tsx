import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import { readableBlueprintKey } from "@/domain/blueprint-display";
import type { getCanonicalBlueprintWorkspace } from "@/modules/blueprints/blueprint-workspace.server";

type Template = Awaited<ReturnType<typeof getCanonicalBlueprintWorkspace>>["templates"][number];
type Component = Template["components"][number];

/** Controlled CAN-published Blueprint component selector. The Site cannot
 * override required elements or independent evidence-review requirements.
 */
export function BlueprintComponentPicker({
  components, selected, disabled, onToggle,
}: {
  components: readonly Component[];
  selected: readonly string[];
  disabled: boolean;
  onToggle: (componentId:string,checked:boolean)=>void;
}) {
  const selectedComponents=selected;
  return <fieldset className="border p-4" disabled={disabled}>
            <legend className="px-2 font-semibold">Blueprint components</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {components.map(component =>
                <Label key={component.id} className="flex items-center gap-3 text-sm">
                  <Checkbox checked={selectedComponents.includes(component.id)}
                    disabled={component.requirementMode === "required" || disabled}
                    onChange={event=>onToggle(component.id,event.target.checked)}/>
                  <span className="min-w-0">
                    <span className="block font-medium">{readableBlueprintKey(component.key)}
                      {component.requirementMode === "required" ? " · required" :
                        component.requirementMode === "conditional" ? " · conditional" : ""}
                    </span>
                    {component.description && <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {component.description}
                    </span>}
                    {component.requiresIndependentReview && <span className="mt-1 block text-xs text-muted-foreground">
                      Independent verification remains separate from planning
                    </span>}
                  </span>
                </Label>)}
            </div>
          </fieldset>;
}
