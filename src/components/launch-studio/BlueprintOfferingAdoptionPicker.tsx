import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { normalizeClientError } from "@/lib/client-error";
import type { AvailableOffering } from "@/domain/program-discovery";
import { discoverPrograms } from "@/modules/programs/program-discovery.functions";

export type BlueprintOfferingIntent = {
  componentId: string;
  offeringVersionId: string;
  configuration: Record<string, never>;
};

type Props = {
  siteId: string;
  components: readonly { id: string; key: string }[];
  selected: readonly BlueprintOfferingIntent[];
  onChange: (next: BlueprintOfferingIntent[]) => void;
  disabled?: boolean;
};

/**
 * Adopting an Offering here records an intent in a private Blueprint draft.
 * It never creates a Deployment, activates a program, or overrides program fit.
 */
export function BlueprintOfferingAdoptionPicker({
  siteId, components, selected, onChange, disabled = false,
}: Props) {
  const [deliveryContext, setDeliveryContext] = useState<"onsite" | "remote" | "hybrid">("onsite");
  const [offerings, setOfferings] = useState<AvailableOffering[] | null>(null);
  const [targetComponentId, setTargetComponentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setOfferings(null);
    setTargetComponentId("");
  }, [siteId]);

  async function discover() {
    setLoading(true);
    setError(null);
    try {
      setOfferings(await discoverPrograms({
        data: { subject: { kind: "site", siteId }, deliveryContext },
      }));
    } catch (caught) {
      setError(normalizeClientError(caught, "Published Offerings could not be loaded.").message);
    } finally {
      setLoading(false);
    }
  }

  const available = offerings?.filter(item => item.availability.some(policy =>
    policy.catalogStatus === "supported" || policy.catalogStatus === "conditional"
  )) ?? [];
  return <fieldset className="border p-4" disabled={disabled} aria-label="Published Offering adoption">
    <legend className="px-2 font-semibold">Adopt a published Offering</legend>
    <p className="mt-2 text-sm text-muted-foreground">
      Connect a published educational product to a selected program component.
      Its availability is advisory. Independent review is required before execution.
    </p>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label htmlFor="blueprint-offering-delivery" className="min-w-44 flex-1 text-sm">
        Delivery model
        <Select id="blueprint-offering-delivery" className="mt-2" value={deliveryContext}
          onChange={event => {
            const next = event.currentTarget.value as typeof deliveryContext;
            setDeliveryContext(next);
            setOfferings(null);
          }}>
          <option value="onsite">On site</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
        </Select>
      </label>
      <Button type="button" variant="outline" onClick={() => void discover()} disabled={loading}>
        {loading ? "Checking availability…" : "Find published Offerings"}
      </Button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {offerings && offerings.length === 0 && <p role="status" className="mt-3 text-sm">
      No published Offerings were found for this Site and delivery model.
    </p>}
    {available.length > 0 && <label htmlFor="blueprint-offering-component"
      className="mt-4 block text-sm">
      Add to Blueprint component
      <Select id="blueprint-offering-component" className="mt-2"
        value={targetComponentId}
        onChange={event => setTargetComponentId(event.currentTarget.value)}>
        <option value="">Choose a program component</option>
        {components.map(component =>
          <option key={component.id} value={component.id}>
            {component.key.replaceAll("_", " ")}
          </option>)}
      </Select>
    </label>}
    {offerings && offerings.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-2">
      {offerings.map(item => {
        const selectable = item.availability.some(policy =>
          policy.catalogStatus === "supported" || policy.catalogStatus === "conditional"
        );
        const attached = selected.some(intent =>
          intent.offeringVersionId === item.offering.offeringVersionId &&
          intent.componentId === targetComponentId
        );
        return <article key={item.offering.offeringVersionId} className="border bg-background p-4">
          <h3 className="font-semibold">{item.offering.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.offering.code} · v{item.offering.versionNo}
          </p>
          <p className="mt-2 text-sm">
            {item.availability.map(policy =>
              policy.catalogStatus.replaceAll("_", " ")).join(", ")}
          </p>
          {!selectable && <p className="mt-2 text-xs text-muted-foreground">
            Not available for planning with this Site and delivery selection
          </p>}
          <Button className="mt-3" type="button" variant="outline"
            disabled={!selectable || !targetComponentId || attached}
            onClick={() => onChange([...selected, {
              componentId: targetComponentId,
              offeringVersionId: item.offering.offeringVersionId,
              configuration: {},
            }])}>
            {attached ? "Added to this component" : "Add to private plan"}
          </Button>
        </article>;
      })}
    </div>}
    {selected.length > 0 && <div className="mt-5">
      <h3 className="font-semibold">Planned Offering adoptions</h3>
      <ul className="mt-2 space-y-2">
        {selected.map(intent =>
          <li key={intent.componentId + ":" + intent.offeringVersionId}
            className="flex flex-wrap items-center justify-between gap-3 border p-3 text-sm">
            <span>
              {offerings?.find(item => item.offering.offeringVersionId === intent.offeringVersionId)
                ?.offering.title ?? `Offering ${intent.offeringVersionId}`}
              {" · "}
              {components.find(item => item.id === intent.componentId)?.key.replaceAll("_", " ") ??
                intent.componentId}
            </span>
            <Button type="button" variant="outline"
              onClick={() => onChange(selected.filter(item =>
                !(item.componentId === intent.componentId &&
                  item.offeringVersionId === intent.offeringVersionId)
              ))}>Remove</Button>
          </li>)}
      </ul>
    </div>}
    <p className="mt-4 text-xs text-muted-foreground">
      Adding an Offering does not establish regulatory approval, enrollment, or permission to operate.
    </p>
  </fieldset>;
}
