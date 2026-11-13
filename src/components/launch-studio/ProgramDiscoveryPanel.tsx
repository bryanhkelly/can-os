import { useState, type FormEvent } from "react";
import type { AvailableOffering } from "@/domain/program-discovery";
import { normalizeClientError } from "@/lib/client-error";
import { discoverPrograms } from "@/modules/programs/program-discovery.functions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

const deliveryOptions = [
  { value: "onsite", label: "On site" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
] as const;
type DeliveryContext = (typeof deliveryOptions)[number]["value"];

function readableStatus(value: string): string {
  return value.replaceAll("_", " ");
}

export function ProgramDiscoveryPanel({ siteId }: { siteId: string }) {
  const [deliveryContext, setDeliveryContext] = useState<DeliveryContext>("onsite");
  const [offerings, setOfferings] = useState<AvailableOffering[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOfferings(null);
    try {
      const result = await discoverPrograms({
        data: {
          subject: { kind: "site", siteId },
          deliveryContext,
        },
      });
      setOfferings(result);
    } catch (caught) {
      setError(normalizeClientError(caught, "Program discovery could not be completed. Try again.").message);
    } finally {
      setLoading(false);
    }
  }

  return <section className="mt-6 border bg-card p-6" aria-labelledby="program-discovery-title">
    <h2 id="program-discovery-title" className="font-serif text-2xl">Explore available programs</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">
      Review published programs that may fit this school and delivery model.
      Discovery is advisory; it does not qualify or approve a program.
    </p>
    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={handleSubmit}>
      <label className="min-w-52 flex-1 text-sm font-medium" htmlFor="program-delivery-context">
        Delivery model
        <Select
          id="program-delivery-context"
          className="mt-2"
          value={deliveryContext}
          disabled={loading}
          onChange={event => {
            const selected = deliveryOptions.find(option => option.value === event.currentTarget.value);
            if (selected) setDeliveryContext(selected.value);
          }}
        >
          {deliveryOptions.map(option =>
            <option key={option.value} value={option.value}>{option.label}</option>,
          )}
        </Select>
      </label>
      <Button type="submit" disabled={loading}>
        {loading ? "Searching..." : "Find available programs"}
      </Button>
    </form>
    {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
    {offerings && offerings.length === 0 &&
      <p className="mt-4 border bg-muted p-4 text-sm" role="status">No published programs were found for this selection.</p>}
    {offerings && offerings.length > 0 && <div className="mt-5 space-y-3" aria-live="polite">
      {offerings.map(({ offering, availability }) =>
        <article key={offering.offeringVersionId} className="border bg-background p-4">
          <h3 className="font-semibold">{offering.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">Version {offering.versionNo}</p>
          <div className="mt-3 space-y-3">
            {availability.map(policy =>
              <div key={policy.policyVersionId} className="border-t pt-3 text-sm">
                <p className="font-medium">Catalog: {readableStatus(policy.catalogStatus)}</p>
                <p className="mt-1 text-muted-foreground">
                  Provider support: {readableStatus(policy.providerSupport)} · Regulatory status: {readableStatus(policy.regulatoryStatus)}
                </p>
                <p className="mt-2 text-muted-foreground">{policy.explanation}</p>
              </div>,
            )}
          </div>
        </article>,
      )}
    </div>}
    <p className="mt-4 text-xs leading-5 text-muted-foreground" role="note">
      A discovery result does not create a program, grant approval, or authorize operation.
    </p>
  </section>;
}
