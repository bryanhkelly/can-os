import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionDialog, EmptyState, FilterBar, SelectionCard, WorkspacePanel } from "@/components/workspace";
import { normalizeClientError } from "@/lib/client-error";
import { readCanonicalBlueprintWorkspace } from "@/modules/blueprints/blueprint-studio.functions";
import type { getCanonicalBlueprintWorkspace } from "@/modules/blueprints/blueprint-workspace.server";
import {
  filterPublishedSolutionRecipes, matchingSolutionInterests,
  orderSolutionsByVision, preferredCatalogDelivery, resolveSavedSolutionPlan,
  resolveVisibleSolutionRecipe, selectSavedSolutionPlans,
} from "@/domain/launch-prepare-v61";
import type { SiteProgramsAudiencesV61 } from "@/domain/site-launch-preferences";
import type { BlueprintReferenceCatalogItem } from "@/domain/blueprint-reference-catalog";
import { academyReferenceMayBeSelected, noSchoolYearAvailability,
  type SchoolYearAvailability } from "@/domain/site-program-access-v61";
import { CanonicalBlueprintWorkspace } from "./CanonicalBlueprintWorkspace";

type BlueprintWorkspace = Awaited<ReturnType<typeof getCanonicalBlueprintWorkspace>>;

function readable(code: string): string {
  return code.replaceAll("_", " ").replaceAll("-", " ");
}

/**
 * Browse published, versioned Blueprint recipes without creating a second
 * Solution/adoption store. The server returns only recipes for an authorized
 * canonical Site and is the sole owner of capability and operator checks.
 */
export function SolutionCatalogV61({ siteId, intent, delivery, initialPlanId, schoolYearAvailability, schoolYearAcademyPrograms }: {
  siteId: string;
  /** Deep-link back to a Site-owned, version-pinned plan from other Prepare steps. */
  initialPlanId?: string;
  intent?: SiteProgramsAudiencesV61 | null;
  delivery?: "physical" | "digital" | "both" | null;
  schoolYearAvailability?: SchoolYearAvailability;
  schoolYearAcademyPrograms?: readonly BlueprintReferenceCatalogItem[];
}) {
  const [workspace, setWorkspace] = useState<BlueprintWorkspace | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [configuringVersionId, setConfiguringVersionId] = useState<string | null>(null);
  const [resumeConfigurationId, setResumeConfigurationId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editorState, setEditorState] = useState({
    unsaved: false, busy: false, reconciliationRequired: false,
  });
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<(() => void) | null>(null);

  function requestSwitch(action: () => void) {
    setSwitchError(null);
    if (editorState.busy) {
      setSwitchError("A Solution save or review action is still running. Complete it before switching plans.");
      return;
    }
    if (editorState.reconciliationRequired) {
      setSwitchError("The last write could not be reconciled. Reload the catalog before switching plans.");
      return;
    }
    if (editorState.unsaved) setPendingSwitch(() => action);
    else action();
  }
  function closeEditor() {
    setConfiguringVersionId(null);
    setResumeConfigurationId(null);
    setEditorState({ unsaved: false, busy: false, reconciliationRequired: false });
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setWorkspace(null);
    setSelectedId(null);
    setConfiguringVersionId(null);
    setResumeConfigurationId(null);
    setEditorState({ unsaved: false, busy: false, reconciliationRequired: false });
    setPendingSwitch(null);
    setError(null);
    setQuery("");
    void readCanonicalBlueprintWorkspace({ data: { siteId } })
      .then(result => {
        if (!active) return;
        if (result.siteId !== siteId) {
          throw new Error("The Solution catalog returned a different Site.");
        }
        setWorkspace(result);
        if (initialPlanId) {
          const saved = resolveSavedSolutionPlan(
            result.configurations, result.templates, initialPlanId);
          if (!saved) {
            setError("This saved Solution plan is unavailable for the selected Site. Choose an available plan.");
          } else {
            setSelectedId(saved.template.blueprintVersionId);
            setConfiguringVersionId(saved.template.blueprintVersionId);
            setResumeConfigurationId(saved.plan.configurationId);
          }
        }
      })
      .catch(caught => { if (active) setError(normalizeClientError(caught,
        "Published Solutions could not be loaded for this Site.").message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [siteId, initialPlanId, reload]);

  const academyPrograms = new Map(
    (schoolYearAcademyPrograms ?? []).map(item => [item.code,item]));
  const isSchoolYearBlocked = (template: { programCode?: string | null }) => {
    const item = template.programCode ? academyPrograms.get(template.programCode) : null;
    return !!item && !academyReferenceMayBeSelected(
      item,schoolYearAvailability ?? noSchoolYearAvailability);
  };
  const templates = workspace?.templates ?? [];
  const filtered = filterPublishedSolutionRecipes(templates, query);
  const visible = orderSolutionsByVision(
    filtered, intent?.interestIds ?? [], intent?.startingFocus,
    intent?.programCodes ?? [], intent?.startingProgramCode,
  );
  const selected = resolveVisibleSolutionRecipe(visible, selectedId);
  const savedForSelected = selected
    ? selectSavedSolutionPlans(workspace?.configurations ?? [], selected.blueprintVersionId)
    : [];

  return <WorkspacePanel title="Available Solutions"
    description="Browse CAN-published Solutions and configure your Site plan. Definitions are maintained separately by CAN app administrators.">
    {switchError && <div role="alert" className="mt-3 border border-border bg-muted p-3 text-sm">
      <p>{switchError}</p>
      {editorState.reconciliationRequired && <Button type="button" variant="outline"
        size="sm" className="mt-2" onClick={() => setReload(value => value + 1)}>
        Reload catalog
      </Button>}
    </div>}
    {loading && <p role="status" className="text-sm">Loading published Solutions…</p>}
    {error && <div role="alert" className="border border-destructive/30 bg-card p-4 text-sm">
      <p className="font-semibold">Unable to load Solutions</p>
      <p className="mt-2 text-muted-foreground">{error}</p>
      <p className="mt-2 text-muted-foreground">
        Your verified Site administrator grant is sufficient for private Solution
        planning. If the catalog cannot load, check the service connection and
        try again. Saved Site plans are not changed by a failed read.
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-3"
        onClick={() => setReload(value => value + 1)}>Retry Program Catalog</Button>
    </div>}
    {workspace && <>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{templates.length} published {templates.length === 1 ? "Solution" : "Solutions"}</span>
        <span>{workspace.configurations.length} saved Site {workspace.configurations.length === 1 ? "configuration" : "configurations"}</span>
      </div>
      {templates.length === 0 ? <EmptyState title="No published Solutions"
        description="A Solution must be published and available to this Site before it can be configured." className="mt-4" /> : <>
        <FilterBar label="Published Solutions" query={query}
          onQueryChange={value => requestSwitch(() => {
            setQuery(value);
            setSelectedId(null);
            closeEditor();
          })}
          searchLabel="Search published Solutions"
          searchPlaceholder="Search titles or components" className="mt-5" />
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          {visible.length} matching published Solutions.
          {delivery && ` Saved Site delivery preference: ${delivery === "physical" ? "On site" :
            delivery === "digital" ? "Online" : "Hybrid or blended"} (planning only).`}
          {(intent?.interestIds.length || intent?.programCodes?.length)
            ? " Exact saved Program matches appear first. These are planning suggestions, not Site authorization."
            : ""}
        </p>
        {visible.length === 0 ? <EmptyState kind="matches" className="mt-4"
          title="No matching Solutions" description="Try another title or component." /> :
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div role="group" className="grid max-h-[34rem] gap-2 overflow-y-auto" aria-label="Published Solutions">
              {visible.map(template => {
                const active = selected?.blueprintVersionId === template.blueprintVersionId;
                const visionMatches = matchingSolutionInterests(template, intent?.interestIds ?? []);
                const matchesProgram = !!template.programCode &&
                  !!intent?.programCodes?.includes(template.programCode);
                const academicBlocked = isSchoolYearBlocked(template);
                return <SelectionCard key={template.blueprintVersionId}
                  kind="radio" name="published-solution" value={template.blueprintVersionId}
                  checked={active} disabled={academicBlocked}
                  onChange={checked=>{if(checked)requestSwitch(() => {
                    setSelectedId(template.blueprintVersionId);
                    closeEditor();
                  });}}
                  icon={<span className="flex size-9 shrink-0 items-center justify-center bg-muted"><Layers3 aria-hidden="true" className="size-4" /></span>}
                  title={template.title}
                  detail={<>
                    <span className="block">Version {template.versionNo} · {template.components.length} components</span>
                    {academicBlocked && <span className="mt-1 block font-medium">Grades 6–12 academy · authorization required</span>}
                    {matchesProgram && <span className="mt-1 block font-semibold text-primary">Matches a Program selected in Establish</span>}
                    {visionMatches.length > 0 && <span className="mt-1 block font-medium text-primary">
                      Matches {visionMatches.length} saved {visionMatches.length === 1 ? "interest" : "interests"} by title or component
                    </span>}
                  </>}
                  className="w-full" />;
              })}
            </div>
            {selected && <article className="border bg-background" aria-label="Selected Solution detail">
              <div className="border-b bg-muted p-5">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><BookOpen aria-hidden="true" className="size-4" /> Published Solution model</div>
                <h3 className="mt-3 font-serif text-2xl">{selected.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">Version {selected.versionNo} · {selected.components.length} components in this published configuration</p>
                {selected.offeringCode && <p className="mt-2 text-xs text-muted-foreground">
                  Linked Offering: {selected.offeringCode}. Publication, adoption and learner enrollment must each be authorized independently.
                </p>}
              </div>
              <div className="space-y-5 p-5">
                <div>
                  <h4 className="text-sm font-semibold">Included operating components</h4>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">A required component comes from the published Solution model. It does not mean your Site has met that requirement or received legal approval.</p>
                  <div className="mt-3 space-y-2">
                    {selected.components.map(component => <div key={component.id} className="flex flex-wrap items-start justify-between gap-3 border p-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium capitalize">{readable(component.key)}</span>
                        {component.description && <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {component.description}
                        </p>}
                        {component.requiresIndependentReview && <p className="mt-1 text-xs text-muted-foreground">
                          Independent review required before operation
                        </p>}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{readable(component.requirementMode)} · {readable(component.kind)}</span>
                    </div>)}
                    {selected.components.length === 0 && <p className="text-sm text-muted-foreground">This Solution does not currently list any operating components.</p>}
                  </div>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">Detailed activities, resources, safety requirements and applicability are verified through the governed Solution and Site qualification workflows. This preview does not infer missing requirements.</p>
                {isSchoolYearBlocked(selected) ?
                  <p className="border bg-muted p-3 text-sm text-muted-foreground">
                    This academic school-year Solution is not enabled for the Site.
                    Other community learning Solutions remain available for planning.
                  </p> : workspace.canConfigure ? <div className="space-y-3">
                  <Button type="button" onClick={() => requestSwitch(() => {
                    setEditorState({ unsaved: false, busy: false, reconciliationRequired: false });
                    setResumeConfigurationId(null);
                    setConfiguringVersionId(selected.blueprintVersionId);
                  })}>
                    Start a Solution plan <ArrowRight aria-hidden="true" className="size-4" />
                  </Button>
                  {savedForSelected.length > 0 &&
                    <div className="border-t pt-3">
                      <h4 className="text-sm font-semibold">Continue saved plans</h4>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {savedForSelected.map(configuration => <Button key={configuration.configurationId}
                            type="button" variant="outline" size="sm"
                            onClick={() => requestSwitch(() => {
                              setEditorState({ unsaved: false, busy: false, reconciliationRequired: false });
                              setResumeConfigurationId(configuration.configurationId);
                              setConfiguringVersionId(selected.blueprintVersionId);
                            })}>
                            {configuration.name} · {configuration.lifecycle === "frozen" ? "In review" : "Draft"}
                          </Button>)}
                      </div>
                    </div>}
                </div> : <p role="status" className="border bg-muted p-3 text-sm">
                  You can review Solutions but are not authorized to configure them for this Site.
                </p>}
              </div>
            </article>}
          </div>}
      </>}
    </>}
    {configuringVersionId && workspace?.canConfigure &&
      !isSchoolYearBlocked({programCode:templates.find(item =>
        item.blueprintVersionId===configuringVersionId)?.programCode}) && <>
      <div className="mt-6 border-t pt-5">
        <Button type="button" variant="outline" onClick={() => requestSwitch(closeEditor)}>
          Return to Solution details
        </Button>
      </div>
      <CanonicalBlueprintWorkspace key={siteId + ":" + configuringVersionId + ":" + (resumeConfigurationId ?? "new")}
        siteId={siteId} initialBlueprintVersionId={configuringVersionId}
        initialConfigurationId={resumeConfigurationId ?? undefined}
        initialDelivery={preferredCatalogDelivery(delivery)}
        onWorkspaceChanged={updated => setWorkspace(current =>
          current?.siteId === updated.siteId ? updated : current)}
        onUnsavedChange={setEditorState}
        embedded enableReferences />
    </>}
    <p className="mt-6 border-t pt-4 text-xs leading-5 text-muted-foreground">
      When a selected Solution includes a Program model, you can choose its approved
      published learning products while configuring the Site plan. Adoption, class
      publication, and enrollment each require separate authorization.
    </p>
    <ActionDialog open={Boolean(pendingSwitch)}
      title="Discard unsaved Solution changes?"
      description="Your edits to the selected Site plan have not been saved. Discarding them will not alter any saved revisions or published CAN Solutions."
      confirmLabel="Discard changes" destructive
      onClose={() => setPendingSwitch(null)}
      onConfirm={() => {
        const action = pendingSwitch;
        setPendingSwitch(null);
        if (action) action();
      }} />
  </WorkspacePanel>;
}
