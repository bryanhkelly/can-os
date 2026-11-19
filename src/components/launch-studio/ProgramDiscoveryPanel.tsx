import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { canPlanOffering, type AvailableOffering } from "@/domain/program-discovery";
import { normalizeClientError } from "@/lib/client-error";
import { discoverLaunchSitePrograms, getLaunchSiteClassScope } from "@/modules/programs/program-discovery.functions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { EmptyState, FilterBar, StatusBadge } from "@/components/workspace";
import { Field } from "@/components/ui/field";

const deliveryOptions = [
  { value: "onsite", label: "On site" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
] as const;
type DeliveryContext = (typeof deliveryOptions)[number]["value"];
type AvailabilityFilter = "all" | "plan" | "review";

function readableStatus(value: string): string {
  return value.replaceAll("_", " ");
}

/** Real catalog discovery and governed planning handoff, with no parallel selection store. */
export function ProgramDiscoveryPanel({ siteId, initialDelivery = "onsite" }: {
  siteId: string;
  initialDelivery?: DeliveryContext;
}) {
  const [deliveryContext, setDeliveryContext] = useState<DeliveryContext>(initialDelivery);
  const [offerings, setOfferings] = useState<AvailableOffering[] | null>(null);
  const [canonicalSiteId, setCanonicalSiteId] = useState<string | null>(null);
  const [classManagementAllowed, setClassManagementAllowed] = useState(false);
  const [query, setQuery] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);

  useEffect(() => {
    // A response from an older Site or an unmounted catalog must not be shown.
    requestVersion.current += 1;
    setOfferings(null);
    setCanonicalSiteId(null);
    setClassManagementAllowed(false);
    setError(null);
    setLoading(false);
    setQuery("");
    setAvailabilityFilter("all");
    return () => { requestVersion.current += 1; };
  }, [siteId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    setOfferings(null);
    setCanonicalSiteId(null);
    setClassManagementAllowed(false);
    try {
      const result = await discoverLaunchSitePrograms({
        data: { publicSiteId: siteId, deliveryContext },
      });
      if (version !== requestVersion.current) return;
      setOfferings(result.items);
      setCanonicalSiteId(result.canonicalSiteId);
      // Class permission is independent from catalog access. Do not perform
      // the secondary privileged read if discovery fails, and never block
      // Offering results while that read completes.
      if (result.items.some(canPlanOffering)) {
        void getLaunchSiteClassScope({ data: { siteId } })
          .then(scope => {
            if (version === requestVersion.current)
              setClassManagementAllowed(scope.kind === "ready");
          })
          .catch(() => {
            if (version === requestVersion.current) setClassManagementAllowed(false);
          });
      }
    } catch (caught) {
      if (version === requestVersion.current)
        setError(normalizeClientError(caught, "Program discovery could not be completed. Try again.").message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  const visible = (offerings ?? []).filter(item => {
    const matchesQuery = [item.offering.title, item.offering.code]
      .some(value => value.toLowerCase().includes(query.trim().toLowerCase()));
    const matchesAvailability = availabilityFilter === "all" ||
      (availabilityFilter === "plan" ? canPlanOffering(item) : !canPlanOffering(item));
    return matchesQuery && matchesAvailability;
  });

  return <section className="border bg-card p-5 sm:p-6" aria-labelledby="program-discovery-title">
    <h2 id="program-discovery-title" className="font-serif text-2xl">Explore published learning experiences</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">
      Browse real published Offerings for your Site and delivery model. These results are advisory:
      they are not a verified match for facilities, staff, funding, jurisdiction or enrollment.
    </p>
    <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={handleSubmit}>
      <Label className="min-w-52 flex-1 text-sm font-medium" htmlFor="program-delivery-context">
        Delivery model
        <Select id="program-delivery-context" className="mt-2" value={deliveryContext}
          disabled={loading} onChange={event => {
            const selected = deliveryOptions.find(option => option.value === event.currentTarget.value);
            if (selected) {
              setDeliveryContext(selected.value);
              setOfferings(null);
              setCanonicalSiteId(null);
              setClassManagementAllowed(false);
              setError(null);
              setQuery("");
              setAvailabilityFilter("all");
            }
          }}>
          {deliveryOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      </Label>
      <Button type="submit" disabled={loading}>
        {loading ? "Checking availability..." : "Browse available Offerings"}
      </Button>
    </form>
    {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
    {offerings && <>
      <FilterBar label="Published Offerings" query={query} onQueryChange={setQuery}
        searchLabel="Search titles or codes" searchPlaceholder="Search published Offerings"
        filters={<Field label="Availability" className="min-w-48">
          <Select value={availabilityFilter}
            onChange={event => setAvailabilityFilter(event.target.value as AvailabilityFilter)}>
            <option value="all">All published results</option>
            <option value="plan">Available for planning</option>
            <option value="review">Not currently plannable</option>
          </Select>
        </Field>} />
      <p className="mt-4 text-xs text-muted-foreground" role="status">
        Showing {visible.length} of {offerings.length} published Offerings for {deliveryOptions.find(item => item.value === deliveryContext)?.label}.
      </p>
      {visible.length === 0 && <EmptyState className="mt-3" kind={offerings.length ? "matches" : "records"}
        title={offerings.length ? "No matching Offerings" : "No published Offerings available"}
        description="Try another search, availability filter, or delivery model." />
      {visible.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-2" aria-live="polite">
        {visible.map(item => {
          const { offering, availability } = item;
          const planEligible = canPlanOffering(item);
          const unavailable = !planEligible && availability.every(policy => policy.catalogStatus === "unavailable");
          return <article key={offering.offeringVersionId} className="flex flex-col border bg-background p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{offering.code} · v{offering.versionNo}</span>
              <StatusBadge tone={planEligible || unavailable ? "neutral" : "attention"}>
                {planEligible ? "Planning possible" : unavailable ? "Unavailable" : "Review required"}
              </StatusBadge>
            </div>
            <h3 className="mt-3 text-base font-semibold">{offering.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {planEligible
                ? "This Offering may be included in a private Blueprint plan. Independent qualification and approval still apply."
                : unavailable
                  ? "The current availability policies do not permit this Offering to be planned for the selected Site and delivery model."
                  : "The current availability policies require additional review before this Offering may be planned."}
            </p>
            <details className="mt-4 border-t pt-3">
              <summary className="cursor-pointer text-sm font-semibold">Review availability policies</summary>
              <div className="mt-3 space-y-3">
                {availability.map(policy => <div key={policy.policyVersionId} className="border-l-2 pl-3 text-xs leading-5">
                  <p className="font-semibold">Catalog: {readableStatus(policy.catalogStatus)}</p>
                  <p className="mt-1 text-muted-foreground">Provider: {readableStatus(policy.providerSupport)}
                    {" · "}Regulatory: {readableStatus(policy.regulatoryStatus)}</p>
                  <p className="mt-1">{policy.explanation}</p>
                </div>)}
              </div>
            </details>
            <div className="mt-auto pt-5">
              {canonicalSiteId && planEligible ?
                <div className="grid gap-2">
                  <Link to="/canonical/blueprints" search={{siteId: canonicalSiteId}}
                    className="inline-flex min-h-11 items-center justify-center border border-primary bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground">
                    Plan in Blueprint workspace
                  </Link>
                  {classManagementAllowed ? <Link to="/class" search={{view:"manage",siteId:canonicalSiteId,
                    offeringVersionId:offering.offeringVersionId}}
                    className="inline-flex min-h-11 items-center justify-center border px-4 py-2 text-center text-sm font-semibold text-primary">
                    Check Class configuration
                  </Link> : <p className="text-xs leading-5 text-muted-foreground">
                    Class configuration requires a separate verified Site permission.
                  </p>}
                </div> : <p className="text-xs text-muted-foreground">
                  {planEligible ? "Blueprint planning requires an authorized canonical Site." : "Not available for planning in the current context."}
                </p>}
            </div>
          </article>;
        })}
      </div>}
    </>}
    <p className="mt-5 text-xs leading-5 text-muted-foreground" role="note">
      Browsing never creates a Program, Solution, Blueprint adoption, Class or enrollment. Only the receiving authorized workflow records those decisions.
    </p>
  </section>;
}
