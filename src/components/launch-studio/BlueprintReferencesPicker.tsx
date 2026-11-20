import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import { readableBlueprintKey } from "@/domain/blueprint-display";
import type { BlueprintReferenceCatalogItem } from "@/domain/blueprint-reference-catalog";
import type { getCanonicalBlueprintWorkspace } from "@/modules/blueprints/blueprint-workspace.server";

type Component = Awaited<ReturnType<typeof getCanonicalBlueprintWorkspace>>["templates"][number]["components"][number];

/** Governed curated references for the Site's selected published components.
 * Selections remain draft intent until independently reviewed and authorized.
 */
export function BlueprintReferencesPicker({
  enabled, components, selected, catalog, selectedReferences, disabled, onToggle,
}: {
  enabled: boolean;
  components: readonly Component[];
  selected: readonly string[];
  catalog: readonly BlueprintReferenceCatalogItem[];
  selectedReferences: Readonly<Record<string, readonly string[]>>;
  disabled: boolean;
  onToggle: (componentId:string, versionId:string, checked:boolean)=>void;
}) {
  if(!enabled || !catalog.length) return null;
  return <>
    {components.filter(component=>selected.includes(component.id)).map(component=>{
      const available=catalog.filter(reference=>reference.kind===component.kind);
      if(!available.length)return null;
      return <fieldset key={component.id} className="border p-4" disabled={disabled}>
        <legend className="px-2 font-semibold">
          {readableBlueprintKey(component.key)} · curated references
        </legend>
        <div className="mt-2 grid max-h-52 gap-3 overflow-y-auto sm:grid-cols-2">
          {available.map(reference=><Label key={reference.versionId} className="flex items-start gap-3 text-sm">
            <Checkbox className="mt-1"
              checked={(selectedReferences[component.id]??[]).includes(reference.versionId)}
              onChange={event=>onToggle(component.id,reference.versionId,event.target.checked)}/>
            <span><strong className="block">{reference.title}</strong>
              <span className="text-muted-foreground">{reference.summary}</span>
            </span>
          </Label>)}
        </div>
      </fieldset>;
    })}
  </>;
}
