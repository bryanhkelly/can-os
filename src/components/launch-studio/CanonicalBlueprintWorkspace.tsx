import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
import { blueprintEditorialIdentityKeys } from "@/domain/blueprint-configuration";
import { exploreCanonicalBlueprintReferences } from "@/modules/blueprints/blueprint-studio.functions";
import type { BlueprintReferenceCatalogItem } from "@/domain/blueprint-reference-catalog";
import { BlueprintOfferingAdoptionPicker, type BlueprintOfferingIntent } from "./BlueprintOfferingAdoptionPicker";

type Workspace = Awaited<ReturnType<typeof getCanonicalBlueprintWorkspace>>;
type Template = Workspace["templates"][number];
type Review = Awaited<ReturnType<typeof getBlueprintReview>>;
type LocalExperienceDraft = BlueprintConfigurationDetail["localExperiences"][number] & {
  source: "proposed_local_experience";
};

function readable(value: string): string {
  return value.replaceAll("_", " ");
}

/**
 * Canonical Blueprint preparation. A draft is Organization-owned and anchored
 * to a Site; freezing it requests review, not permission to operate.
 */
export function CanonicalBlueprintWorkspace({ siteId, enableReferences = false }: { siteId: string; enableReferences?: boolean }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [detail, setDetail] = useState<BlueprintConfigurationDetail | null>(null);
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

  async function reload() {
    const next = await readCanonicalBlueprintWorkspace({ data: { siteId } });
    setWorkspace(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    setWorkspace(null);
    setDetail(null);
    setReview(null);
    setOperationId("");
    setExecutedDeployments(null);
    setLoading(true);
    setError(null);
    void readCanonicalBlueprintWorkspace({ data: { siteId } })
      .then(result => { if (!cancelled) setWorkspace(result); })
      .catch(caught => {
        if (!cancelled) setError(normalizeClientError(caught, "Blueprint planning could not load.").message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId]);

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
    setSelectedComponents(template.components.filter(component =>
      component.requirementMode === "required"
    ).map(component => component.id));
    setDetail(null);
    setReview(null);
    setExecutedDeployments(null);
    setMessage(null);
  }

  async function openConfiguration(configurationId: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await readCanonicalBlueprintConfiguration({ data: { configurationId } });
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
      setSelectedReferences(Object.fromEntries(
        result.components.map(component => [
          component.componentId,
          component.referenceItemVersionIds,
        ])
      ));
      setTemplateId(result.blueprintVersionId);
      setMessage(null);
    } catch (caught) {
      setError(normalizeClientError(caught, "This Blueprint configuration is unavailable.").message);
    } finally {
      setBusy(false);
    }
  }

  function versionInput(template: Template, previous?: BlueprintConfigurationDetail) {
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
          selectionStatus: selected ? "selected" as const : "excluded" as const,
          referenceItemVersionIds: selected ? selectedReferences[component.id] ?? current?.referenceItemVersionIds ?? [] : [],
          settings: current?.settings && typeof current.settings === "object"
            && !Array.isArray(current.settings) ? current.settings : {},
        };
      }),
      offeringAdoptions: offeringAdoptions.filter(intent =>
        selectedComponents.includes(intent.componentId)),
      localExperiences: localExperiences.filter(item =>
        selectedComponents.includes(item.componentId)),
    };
  }

  async function save() {
    if (!workspace || !selectedTemplate) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const version = versionInput(selectedTemplate, detail ?? undefined);
      if (detail) {
        await saveCanonicalBlueprintConfiguration({ data: {
          configurationId: detail.configurationId,
          versionId: crypto.randomUUID(),
          expectedRevision: detail.revision,
          version,
        } });
        await openConfiguration(detail.configurationId);
        setMessage("A new Blueprint configuration revision was saved.");
      } else {
        const configurationId = crypto.randomUUID();
        await createCanonicalBlueprintConfiguration({ data: {
          configurationId,
          initialVersionId: crypto.randomUUID(),
          blueprintId: selectedTemplate.blueprintId,
          blueprintVersionId: selectedTemplate.blueprintVersionId,
          owningOrganizationId: workspace.organizationId,
          name: name.trim(),
          version,
        } });
        await openConfiguration(configurationId);
        setMessage("Blueprint configuration created.");
      }
      await reload();
    } catch (caught) {
      setError(normalizeClientError(caught, "The Blueprint configuration could not be saved.").message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await submitCanonicalBlueprintConfiguration({
        data: { configurationId: detail.configurationId, expectedRevision: detail.revision },
      });
      await openConfiguration(detail.configurationId);
      await reload();
      setMessage("Blueprint submitted for independent review. No program has been authorized.");
    } catch (caught) {
      setError(normalizeClientError(caught, "Blueprint submission failed.").message);
    } finally {
      setBusy(false);
    }
  }

  async function createPlanningDeployment() {
    if (!detail || !review?.latestReview || review.latestReview.decision !== "approved"
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

  return <section className="mt-6 border bg-card p-6" aria-labelledby="canonical-blueprint-title">
    <h2 id="canonical-blueprint-title" className="font-serif text-2xl">
      Configure your School Blueprint
    </h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Choose a published recipe, select its components, and save your plan.
      Review and approval are separate from operating authorization.
    </p>
    {loading && <p className="mt-4" role="status">Loading Blueprint workspace…</p>}
    {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
    {message && <p className="mt-4 text-sm" role="status">{message}</p>}
    {!loading && !workspace && <Button type="button" variant="outline"
      onClick={() => void reload().catch(caught =>
        setError(normalizeClientError(caught, "Blueprint planning could not load.").message)
      )}>Retry</Button>}
    {workspace && <>
      {workspace.configurations.length > 0 && <div className="mt-5">
        <h3 className="font-semibold">Saved Blueprint configurations</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {workspace.configurations.map(configuration =>
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
          <label htmlFor="canonical-blueprint-template" className="min-w-52 flex-1 text-sm">
            Published Blueprint recipe
            <Select id="canonical-blueprint-template" className="mt-2"
              value={templateId} disabled={busy || Boolean(detail)}
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
          </label>
          <label htmlFor="canonical-blueprint-name" className="min-w-52 flex-1 text-sm">
            Configuration name
            <Input id="canonical-blueprint-name" className="mt-2" maxLength={120}
              value={name} disabled={busy || Boolean(detail)}
              onChange={event => setName(event.currentTarget.value)}
              placeholder="Example: Summer and Afterschool Plan"/>
          </label>
        </div>
        {selectedTemplate && <>
          <div className="flex flex-wrap gap-3">
            <label htmlFor="canonical-blueprint-identity" className="min-w-52 flex-1 text-sm">
              Educational identity
              <Select id="canonical-blueprint-identity" className="mt-2"
                value={editorialIdentity} disabled={busy}
                onChange={event => setEditorialIdentity(
                  event.currentTarget.value as typeof editorialIdentity
                )}>
                {blueprintEditorialIdentityKeys.map(key =>
                  <option value={key} key={key}>{readable(key)}</option>)}
              </Select>
            </label>
            <label htmlFor="canonical-blueprint-affiliation" className="min-w-52 flex-1 text-sm">
              Religious affiliation (optional)
              <Select id="canonical-blueprint-affiliation" className="mt-2"
                value={religiousAffiliationCode} disabled={busy}
                onChange={event => setReligiousAffiliationCode(event.currentTarget.value)}>
                <option value="">Unspecified</option>
                {workspace.affiliations.map(option =>
                  <option key={option.code} value={option.code}>{option.label}</option>)}
              </Select>
            </label>
          </div>
          <fieldset className="border p-4" disabled={busy}>
            <legend className="px-2 font-semibold">Blueprint components</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {selectedTemplate.components.map(component =>
                <label key={component.id} className="flex items-center gap-3 text-sm">
                  <input type="checkbox" checked={selectedComponents.includes(component.id)}
                    disabled={component.requirementMode === "required" || busy}
                    onChange={event => setSelectedComponents(current =>
                      event.target.checked
                        ? [...current, component.id]
                        : current.filter(id => id !== component.id)
                    )}/>
                  <span>{readable(component.key)}
                    {component.requirementMode === "required" ? " · required" : ""}</span>
                </label>)}
            </div>
          </fieldset>
          {enableReferences && referenceCatalog.length > 0 && selectedTemplate.components
            .filter(component => selectedComponents.includes(component.id))
            .map(component => {
              const available = referenceCatalog.filter(reference =>
                reference.kind === component.kind
              );
              if (!available.length) return null;
              return <fieldset key={component.id} className="border p-4" disabled={busy}>
                <legend className="px-2 font-semibold">
                  {readable(component.key)} · curated references
                </legend>
                <div className="mt-2 grid max-h-52 gap-3 overflow-y-auto sm:grid-cols-2">
                  {available.map(reference => <label key={reference.versionId}
                    className="flex items-start gap-3 text-sm">
                    <input type="checkbox" className="mt-1"
                      checked={(selectedReferences[component.id] ?? []).includes(reference.versionId)}
                      onChange={event => setSelectedReferences(current => {
                        const before = current[component.id] ?? [];
                        return { ...current, [component.id]: event.target.checked
                          ? [...before, reference.versionId]
                          : before.filter(id => id !== reference.versionId) };
                      })}/>
                    <span><strong className="block">{reference.title}</strong>
                      <span className="text-muted-foreground">{reference.summary}</span>
                    </span>
                  </label>)}
                </div>
              </fieldset>;
            })}
          {enableReferences && selectedTemplate.components.some(component =>
            selectedComponents.includes(component.id) && component.kind === "program_model"
          ) && <BlueprintOfferingAdoptionPicker
            siteId={siteId}
            components={selectedTemplate.components
              .filter(component => component.kind === "program_model" &&
                selectedComponents.includes(component.id))}
            selected={offeringAdoptions.filter(intent =>
              selectedComponents.includes(intent.componentId))}
            onChange={setOfferingAdoptions}
            disabled={busy}
          />}
          {selectedTemplate.components.some(component =>
            selectedComponents.includes(component.id) &&
            ["community", "experience", "club", "activity"].includes(component.kind)
          ) && <fieldset className="border p-4" disabled={busy}>
            <legend className="px-2 font-semibold">Propose a local experience</legend>
            <p className="mb-3 text-sm text-muted-foreground">
              Describe a club, activity, community project, or experience unique to your Site.
              A proposal is not an approved activity.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm" htmlFor="canonical-local-component">
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
              </label>
              <label className="text-sm" htmlFor="canonical-local-title">
                Name
                <Input id="canonical-local-title" className="mt-2" maxLength={160}
                  value={localTitle} onChange={event => setLocalTitle(event.currentTarget.value)}/>
              </label>
              <label className="text-sm" htmlFor="canonical-local-summary">
                Summary
                <Input id="canonical-local-summary" className="mt-2" maxLength={4000}
                  value={localSummary} onChange={event => setLocalSummary(event.currentTarget.value)}/>
              </label>
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
            {workspace.canConfigure && <Button type="button" disabled={busy || (!detail && name.trim().length < 2)}
              onClick={() => void save()}>
              {busy ? "Saving…" : detail ? "Save new revision" : "Create Blueprint configuration"}
            </Button>}
            {detail && detail.lifecycle === "draft" && workspace.canConfigure &&
              <Button type="button" variant="outline" disabled={busy}
                onClick={() => void submit()}>Submit for review</Button>}
            {detail && <Button type="button" variant="outline" disabled={busy}
              onClick={() => {
                setDetail(null);
                setReview(null);
                setTemplateId("");
                setSelectedComponents([]);
                setSelectedReferences({});
                setOfferingAdoptions([]);
                setLocalExperiences([]);
                setName("");
                setMessage(null);
              }}>Start a new configuration</Button>}
          </div>
          {detail && <div className="text-sm text-muted-foreground">
            <p>Revision {detail.revision} · {detail.lifecycle === "frozen"
              ? "Submitted for independent review" : "Private planning draft"}</p>
            {detail.lifecycle === "frozen" && <>
              <p className="mt-1">
                Latest independent review: {review?.latestReview
                  ? readable(review.latestReview.decision) : "Pending or unavailable"}
              </p>
              <Button type="button" variant="outline" disabled={busy}
                onClick={() => void openConfiguration(detail.configurationId)}>
                Refresh review status
              </Button>
              {review?.latestReview?.decision === "approved" && workspace.canExecute &&
                <fieldset className="mt-4 border p-4" disabled={busy}>
                  <legend className="px-2 font-semibold">Create a planning Deployment</legend>
                  <p className="mb-3">
                    Independent review is complete. Select an Operation your Organization
                    currently operates. This does not authorize a school to open,
                    enroll learners, or begin instruction.
                  </p>
                  {workspace.operations.length > 0 ? <>
                    <label htmlFor="canonical-blueprint-operation" className="block">
                      Authorized Operation
                      <Select id="canonical-blueprint-operation" className="mt-2"
                        value={operationId}
                        onChange={event => setOperationId(event.currentTarget.value)}>
                        <option value="">Choose an Operation</option>
                        {workspace.operations.map(operation =>
                          <option key={operation.id} value={operation.id}>{operation.name}</option>)}
                      </Select>
                    </label>
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
