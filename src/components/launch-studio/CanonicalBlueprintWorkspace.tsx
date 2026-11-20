import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/choice";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/workspace";
import { BlueprintReviewHistoryPanel } from "./BlueprintReviewHistoryPanel";
import { BlueprintComponentPicker } from "./BlueprintComponentPicker";
import { BlueprintReferencesPicker } from "./BlueprintReferencesPicker";
import { readableBlueprintKey as readable } from "@/domain/blueprint-display";
import { normalizeClientError } from "@/lib/client-error";
import {
  createCanonicalBlueprintConfiguration,
  readCanonicalBlueprintConfiguration,
  readCanonicalBlueprintReview,
  readCanonicalBlueprintWorkspace,
  saveCanonicalBlueprintConfiguration,
  submitCanonicalBlueprintConfiguration,
  executeCanonicalBlueprintConfiguration,
} from "@/modules/blueprints/blueprint-studio.functions";
import type { getCanonicalBlueprintWorkspace } from "@/modules/blueprints/blueprint-workspace.server";
import type { BlueprintConfigurationDetail } from "@/modules/blueprints/blueprint-configuration.server";
import type { getBlueprintReview } from "@/modules/blueprints/blueprint-review.server";
import { blueprintEditorialIdentityKeys, includedBlueprintComponentIds } from "@/domain/blueprint-configuration";
import { replaceVisibleOfferingIntents, selectSavedSolutionPlans } from "@/domain/launch-prepare-v61";
import { exploreCanonicalBlueprintReferences } from "@/modules/blueprints/blueprint-studio.functions";
import type { BlueprintReferenceCatalogItem } from "@/domain/blueprint-reference-catalog";
import { BlueprintOfferingAdoptionPicker, type BlueprintOfferingIntent } from "./BlueprintOfferingAdoptionPicker";
import { useLaunchUnsavedChanges } from "./useLaunchUnsavedChanges";

type Workspace = Awaited<ReturnType<typeof getCanonicalBlueprintWorkspace>>;
type Template = Workspace["templates"][number];
type Review = Awaited<ReturnType<typeof getBlueprintReview>>;
type LocalExperienceDraft = BlueprintConfigurationDetail["localExperiences"][number] & {
  source: "proposed_local_experience";
};

type SolutionDraftFields = {
  name: string;
  templateId: string;
  editorialIdentity: string;
  religiousAffiliationCode: string;
  selectedComponents: readonly string[];
  selectedReferences: Readonly<Record<string, string[]>>;
  offeringAdoptions: readonly BlueprintOfferingIntent[];
  localExperiences: readonly LocalExperienceDraft[];
};

/** Only local editor inputs belong to the dirty snapshot. Published CAN-owned
 * Blueprint fields and independently approved readiness are never writable here. */
function solutionDraftSnapshot(fields: SolutionDraftFields): string {
  return JSON.stringify(fields);
}

/**
 * Canonical Blueprint preparation. A draft is Organization-owned and anchored
 * to a Site; freezing it requests review, not permission to operate.
 */
export function CanonicalBlueprintWorkspace({ siteId, enableReferences = false,
  initialBlueprintVersionId, initialConfigurationId, initialDelivery = "onsite",
  embedded = false, onWorkspaceChanged, onUnsavedChange,
}: {
  siteId: string;
  enableReferences?: boolean;
  initialBlueprintVersionId?: string;
  initialConfigurationId?: string;
  initialDelivery?: "onsite" | "remote" | "hybrid";
  embedded?: boolean;
  onWorkspaceChanged?: (workspace: Workspace) => void;
  onUnsavedChange?: (state: {
    unsaved: boolean; busy: boolean; reconciliationRequired: boolean;
  }) => void;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [detail, setDetail] = useState<BlueprintConfigurationDetail | null>(null);
  const [revisingFrozen, setRevisingFrozen] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [operationId, setOperationId] = useState("");
  const [executedDeployments, setExecutedDeployments] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [editorialIdentity, setEditorialIdentity] = useState<
    (typeof blueprintEditorialIdentityKeys)[number]
  >("community_belonging");
  const [religiousAffiliationCode, setReligiousAffiliationCode] = useState("");
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [selectedReferences, setSelectedReferences] = useState<Record<string, string[]>>({});
  const [offeringAdoptions, setOfferingAdoptions] = useState<BlueprintOfferingIntent[]>([]);
  const [referenceCatalog, setReferenceCatalog] = useState<BlueprintReferenceCatalogItem[]>([]);
  const [localExperiences, setLocalExperiences] = useState<LocalExperienceDraft[]>([]);
  const [localComponentId, setLocalComponentId] = useState("");
  const [localTitle, setLocalTitle] = useState("");
  const [localSummary, setLocalSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const [savedDraftSnapshot, setSavedDraftSnapshot] = useState(() =>
    solutionDraftSnapshot({
      name: "", templateId: "", editorialIdentity: "community_belonging",
      religiousAffiliationCode: "", selectedComponents: [], selectedReferences: {},
      offeringAdoptions: [], localExperiences: [],
    }));
  const currentDraftSnapshot = solutionDraftSnapshot({
    name, templateId, editorialIdentity, religiousAffiliationCode,
    selectedComponents, selectedReferences, offeringAdoptions, localExperiences,
  });
  const unsaved = currentDraftSnapshot !== savedDraftSnapshot;
  useLaunchUnsavedChanges(
    () => unsaved || busy || reconciliationRequired,
    "Leave Solution planning? Unsaved changes will be lost.",
  );
  useEffect(() => {
    onUnsavedChange?.({ unsaved, busy, reconciliationRequired });
  }, [onUnsavedChange, unsaved, busy, reconciliationRequired]);

  async function reload() {
    const next = await readCanonicalBlueprintWorkspace({ data: { siteId } });
    setWorkspace(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    setWorkspace(null);
    setDetail(null);
    setRevisingFrozen(false);
    setReview(null);
    setOperationId("");
    setExecutedDeployments(null);
    setLoading(true);
    setError(null);
    setReconciliationRequired(false);
    void readCanonicalBlueprintWorkspace({ data: { siteId } })
      .then(result => {
        if (cancelled) return;
        setWorkspace(result);
        if (initialBlueprintVersionId) {
          const initial = result.templates.find(template =>
            template.blueprintVersionId === initialBlueprintVersionId);
          if (!initial) {
            setError("The selected published Solution is no longer available for this Site.");
          } else if (initialConfigurationId) {
            const saved = result.configurations.some(configuration =>
              configuration.configurationId === initialConfigurationId &&
              configuration.blueprintVersionId === initialBlueprintVersionId);
            if (saved) void openConfiguration(initialConfigurationId, result);
            else setError("The requested Solution plan is not available for this Site and version.");
          } else {
            chooseTemplate(initial);
          }
        }
      })
      .catch(caught => {
        if (!cancelled) setError(normalizeClientError(caught, "Blueprint planning could not load.").message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId, initialBlueprintVersionId, initialConfigurationId]);

  useEffect(() => {
    if (!enableReferences) {
      setReferenceCatalog([]);
      return;
    }
    let cancelled = false;
    void exploreCanonicalBlueprintReferences({ data: { siteId } })
      .then(items => { if (!cancelled) setReferenceCatalog(items); })
      .catch(() => { if (!cancelled) setReferenceCatalog([]); });
    return () => { cancelled = true; };
  }, [siteId, enableReferences]);

  const selectedTemplate = workspace?.templates.find(template =>
    template.blueprintVersionId === templateId
  );

  function chooseTemplate(template: Template) {
    setTemplateId(template.blueprintVersionId);
    setSelectedReferences({});
    setOfferingAdoptions([]);
    setLocalExperiences([]);
    setLocalComponentId("");
    setLocalTitle("");
    setLocalSummary("");
    setRevisingFrozen(false);
    setSelectedComponents(template.components.filter(component =>
      component.requirementMode === "required"
    ).map(component => component.id));
    setDetail(null);
    setReview(null);
    setOperationId("");
    setExecutedDeployments(null);
    setName("");
    setEditorialIdentity("community_belonging");
    setReligiousAffiliationCode("");
    setSavedDraftSnapshot(solutionDraftSnapshot({
      name: "", templateId: template.blueprintVersionId,
      editorialIdentity: "community_belonging", religiousAffiliationCode: "",
      selectedComponents: template.components.filter(component =>
        component.requirementMode === "required").map(component => component.id),
      selectedReferences: {}, offeringAdoptions: [], localExperiences: [],
    }));
    setMessage(null);
  }

  async function openConfiguration(configurationId: string, available: Workspace | null = workspace): Promise<boolean> {
    if (embedded && initialBlueprintVersionId &&
        !available?.configurations.some(configuration =>
          configuration.configurationId === configurationId &&
          configuration.blueprintVersionId === initialBlueprintVersionId)) {
      setError("This saved plan is unavailable for the selected Site and Solution version.");
      return false;
    }
    setBusy(true);
    setRevisingFrozen(false);
    setOperationId("");
    setError(null);
    try {
      const result = await readCanonicalBlueprintConfiguration({ data: { configurationId } });
      // The server independently validates current Site scope. Refuse any stale
      // cross-Solution result before populating the editor as an extra UI safeguard.
      if (embedded && initialBlueprintVersionId &&
          result.blueprintVersionId !== initialBlueprintVersionId) {
        throw new Error("This saved plan belongs to another Solution version.");
      }
      if (!result.config || typeof result.config !== "object" ||
          Array.isArray(result.config) || result.config.siteId !== siteId) {
        throw new Error("The saved Solution plan no longer belongs to this Site.");
      }
      setDetail(result);
      setReview(null);
      setExecutedDeployments(null);
      if (result.lifecycle === "frozen") {
        try {
          const currentReview = await readCanonicalBlueprintReview({
            data: { configurationVersionId: result.versionId },
          });
          setReview(currentReview);
        } catch {
          // A temporarily unavailable review read must not hide the saved draft.
        }
      }
      setName(result.name);
      setEditorialIdentity(result.identity.editorialIdentity);
      setReligiousAffiliationCode(result.identity.religiousAffiliationCode ?? "");
      setOfferingAdoptions(result.offeringAdoptions);
      setSelectedComponents(result.components
        .filter(component => component.selectionStatus === "selected")
        .map(component => component.componentId));
      setLocalExperiences(result.localExperiences.map(item => ({ ...item, source: "proposed_local_experience" as const })));
      setLocalComponentId("");
      setLocalTitle("");
      setLocalSummary("");
      setSelectedReferences(Object.fromEntries(
        result.components.map(component => [
          component.componentId,
          component.referenceItemVersionIds,
        ])
      ));
      setTemplateId(result.blueprintVersionId);
      setSavedDraftSnapshot(solutionDraftSnapshot({
        name: result.name,
        templateId: result.blueprintVersionId,
        editorialIdentity: result.identity.editorialIdentity,
        religiousAffiliationCode: result.identity.religiousAffiliationCode ?? "",
        selectedComponents: result.components.filter(component =>
          component.selectionStatus === "selected").map(component => component.componentId),
        selectedReferences: Object.fromEntries(result.components.map(component =>
          [component.componentId, component.referenceItemVersionIds])),
        offeringAdoptions: result.offeringAdoptions,
        localExperiences: result.localExperiences.map(item =>
          ({ ...item, source: "proposed_local_experience" as const })),
      }));
      setMessage(null);
      return true;
    } catch (caught) {
      setError(normalizeClientError(caught, "This Solution plan could not be reopened.").message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function versionInput(template: Template, previous?: BlueprintConfigurationDetail) {
    const includedComponentIds = includedBlueprintComponentIds(
      selectedComponents,
      previous?.components ?? [],
    );
    return {
      config: { ...(previous?.config && typeof previous.config === "object" && !Array.isArray(previous.config)
        ? previous.config : {}), siteId },
      identity: {
        religiousAffiliationCode: religiousAffiliationCode.trim() || null,
        editorialIdentity,
        culturalContext: previous?.identity.culturalContext ?? {},
      },
      components: template.components.map(component => {
        const current = previous?.components.find(item => item.componentId === component.id);
        const selected = selectedComponents.includes(component.id);
        return {
          componentId: component.id,
          selectionStatus: selected ? "selected" as const
            : current?.selectionStatus === "proposed" ? "proposed" as const
            : "excluded" as const,
          referenceItemVersionIds: includedComponentIds.has(component.id)
            ? selectedReferences[component.id] ?? current?.referenceItemVersionIds ?? [] : [],
          settings: current?.settings && typeof current.settings === "object"
            && !Array.isArray(current.settings) ? current.settings : {},
        };
      }),
      offeringAdoptions: offeringAdoptions.filter(intent =>
        includedComponentIds.has(intent.componentId)),
      localExperiences: localExperiences.filter(item =>
        includedComponentIds.has(item.componentId)),
    };
  }

  async function save() {
    if (!workspace || !selectedTemplate || reconciliationRequired ||
        (detail?.lifecycle === "frozen" && !revisingFrozen)) return;
    let attemptedWrite = false;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const version = versionInput(selectedTemplate, detail ?? undefined);
      if (detail) {
        attemptedWrite = true;
        const saved = await saveCanonicalBlueprintConfiguration({ data: {
          configurationId: detail.configurationId,
          versionId: crypto.randomUUID(),
          expectedRevision: detail.revision,
          version,
        } });
        const current = await reload();
        onWorkspaceChanged?.(current);
        const opened = await openConfiguration(detail.configurationId, current);
        if (!opened) setReconciliationRequired(true);
        setMessage(!opened
          ? "Changes were saved, but the latest plan could not be reopened. Reload before editing."
          : saved.revision > detail.revision
            ? "A new Solution plan revision was saved."
            : "The Solution plan is already up to date.");
      } else {
        const configurationId = crypto.randomUUID();
        attemptedWrite = true;
        await createCanonicalBlueprintConfiguration({ data: {
          configurationId,
          initialVersionId: crypto.randomUUID(),
          blueprintId: selectedTemplate.blueprintId,
          blueprintVersionId: selectedTemplate.blueprintVersionId,
          owningOrganizationId: workspace.organizationId,
          name: name.trim(),
          version,
        } });
        const current = await reload();
        onWorkspaceChanged?.(current);
        const opened = await openConfiguration(configurationId, current);
        if (!opened) setReconciliationRequired(true);
        setMessage(opened ? "Solution plan created." :
          "Solution plan created, but reopening failed. Reload to review the saved plan.");
      }
    } catch (caught) {
      if (attemptedWrite) {
        setReconciliationRequired(true);
        setError("The save outcome could not be fully verified. Reload the Site to reconcile the latest Solution plan before retrying.");
      } else {
        setError(normalizeClientError(caught, "The Solution plan could not be saved.").message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!detail || !selectedTemplate || !workspace?.canConfigure ||
        reconciliationRequired || detail.lifecycle !== "draft") return;
    let attemptedWrite = false;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // Submit what the author actually sees. A previously saved draft may not
      // include edits made since it was opened. Save first using optimistic
      // revision control; the service reuses an identical draft revision.
      attemptedWrite = true;
      const saved = await saveCanonicalBlueprintConfiguration({ data: {
        configurationId: detail.configurationId,
        versionId: crypto.randomUUID(),
        expectedRevision: detail.revision,
        version: versionInput(selectedTemplate, detail),
      } });
      await submitCanonicalBlueprintConfiguration({
        data: { configurationId: detail.configurationId, expectedRevision: saved.revision },
      });
      const current = await reload();
      onWorkspaceChanged?.(current);
      const opened = await openConfiguration(detail.configurationId, current);
      if (!opened) setReconciliationRequired(true);
      setMessage(opened
        ? "Current Solution plan submitted for independent review. No Program or enrollment is authorized."
        : "Solution plan submitted, but review status could not be refreshed. Reload before taking another action.");
    } catch (caught) {
      if (attemptedWrite) {
        setReconciliationRequired(true);
        setError("The review submission outcome could not be fully verified. Reload before retrying.");
      } else {
        setError(normalizeClientError(caught, "Solution review submission failed.").message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function createPlanningDeployment() {
    if (revisingFrozen || !detail || !review?.latestReview || review.latestReview.decision !== "approved"
      || !operationId || !workspace?.canExecute) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await executeCanonicalBlueprintConfiguration({ data: {
        configurationVersionId: detail.versionId,
        reviewId: review.latestReview.id,
        operationId,
        idempotencyKey: `studio:${detail.versionId}:${operationId}`,
      } });
      setExecutedDeployments(result.deploymentIds);
      setMessage(result.created
        ? "Approved Blueprint executed as a planning-only Operation and Deployment record."
        : "Existing Blueprint execution was reused. No additional Deployment was created.");
    } catch (caught) {
      setError(normalizeClientError(caught,
        "The approved Blueprint could not be executed for this Operation.").message);
    } finally {
      setBusy(false);
    }
  }

  const editableProgramComponents = selectedTemplate?.components.filter(component =>
    component.kind === "program_model" && selectedComponents.includes(component.id)) ?? [];
  const editableProgramComponentIds = editableProgramComponents.map(component => component.id);
  const readOnlyFrozen = detail?.lifecycle === "frozen" && !revisingFrozen;
  const editingDisabled = busy || readOnlyFrozen || reconciliationRequired;
  // A selected Solution in Prepare must not display another Solution's saved drafts.
  const visibleConfigurations = embedded && initialBlueprintVersionId
    ? selectSavedSolutionPlans(workspace?.configurations ?? [], initialBlueprintVersionId)
    : workspace?.configurations ?? [];

  return <section className="mt-6 border bg-card p-6" aria-labelledby="canonical-blueprint-title">
    <h2 id="canonical-blueprint-title" className="font-serif text-2xl">
      {embedded ? "Configure selected Solution" : "Configure your Solution"}
    </h2>
    <p className="mt-2 text-sm text-muted-foreground">
      CAN defines and publishes the Blueprint. Your Site selects its available components
      and saves an implementation plan. Independent approval and enrollment authorization are separate.
    </p>
    {loading && <p className="mt-4" role="status">Loading Blueprint workspace…</p>}
    {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
    {reconciliationRequired && <p className="mt-3 border border-border bg-muted p-3 text-sm" role="status">
      The server may have recorded your last action. Reload before creating or updating another Solution plan.
    </p>}
    {message && <p className="mt-4 text-sm" role="status">{message}</p>}
    {!loading && !workspace && <Button type="button" variant="outline"
      onClick={() => void reload().catch(caught =>
        setError(normalizeClientError(caught, "Blueprint planning could not load.").message)
      )}>Retry</Button>}
    {workspace && <>
      {visibleConfigurations.length > 0 && <div className="mt-5">
        <h3 className="font-semibold">Saved Solution plans</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleConfigurations.map(configuration =>
            <Button key={configuration.configurationId} type="button" variant="outline"
              disabled={busy}
              onClick={() => void openConfiguration(configuration.configurationId)}>
              {configuration.name} · {configuration.lifecycle === "frozen" ? "In review" : "Draft"}
            </Button>)}
        </div>
      </div>}
      {workspace.templates.length === 0 && <p role="status" className="mt-5 border p-4 text-sm">
        No published Blueprint recipes are available yet. CAN must publish a starter recipe
        before this Site can begin configuration.
      </p>}
      {workspace.templates.length > 0 && <div className="mt-5 space-y-4">
        <div className="flex flex-wrap gap-3">
          <Label htmlFor="canonical-blueprint-template" className="min-w-52 flex-1 text-sm">
            CAN-published Solution
            <Select id="canonical-blueprint-template" className="mt-2"
              value={templateId} disabled={busy || Boolean(detail) || (embedded && Boolean(initialBlueprintVersionId))}
              onChange={event => {
                const template = workspace.templates.find(item =>
                  item.blueprintVersionId === event.currentTarget.value);
                if (template) chooseTemplate(template);
              }}>
              <option value="">Choose a recipe</option>
              {workspace.templates.map(template =>
                <option key={template.blueprintVersionId} value={template.blueprintVersionId}>
                  {template.title} (v{template.versionNo})
                </option>)}
            </Select>
          </Label>
          <Label htmlFor="canonical-blueprint-name" className="min-w-52 flex-1 text-sm">
            Configuration name
            <Input id="canonical-blueprint-name" className="mt-2" maxLength={120}
              value={name} disabled={busy || Boolean(detail)}
              onChange={event => setName(event.currentTarget.value)}
              placeholder="Example: Summer and Afterschool Plan"/>
          </Label>
        </div>
        {selectedTemplate && <>
          <div className="flex flex-wrap gap-3">
            <Label htmlFor="canonical-blueprint-identity" className="min-w-52 flex-1 text-sm">
              Educational identity
              <Select id="canonical-blueprint-identity" className="mt-2"
                value={editorialIdentity} disabled={editingDisabled}
                onChange={event => setEditorialIdentity(
                  event.currentTarget.value as typeof editorialIdentity
                )}>
                {blueprintEditorialIdentityKeys.map(key =>
                  <option value={key} key={key}>{readable(key)}</option>)}
              </Select>
            </Label>
            <Label htmlFor="canonical-blueprint-affiliation" className="min-w-52 flex-1 text-sm">
              Religious affiliation (optional)
              <Select id="canonical-blueprint-affiliation" className="mt-2"
                value={religiousAffiliationCode} disabled={editingDisabled}
                onChange={event => setReligiousAffiliationCode(event.currentTarget.value)}>
                <option value="">Unspecified</option>
                {workspace.affiliations.map(option =>
                  <option key={option.code} value={option.code}>{option.label}</option>)}
              </Select>
            </Label>
          </div>
          <BlueprintComponentPicker
            components={selectedTemplate.components}
            selected={selectedComponents} disabled={editingDisabled}
            onToggle={(componentId,checked)=>setSelectedComponents(current=>
              checked?[...current,componentId]:current.filter(id=>id!==componentId))}/>
          <BlueprintReferencesPicker enabled={enableReferences}
            components={selectedTemplate.components} selected={selectedComponents}
            catalog={referenceCatalog} selectedReferences={selectedReferences}
            disabled={editingDisabled}
            onToggle={(componentId,versionId,checked)=>setSelectedReferences(current=>{
              const existing=current[componentId]??[];
              return {...current,[componentId]:checked
                ? [...existing,versionId]:existing.filter(id=>id!==versionId)};
            })}/>
          {enableReferences && editableProgramComponents.length > 0 &&
            <BlueprintOfferingAdoptionPicker
              siteId={siteId}
              initialDelivery={initialDelivery}
              components={editableProgramComponents}
              linkedOffering={selectedTemplate.linkedPublishedOffering}
              selected={offeringAdoptions.filter(intent =>
                editableProgramComponentIds.includes(intent.componentId))}
              onChange={next => setOfferingAdoptions(previous =>
                replaceVisibleOfferingIntents(previous, next, editableProgramComponentIds))}
              disabled={editingDisabled}
            />}
          {selectedTemplate.components.some(component =>
            selectedComponents.includes(component.id) &&
            ["community", "experience", "club", "activity"].includes(component.kind)
          ) && <fieldset className="border p-4" disabled={editingDisabled}>
            <legend className="px-2 font-semibold">Propose a local experience</legend>
            <p className="mb-3 text-sm text-muted-foreground">
              Describe a club, activity, community project, or experience unique to your Site.
              A proposal is not an approved activity.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Label className="text-sm" htmlFor="canonical-local-component">
                Category
                <Select id="canonical-local-component" className="mt-2"
                  value={localComponentId}
                  onChange={event => setLocalComponentId(event.currentTarget.value)}>
                  <option value="">Choose category</option>
                  {selectedTemplate.components
                    .filter(component => selectedComponents.includes(component.id) &&
                      ["community", "experience", "club", "activity"].includes(component.kind))
                    .map(component => <option key={component.id} value={component.id}>
                      {readable(component.key)}
                    </option>)}
                </Select>
              </Label>
              <Label className="text-sm" htmlFor="canonical-local-title">
                Name
                <Input id="canonical-local-title" className="mt-2" maxLength={160}
                  value={localTitle} onChange={event => setLocalTitle(event.currentTarget.value)}/>
              </Label>
              <Label className="text-sm" htmlFor="canonical-local-summary">
                Summary
                <Input id="canonical-local-summary" className="mt-2" maxLength={4000}
                  value={localSummary} onChange={event => setLocalSummary(event.currentTarget.value)}/>
              </Label>
            </div>
            <Button type="button" variant="outline" className="mt-3"
              disabled={!localComponentId || localTitle.trim().length < 2 || localExperiences.length >= 200}
              onClick={() => {
                const component = selectedTemplate.components.find(item => item.id === localComponentId);
                if (!component || !["community", "experience", "club", "activity"].includes(component.kind)) return;
                setLocalExperiences(current => [...current, {
                  source: "proposed_local_experience",
                  componentId: component.id,
                  kind: component.kind as LocalExperienceDraft["kind"],
                  title: localTitle.trim(),
                  summary: localSummary.trim(),
                  configuration: {},
                }]);
                setLocalTitle("");
                setLocalSummary("");
              }}>
              Add to private Blueprint draft
            </Button>
            {localExperiences.length > 0 && <ul className="mt-4 space-y-2 text-sm">
              {localExperiences.map((item, index) => <li key={index}
                className="flex items-center justify-between gap-3 border p-3">
                <span>{item.title} · {readable(item.kind)}</span>
                <Button type="button" variant="outline"
                  onClick={() => setLocalExperiences(current =>
                    current.filter((_value, itemIndex) => itemIndex !== index))}>
                  Remove
                </Button>
              </li>)}
            </ul>}
          </fieldset>}
          <div className="flex flex-wrap gap-3">
            {workspace.canConfigure && !readOnlyFrozen && <Button type="button" disabled={busy || reconciliationRequired || (!detail && name.trim().length < 2)}
              onClick={() => void save()}>
              {busy ? "Saving…" : detail ? "Save new revision" : "Save Solution plan"}
            </Button>}
            {detail && detail.lifecycle === "frozen" && workspace.canConfigure && <Button type="button" variant="outline" disabled={busy || reconciliationRequired}
              onClick={() => { setRevisingFrozen(true); setOperationId(""); setExecutedDeployments(null); }}>
              Revise submitted Blueprint
            </Button>}
            {detail && revisingFrozen && <Button type="button" variant="outline" disabled={busy}
              onClick={() => void openConfiguration(detail.configurationId)}>
              Discard revision edits
            </Button>}
            {detail && detail.lifecycle === "draft" && workspace.canConfigure &&
              <Button type="button" variant="outline" disabled={busy || reconciliationRequired}
                onClick={() => void submit()}>Submit for review</Button>}
            {detail && <Button type="button" variant="outline" disabled={busy || reconciliationRequired}
              onClick={() => {
                setDetail(null);
                setRevisingFrozen(false);
                setReview(null);
                setOperationId("");
                setExecutedDeployments(null);
                const original = embedded && initialBlueprintVersionId
                  ? workspace.templates.find(template =>
                      template.blueprintVersionId === initialBlueprintVersionId)
                  : undefined;
                if (original) chooseTemplate(original);
                else {
                  setTemplateId("");
                  setSelectedComponents([]);
                }
                setEditorialIdentity("community_belonging");
                setReligiousAffiliationCode("");
                setSelectedReferences({});
                setOfferingAdoptions([]);
                setLocalExperiences([]);
                setLocalComponentId("");
                setLocalTitle("");
                setLocalSummary("");
                setName("");
                setSavedDraftSnapshot(solutionDraftSnapshot({
                  name: "", templateId: original?.blueprintVersionId ?? "",
                  editorialIdentity: "community_belonging", religiousAffiliationCode: "",
                  selectedComponents: original?.components.filter(component =>
                    component.requirementMode === "required").map(component => component.id) ?? [],
                  selectedReferences: {}, offeringAdoptions: [], localExperiences: [],
                }));
                setMessage(null);
              }}>Start a new Solution plan</Button>}
          </div>
          {detail && <div className="text-sm text-muted-foreground">
            <p>Revision {detail.revision} · {detail.lifecycle === "frozen"
              ? "Submitted for independent review" : "Private planning draft"}</p>
            {detail.lifecycle === "frozen" && <>
              <p className="mt-1">
                Latest independent review:{" "}
                {review?.latestReview
                  ? <StatusBadge tone={review.latestReview.decision === "approved" ? "success" : review.latestReview.decision === "rejected" ? "danger" : "attention"}>{readable(review.latestReview.decision)}</StatusBadge>
                  : <StatusBadge>Pending or unavailable</StatusBadge>}
              </p>
              <BlueprintReviewHistoryPanel key={detail.versionId}
                configurationVersionId={detail.versionId}/>
              <Button type="button" variant="outline" disabled={busy}
                onClick={() => void openConfiguration(detail.configurationId)}>
                Refresh review status
              </Button>
              {review?.latestReview?.decision === "approved" && workspace.canExecute && !revisingFrozen &&
                <fieldset className="mt-4 border p-4" disabled={busy}>
                  <legend className="px-2 font-semibold">Create a planning Deployment</legend>
                  <p className="mb-3">
                    Independent review is complete. Select an Operation your Organization
                    currently operates. This does not authorize a school to open,
                    enroll learners, or begin instruction.
                  </p>
                  {workspace.operations.length > 0 ? <>
                    <Label htmlFor="canonical-blueprint-operation" className="block">
                      Authorized Operation
                      <Select id="canonical-blueprint-operation" className="mt-2"
                        value={operationId}
                        onChange={event => setOperationId(event.currentTarget.value)}>
                        <option value="">Choose an Operation</option>
                        {workspace.operations.map(operation =>
                          <option key={operation.id} value={operation.id}>{operation.name}</option>)}
                      </Select>
                    </Label>
                    <Button type="button" className="mt-3" disabled={busy || !operationId}
                      onClick={() => void createPlanningDeployment()}>
                      {busy ? "Recording planning Deployment…" : "Create planning Deployment"}
                    </Button>
                    {executedDeployments && <p className="mt-3" role="status">
                      Planning Deployments created or reused: {executedDeployments.length}.
                      {executedDeployments.length > 0
                        ? ` References: ${executedDeployments.join(", ")}`
                        : " This Blueprint contains no published Offering adoption intents."}
                    </p>}
                  </> : <p>
                    No Operation has an active operator relationship with your Organization.
                    Configure an Operation before executing the approved Blueprint.
                  </p>}
                </fieldset>}
            </>}
          </div>}
        </>}
      </div>}
    </>}
  </section>;
}
