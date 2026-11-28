/** Registry declarations, not observed application behavior. No runtime or private data. */
export type AdoptionRoute = {
  path: string;
  layout: string | null;
  persona: string;
  review: string;
  patterns: readonly string[];
  stories: readonly string[];
  boundaryReason?: string | null;
  evidence?: Record<string, unknown>;
};
export type AdoptionRegistry = {
  layouts: Record<string, string>;
  layoutReferences: Record<string, string>;
  routes: readonly AdoptionRoute[];
};
const evidenceKeys = ["responsive", "accessibility", "visual", "browserJourney"] as const;
const present = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;
export function adoptionSummary(registry: AdoptionRegistry) {
  const rows = registry.routes.map(route => {
    const knownLayout = route.layout !== null && Object.hasOwn(registry.layouts, route.layout);
    const boundary = route.review === "boundary" && route.layout === null && present(route.boundaryReason);
    const linked = route.stories.some(present);
    const missing: string[] = [];
    if (!boundary) {
      if (!knownLayout) missing.push("layout");
      if (!present(route.persona)) missing.push("persona");
      if (!linked) missing.push("stories");
      if (!route.patterns.length || !route.patterns.every(present)) missing.push("patterns");
      for (const key of evidenceKeys) if (!present(route.evidence?.[key])) missing.push(key);
      if (route.review !== "verified") missing.push("route review");
    }
    return {...route, linked, boundary, complete: !boundary && missing.length === 0,
      layoutKey: boundary ? "boundary" : knownLayout ? route.layout! : "unclassified", missing};
  });
  const groupDefinitions: [string,string][] = [...Object.entries(registry.layouts), ["unclassified","Unclassified routes"], ["boundary","Reviewed non-page boundaries"]];
  const groups = groupDefinitions.map(([key,label]) => {
      const items = rows.filter(row => row.layoutKey === key);
      return {key, label, total:items.length, linked:items.filter(row => row.linked).length,
        complete:items.filter(row => row.complete).length, boundary:items.filter(row => row.boundary).length,
        pending:items.filter(row => !row.complete && !row.boundary).length};
    });
  return {
    total:rows.length,
    linked:rows.filter(row=>row.linked).length,
    complete:rows.filter(row=>row.complete).length,
    boundary:rows.filter(row=>row.boundary).length,
    pending:rows.filter(row=>!row.complete&&!row.boundary).length,
    layoutReferences:Object.keys(registry.layouts).filter(key=>present(registry.layoutReferences[key])).length,
    layouts:Object.keys(registry.layouts).length,
    rows,groups,
  };
}
