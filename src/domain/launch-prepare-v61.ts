/** Shared V6.1 Prepare navigation metadata. Requirements and readiness are not
 * defined here: each owning operational service determines those dynamically. */
export const prepareStageModulesV61 = [
  { id: "program-catalog", title: "Program Catalog", subtitle: "Find available learning experiences and their operating requirements." },
  { id: "facilities-resources", title: "Facilities & Resources", subtitle: "Confirm the spaces, equipment and technology you can provide." },
  { id: "invite-team", title: "Team & Responsibilities", subtitle: "Bring people into the right scoped roles and verify qualifications." },
  { id: "schedules-capacity", title: "Schedules & Capacity", subtitle: "Define dates, days, sessions, rooms and available seats." },
  { id: "funding-enrollment", title: "Funding & Admissions Setup", subtitle: "Prepare funding, tuition, admissions policies and capacity before enrollment can open." },
  { id: "opening-compliance", title: "Safety & Readiness", subtitle: "Collect evidence and request independent opening decisions." },
  { id: "publish-site", title: "Publish Site", subtitle: "Review and launch your official public website without opening enrollment." },
] as const;

export type PrepareStageModuleIdV61 = (typeof prepareStageModulesV61)[number]["id"];

/** Search and selection are pure UI projections. Never infer Site authorization. */
export function filterPublishedSolutionRecipes<T extends {
  title: string; components: readonly { key: string }[];
  programCode?: string | null; offeringCode?: string | null;
}>(templates: readonly T[], query: string): T[] {
  const term = query.trim().toLowerCase();
  if (!term) return [...templates];
  return templates.filter(template =>
    [template.title, template.programCode ?? "", template.offeringCode ?? "",
      ...template.components.map(component => component.key)]
      .some(value => value.toLowerCase().includes(term)));
}

/** Informational title/component alignment, not a Site qualification or approval.
 * CAN-owned metadata can eventually replace this conservative lexical signal. */
const normalizeDiscoveryTerm = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function matchingSolutionInterests<T extends {
  title: string; components: readonly { key: string }[];
}>(recipe: T, interestIds: readonly string[]): string[] {
  const labels = [recipe.title, ...recipe.components.map(component => component.key)]
    .map(normalizeDiscoveryTerm);
  return interestIds.filter(id => {
    const normalized = normalizeDiscoveryTerm(id);
    return normalized.length > 0 && labels.some(label => label.includes(normalized));
  });
}

/** Prefer matches to saved Site vision without suppressing other published options. */
export function orderSolutionsByVision<T extends {
  title: string; components: readonly { key: string }[];
  programCode?: string | null;
}>(
  recipes: readonly T[], interestIds: readonly string[],
  startingFocus?: string | null, programCodes: readonly string[] = [],
  startingProgramCode?: string | null,
): T[] {
  const score = (recipe: T) => {
    const matches = matchingSolutionInterests(recipe, interestIds);
    const exactProgramMatch = !!recipe.programCode && programCodes.includes(recipe.programCode);
    return (exactProgramMatch ? 10 : 0)
      + (exactProgramMatch && startingProgramCode === recipe.programCode ? 20 : 0)
      + matches.length + (startingFocus && matches.includes(startingFocus) ? 2 : 0);
  };
  return [...recipes].sort((left, right) => score(right) - score(left));
}

/** A hidden/out-of-filter recipe must never remain in the visible detail pane. */
export function resolveVisibleSolutionRecipe<T extends { blueprintVersionId: string }>(
  visible: readonly T[], selectedId: string | null,
): T | undefined {
  return visible.find(template => template.blueprintVersionId === selectedId) ?? visible[0];
}

/** An Establish delivery preference guides catalog discovery; it is not
 * a verified delivery configuration or a restriction on available options. */
export function preferredCatalogDelivery(
  delivery: "physical" | "digital" | "both" | null | undefined,
): "onsite" | "remote" | "hybrid" {
  return delivery === "digital" ? "remote"
    : delivery === "both" ? "hybrid" : "onsite";
}
