import { useState } from "react";
import {
  blueprintReferenceKinds,
  type BlueprintReferenceCatalogItem,
  type BlueprintReferenceKind,
} from "@/domain/blueprint-reference-catalog";
import { exploreCanonicalBlueprintReferences } from "@/modules/blueprints/blueprint-studio.functions";
import { normalizeClientError } from "@/lib/client-error";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

const kindLabels: Record<BlueprintReferenceKind, string> = {
  program_model: "Program models",
  community: "Community",
  experience: "Experiences",
  club: "Clubs",
  activity: "Activities",
};

type KindFilter = BlueprintReferenceKind | "all";

/**
 * Planning-only reference library. It deliberately has no "add", "approve",
 * "publish", or "activate" action until canonical Blueprint write policies and
 * independently reviewed execution are wired and accepted.
 */
export function BlueprintReferenceCatalogPanel({ siteId }: { siteId: string }) {
  const [items, setItems] = useState<BlueprintReferenceCatalogItem[] | null>(null);
  const [filter, setFilter] = useState<KindFilter>("program_model");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadLibrary() {
    setLoading(true);
    setError(null);
    try {
      setItems(await exploreCanonicalBlueprintReferences({ data: { siteId } }));
    } catch (caught) {
      setError(normalizeClientError(caught, "The Blueprint reference library is unavailable.").message);
    } finally {
      setLoading(false);
    }
  }

  const visible = items?.filter(item => filter === "all" || item.kind === filter) ?? [];
  return <section className="mt-6 border bg-card p-6" aria-labelledby="blueprint-reference-catalog-title">
    <h2 id="blueprint-reference-catalog-title" className="font-serif text-2xl">
      Explore the School Blueprint library
    </h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">
      Review CAN's curated program models, community ideas, experiences, clubs, and activities.
      These are planning references, not adopted Offerings or approved programs.
    </p>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label htmlFor="blueprint-reference-kind" className="min-w-48 flex-1 text-sm font-medium">
        Library category
        <Select
          id="blueprint-reference-kind"
          className="mt-2"
          value={filter}
          onChange={event => setFilter(event.currentTarget.value as KindFilter)}
        >
          <option value="all">All reference types</option>
          {blueprintReferenceKinds.map(kind =>
            <option key={kind} value={kind}>{kindLabels[kind]}</option>,
          )}
        </Select>
      </label>
      <Button type="button" disabled={loading} onClick={() => void loadLibrary()}>
        {loading ? "Loading library..." : items ? "Refresh library" : "Browse reference library"}
      </Button>
    </div>
    {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
    {items && <p className="mt-4 text-sm text-muted-foreground" role="status">
      {visible.length} {filter === "all" ? "published references" : kindLabels[filter].toLowerCase()} available to preview
    </p>}
    {items && visible.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-2">
      {visible.map(item => <article key={item.itemId} className="border bg-background p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {kindLabels[item.kind]} · {item.category.replaceAll("_", " ")}
        </p>
        <h3 className="mt-2 font-semibold">{item.title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.summary}</p>
      </article>)}
    </div>}
    <p className="mt-5 text-xs leading-5 text-muted-foreground">
      Reference only. Browsing does not change your School Blueprint, enroll learners,
      publish a website, or authorize a school or learning center to operate.
    </p>
  </section>;
}
