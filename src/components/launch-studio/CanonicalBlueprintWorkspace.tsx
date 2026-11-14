import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { normalizeClientError } from "@/lib/client-error";
import {
  createCanonicalBlueprintConfiguration,
  readCanonicalBlueprintConfiguration,
  readCanonicalBlueprintWorkspace,
  saveCanonicalBlueprintConfiguration,
  submitCanonicalBlueprintConfiguration,
} from "@/modules/blueprints/blueprint-studio.functions";
import type { getCanonicalBlueprintWorkspace } from "@/modules/blueprints/blueprint-workspace.server";
import type { BlueprintConfigurationDetail } from "@/modules/blueprints/blueprint-configuration.server";
import { blueprintEditorialIdentityKeys } from "@/domain/blueprint-configuration";
import { exploreBlueprintReferenceCatalog } from "@/modules/blueprints/blueprint-reference-catalog.functions";
import type { BlueprintReferenceCatalogItem } from "@/domain/blueprint-reference-catalog";

type Workspace = Awaited<ReturnType<typeof getCanonicalBlueprintWorkspace>>;
type Template = Workspace["templates"][number];

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
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [editorialIdentity, setEditorialIdentity] = useState<
    (typeof blueprintEditorialIdentityKeys)[number]
  >("community_belonging");
  const [religiousAffiliationCode, setReligiousAffiliationCode] = useState("");
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [selectedReferences, setSelectedReferences] = useState<Record<string, string[]>>({});
  const [referenceCatalog, setReferenceCatalog] = useState<BlueprintReferenceCatalogItem[]>([]);
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
    void exploreBlueprintReferenceCatalog({ data: { siteId } })
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
    setSelectedComponents(template.components.filter(component =>
      component.requirementMode === "required"
    ).map(component => component.id));
    setDetail(null);
    setMessage(null);
  }

  async function openConfiguration(configurationId: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await readCanonicalBlueprintConfiguration({ data: { configurationId } });
      setDetail(result);
      setName(result.name);
      setEditorialIdentity(result.identity.editorialIdentity);
      setReligiousAffiliationCode(result.identity.religiousAffiliationCode ?? "");
      setSelectedComponents(result.components
        .filter(component => component.selectionStatus === "selected")
        .map(component => component.componentId));
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
      offeringAdoptions: previous?.offeringAdoptions.filter(intent =>
        selectedComponents.includes(intent.componentId)) ?? [],
      localExperiences: previous?.localExperiences.filter(item =>
        selectedComponents.includes(item.componentId)).map(item => ({
          source: "proposed_local_experience" as const,
          componentId: item.componentId,
          kind: item.kind,
          title: item.title,
          summary: item.summary,
          configuration: item.configuration,
        })) ?? [],
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
                setTemplateId("");
                setSelectedComponents([]);
                setSelectedReferences({});
                setName("");
                setMessage(null);
              }}>Start a new configuration</Button>}
          </div>
          {detail && <p className="text-sm text-muted-foreground">
            Revision {detail.revision} · {detail.lifecycle === "frozen"
              ? "Submitted for independent review" : "Private planning draft"}
          </p>}
        </>}
      </div>}
    </>}
  </section>;
}
