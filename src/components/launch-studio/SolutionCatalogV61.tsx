import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Layers3 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState, FilterBar, WorkspacePanel } from "@/components/workspace";
import { normalizeClientError } from "@/lib/client-error";
import { readCanonicalBlueprintWorkspace } from "@/modules/blueprints/blueprint-studio.functions";
import type { getCanonicalBlueprintWorkspace } from "@/modules/blueprints/blueprint-workspace.server";
import { filterPublishedSolutionRecipes, resolveVisibleSolutionRecipe } from "@/domain/launch-prepare-v61";

type BlueprintWorkspace = Awaited<ReturnType<typeof getCanonicalBlueprintWorkspace>>;

function readable(code: string): string {
  return code.replaceAll("_", " ").replaceAll("-", " ");
}

/**
 * Browse published, versioned Blueprint recipes without creating a second
 * Solution/adoption store. The server returns only recipes for an authorized
 * canonical Site and is the sole owner of capability and operator checks.
 */
export function SolutionCatalogV61({ siteId }: { siteId: string }) {
  const [workspace, setWorkspace] = useState<BlueprintWorkspace | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setWorkspace(null);
    setSelectedId(null);
    setError(null);
    setQuery("");
    void readCanonicalBlueprintWorkspace({ data: { siteId } })
      .then(result => { if (active) setWorkspace(result); })
      .catch(caught => { if (active) setError(normalizeClientError(caught,
        "Published Solutions could not be loaded for this Site.").message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [siteId, reload]);

  const templates = workspace?.templates ?? [];
  const visible = filterPublishedSolutionRecipes(templates, query);
  const selected = resolveVisibleSolutionRecipe(visible, selectedId);

  return <WorkspacePanel title="Available Solutions"
    description="Explore published Solution models and the operational components they include.">
    {loading && <p role="status" className="text-sm">Loading published Solutions…</p>}
    {error && <div role="alert" className="border border-destructive/30 bg-card p-4 text-sm">
      <p className="font-semibold">Unable to load Solutions</p>
      <p className="mt-2 text-muted-foreground">{error}</p>
      <p className="mt-2 text-muted-foreground">Published Offerings below have a separate access check.</p>
      <Button type="button" variant="outline" size="sm" className="mt-3"
        onClick={() => setReload(value => value + 1)}>Retry Program Catalog</Button>
    </div>
    {workspace && <>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{templates.length} published {templates.length === 1 ? "Solution" : "Solutions"}</span>
        <span>{workspace.configurations.length} saved Site {workspace.configurations.length === 1 ? "configuration" : "configurations"}</span>
      </div>
      {templates.length === 0 ? <EmptyState title="No published Solutions"
        description="A Solution must be published and available to this Site before it can be configured." className="mt-4" /> : <>
        <FilterBar label="Published Solutions" query={query}
          onQueryChange={value => { setQuery(value); setSelectedId(null); }}
          searchLabel="Search published Solutions"
          searchPlaceholder="Search titles or components" className="mt-5" />
        <p role="status" className="mt-3 text-xs text-muted-foreground">{visible.length} matching published Solutions</p>
        {visible.length === 0 ? <EmptyState kind="matches" className="mt-4"
          title="No matching Solutions" description="Try another title or component." /> :
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div role="group" className="grid max-h-[34rem] gap-2 overflow-y-auto" aria-label="Published Solutions">
              {visible.map(template => {
                const active = selected?.blueprintVersionId === template.blueprintVersionId;
                return <Button key={template.blueprintVersionId} type="button"
                  variant="ghost" onClick={() => setSelectedId(template.blueprintVersionId)}
                  aria-pressed={active}
                  className={"h-auto min-h-20 w-full justify-start whitespace-normal border p-4 text-left hover:bg-muted " +
                    (active ? "border-primary bg-accent" : "bg-background")}>
                  <span className="flex w-full items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center bg-muted"><Layers3 aria-hidden="true" className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{template.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">Version {template.versionNo} · {template.components.length} components</span>
                    </span>
                  </span>
                </Button>;
              })}
            </div>
            {selected && <article className="border bg-background" aria-label="Selected Solution detail">
              <div className="border-b bg-muted p-5">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><BookOpen aria-hidden="true" className="size-4" /> Published Solution model</div>
                <h3 className="mt-3 font-serif text-2xl">{selected.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">Version {selected.versionNo} · {selected.components.length} components in this published configuration</p>
              </div>
              <div className="space-y-5 p-5">
                <div>
                  <h4 className="text-sm font-semibold">Included operating components</h4>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">A required component comes from the published Solution model. It does not mean your Site has met that requirement or received legal approval.</p>
                  <div className="mt-3 space-y-2">
                    {selected.components.map(component => <div key={component.id} className="flex flex-wrap items-center justify-between gap-3 border p-3">
                      <span className="text-sm font-medium capitalize">{readable(component.key)}</span>
                      <span className="text-xs text-muted-foreground">{readable(component.requirementMode)} · {readable(component.kind)}</span>
                    </div>)}
                    {selected.components.length === 0 && <p className="text-sm text-muted-foreground">This Solution does not currently list any operating components.</p>}
                  </div>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">Detailed activities, resources, safety requirements and applicability are verified through the governed Solution and Site qualification workflows. This preview does not infer missing requirements.</p>
                {workspace.canConfigure ? <Button asChild>
                  <Link to="/canonical/blueprints" search={{siteId}}>
                    Configure this Solution <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </Button> : <p role="status" className="border bg-muted p-3 text-sm">
                  You can review Solutions but are not authorized to configure them for this Site.
                </p>}
              </div>
            </article>}
          </div>}
      </>}
    </>}
  </WorkspacePanel>;
}
