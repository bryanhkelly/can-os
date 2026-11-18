import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import type { AvailableOffering } from "@/domain/program-discovery";
import { normalizeClientError } from "@/lib/client-error";
import { discoverLaunchSitePrograms } from "@/modules/programs/program-discovery.functions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

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
  const [canonicalSiteId,setCanonicalSiteId]=useState<string|null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOfferings(null);
    setCanonicalSiteId(null);
    try {
      const result = await discoverLaunchSitePrograms({
        data: {
          publicSiteId:siteId,
          deliveryContext,
        },
      });
      setOfferings(result.items);
      setCanonicalSiteId(result.canonicalSiteId);
    } catch (caught) {
      setError(normalizeClientError(caught, "Program discovery could not be completed. Try again.").message);
    } finally {
      setLoading(false);
    }
  }

  return <section className="mt-6 border bg-card p-6" aria-labelledby="program-discovery-title">
    <h2 id="program-discovery-title" className="font-serif text-2xl">Explore available programs</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">
      Review published Programs and Courses for this Site and delivery model.
      Discovery is advisory; it does not qualify or approve a program.
    </p>
    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={handleSubmit}>
      <Label className="min-w-52 flex-1 text-sm font-medium" htmlFor="program-delivery-context">
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
      </Label>
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
          {canonicalSiteId&&<Link to="/class" search={{view:"manage",siteId:canonicalSiteId,
              offeringVersionId:offering.offeringVersionId}}
            className="mt-4 inline-flex min-h-11 items-center border border-border px-4 py-2 text-sm font-semibold text-primary">
            Check authorized Course adoption and configure Class
          </Link>}
          <p className="mt-2 text-xs text-muted-foreground">
            A published Offering does not itself grant Course adoption, Class creation or enrollment.
          </p>
        </article>,
      )}
    </div>}
    <p className="mt-4 text-xs leading-5 text-muted-foreground" role="note">
      A discovery result does not create a program, grant approval, or authorize operation.
    </p>
  </section>;
}
