import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { WorkspaceNotice, WorkspacePanel, QueryState, ActionFooter } from "@/components/workspace";
import { normalizeClientError } from "@/lib/client-error";
import type { PlatformProgramDraft, PlatformBlueprintDraft } from "@/domain/platform-catalog";
import {
  listPlatformCatalogDefinitions, readPlatformBlueprintTemplate,
  savePlatformProgramDraft, savePlatformBlueprintDraft,
  approvePlatformCatalogDraft, publishPlatformCatalogVersion,
} from "@/modules/blueprints/platform-catalog.functions";

type Catalog = Awaited<ReturnType<typeof listPlatformCatalogDefinitions>>;
type Decision = { kind: "program" | "blueprint"; versionId: string };
const emptyProgram: PlatformProgramDraft = {
  code: "can.program.", category: "community", title: "", summary: "",
  description: "", expectedVersion: 0,
};
const emptyBlueprint: PlatformBlueprintDraft = {
  code: "can.", title: "", programCode: "can.program.",
  targetKind: "composite", expectedVersion: 0,
  components: [{
    key: "instruction", kind: "program_model", requirementMode: "required", description: "",
  }],
};

/** CAN OS V6.1 global authoring. No local Site planning or review elevation. */
export function PlatformCatalogManager() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [program, setProgram] = useState<PlatformProgramDraft>(emptyProgram);
  const [blueprint, setBlueprint] = useState<PlatformBlueprintDraft>(emptyBlueprint);
  const [selected, setSelected] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const result = await listPlatformCatalogDefinitions();
    setCatalog(result);
  }
  useEffect(() => {
    let active = true;
    void listPlatformCatalogDefinitions().then(result => {
      if (active) setCatalog(result);
    }).catch(reason => {
      if (active) setError(normalizeClientError(reason, "Catalog inventory is unavailable.").message);
    });
    return () => { active = false; };
  }, []);

  async function saveProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await savePlatformProgramDraft({ data: program });
      setSelected({ kind: "program", versionId: result.versionId });
      setMessage("Program draft v" + result.versionNo + " saved. App Admin can publish this planning version.");
      await refresh();
      setProgram({ ...program, expectedVersion: result.versionNo });
    } catch (reason) {
      setError(normalizeClientError(reason, "The Program draft was not saved.").message);
    } finally { setBusy(false); }
  }

  async function saveBlueprint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await savePlatformBlueprintDraft({ data: blueprint });
      setSelected({ kind: "blueprint", versionId: result.versionId });
      setMessage("Blueprint draft v" + result.versionNo + " saved. This is a planning recipe, not a Course or enrollment approval.");
      await refresh();
      setBlueprint({ ...blueprint, expectedVersion: result.versionNo });
    } catch (reason) {
      setError(normalizeClientError(reason, "The Blueprint draft was not saved.").message);
    } finally { setBusy(false); }
  }

  async function chooseBlueprint(row: Catalog["blueprintRecipes"][number]) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const detail = await readPlatformBlueprintTemplate({ data: { versionId: row.versionId } });
      setBlueprint({
        code: detail.code, title: detail.title, targetKind: detail.targetKind,
        programCode: detail.programCode, offeringCode: detail.offeringCode || undefined,
        components: detail.components.map(component => ({
          ...component,
          kind: component.kind as PlatformBlueprintDraft["components"][number]["kind"],
        })),
        expectedVersion: detail.versionNo,
      });
      setSelected({ kind: "blueprint", versionId: row.versionId });
    } catch (reason) {
      setError(normalizeClientError(reason, "This template is not platform-owned or available for editing.").message);
    } finally { setBusy(false); }
  }

  async function decide(action: "review" | "publish") {
    if (!selected || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (action === "review") {
        await approvePlatformCatalogDraft({ data: selected });
        setMessage("Independent planning review recorded. The draft can now be published.");
      } else {
        await publishPlatformCatalogVersion({ data: selected });
        setMessage("The reviewed planning definition is published. No Site, Course, Offering, or enrollment was approved.");
        setSelected(null);
      }
      await refresh();
    } catch (reason) {
      setError(normalizeClientError(reason, "The catalog decision was not accepted.").message);
    } finally { setBusy(false); }
  }

  return <section className="mt-6 space-y-5" aria-label="Platform Program Catalog and Blueprint Studio">
    <div>
      <h2 className="font-serif text-xl">Program Catalog and Blueprint Studio</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        CAN App Admins manage reusable Program definitions and Solution recipes here.
        Site Admins select and configure these recipes within Launch Studio. App Admin
        may publish planning definitions directly; independent peer review is optional.
        Academic content licensing, institutional readiness, and enrollment authorization remain independent.
      </p>
    </div>

    {error && <WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
    {message && <WorkspaceNotice tone="success">{message}</WorkspaceNotice>}
    {!catalog && !error && <QueryState loading="Loading catalog definitions…"/>}

    <div className="grid gap-5 xl:grid-cols-2">
      <WorkspacePanel headingLevel="h3" title="Program definitions" actions={<Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setProgram(emptyProgram); setSelected(null); }}>New Program</Button>}>
        <div className="space-y-4">
        <Field label="Load a Program version">
          <Select value="" disabled={!catalog || busy}
            onChange={event => {
              const item = catalog?.programModels.find(model => model.versionId === event.target.value);
              if (!item) return;
              setProgram({
                code: item.code, category: item.category, title: item.title,
                summary: item.summary, description: item.description,
                expectedVersion: item.versionNo,
              });
              setSelected({ kind: "program", versionId: item.versionId });
            }}>
            <option value="">Choose a Program…</option>
            {catalog?.programModels.map(item => <option key={item.id} value={item.versionId}>
              {item.title} · v{item.versionNo} ({item.lifecycle})
            </option>)}
          </Select>
        </Field>
        <form className="space-y-3" onSubmit={event => void saveProgram(event)}>
          <Field label="Program code" required>
            <Input required value={program.code} maxLength={120}
              onChange={event => setProgram({ ...program, code: event.target.value })} />
          </Field>
          <Field label="Category" required>
            <Input required value={program.category} maxLength={50}
              onChange={event => setProgram({ ...program, category: event.target.value })}/>
          </Field>
          <Field label="Program name" required>
            <Input required value={program.title} maxLength={160}
              onChange={event => setProgram({ ...program, title: event.target.value })}/>
          </Field>
          <Field label="Short summary" required>
            <Textarea required rows={2} value={program.summary} maxLength={500}
              onChange={event => setProgram({ ...program, summary: event.target.value })}/>
          </Field>
          <Field label="Description">
            <Textarea rows={3} value={program.description} maxLength={4000}
              onChange={event => setProgram({ ...program, description: event.target.value })}/>
          </Field>
          <ActionFooter layout="form"><Button type="submit" disabled={busy} loading={busy}>Save new draft version</Button></ActionFooter>
        </form>
        </div>
      </WorkspacePanel>

      <WorkspacePanel headingLevel="h3" title="Solution Blueprints" actions={<Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setBlueprint(emptyBlueprint); setSelected(null); }}>New Blueprint</Button>}>
        <div className="space-y-4">
        <Field label="Load a Blueprint version">
          <Select value="" disabled={!catalog || busy}
            onChange={event => {
              const row = catalog?.blueprintRecipes.find(recipe => recipe.versionId === event.target.value);
              if (row) void chooseBlueprint(row);
            }}>
            <option value="">Choose a Blueprint…</option>
            {catalog?.blueprintRecipes.map(item => <option key={item.id} value={item.versionId}>
              {item.title} · v{item.versionNo} ({item.managedByPlatform ? item.lifecycle : "other publisher"})
            </option>)}
          </Select>
        </Field>
        <form className="space-y-3" onSubmit={event => void saveBlueprint(event)}>
          <Field label="Blueprint code" required>
            <Input required value={blueprint.code} maxLength={120}
              onChange={event => setBlueprint({ ...blueprint, code: event.target.value })}/>
          </Field>
          <Field label="Blueprint title" required>
            <Input required value={blueprint.title} maxLength={160}
              onChange={event => setBlueprint({ ...blueprint, title: event.target.value })}/>
          </Field>
          <Field label="Related Program code" required>
            <Input required value={blueprint.programCode} maxLength={120}
              onChange={event => setBlueprint({ ...blueprint, programCode: event.target.value })}/>
          </Field>
          <Field label="Associated Offering code (optional)">
            <Input value={blueprint.offeringCode ?? ""} maxLength={120}
              onChange={event => setBlueprint({ ...blueprint, offeringCode: event.target.value || undefined })}/>
          </Field>
          <Field label="Solution target">
            <Select value={blueprint.targetKind}
              onChange={event => setBlueprint({ ...blueprint,
                targetKind: event.target.value as PlatformBlueprintDraft["targetKind"] })}>
              <option value="composite">Composite</option>
              <option value="offering">Offering</option>
              <option value="operation">Operation</option>
            </Select>
          </Field>
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Required and optional components</h4>
              <Button type="button" variant="outline" size="sm"
                disabled={blueprint.components.length >= 30 || busy}
                onClick={() => setBlueprint({ ...blueprint, components: [
                  ...blueprint.components,
                  { key: "", kind: "activity", requirementMode: "optional", description: "" },
                ] })}>Add component</Button>
            </div>
            {blueprint.components.map((component, index) => <div key={index} className="space-y-2 border border-border p-3">
              <Field label={"Component " + (index + 1) + " key"} required>
                <Input required value={component.key}
                  onChange={event => setBlueprint({ ...blueprint,
                    components: blueprint.components.map((item, i) =>
                      i === index ? { ...item, key: event.target.value } : item) })}/>
              </Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Kind">
                  <Select value={component.kind}
                    onChange={event => setBlueprint({ ...blueprint,
                      components: blueprint.components.map((item, i) =>
                        i === index ? { ...item,
                          kind: event.target.value as typeof component.kind } : item) })}>
                    {(["program_model", "community", "experience", "club", "activity"] as const)
                      .map(kind => <option key={kind} value={kind}>{kind.replaceAll("_", " ")}</option>)}
                  </Select>
                </Field>
                <Field label="Requirement">
                  <Select value={component.requirementMode}
                    onChange={event => setBlueprint({ ...blueprint,
                      components: blueprint.components.map((item, i) =>
                        i === index ? { ...item,
                          requirementMode: event.target.value as typeof component.requirementMode } : item) })}>
                    <option value="required">Required</option>
                    <option value="optional">Optional</option>
                    <option value="conditional">Conditional</option>
                  </Select>
                </Field>
              </div>
              <Field label="Description">
                <Input value={component.description} maxLength={500}
                  onChange={event => setBlueprint({ ...blueprint,
                    components: blueprint.components.map((item, i) =>
                      i === index ? { ...item, description: event.target.value } : item) })}/>
              </Field>
              {blueprint.components.length > 1 && <Button type="button" variant="outline" size="sm"
                onClick={() => setBlueprint({ ...blueprint, components: blueprint.components.filter((_, i) => i !== index) })}>
                Remove
              </Button>}
            </div>)}
          </div>
          <ActionFooter layout="form"><Button type="submit" disabled={busy} loading={busy}>Save new draft version</Button></ActionFooter>
        </form>
        </div>
      </WorkspacePanel>
    </div>

    <WorkspacePanel headingLevel="h3" title="Review and publish">
      <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Select the latest draft version. Another App Admin may record an optional
        independent review. The author can publish planning-only definitions
        directly. Publication does not authorize Courses, Sites, or enrollment.
      </p>
      <Field label="Draft awaiting review">
        <Select value={selected ? selected.kind + ":" + selected.versionId : ""}
          onChange={event => {
            const [kind, versionId] = event.target.value.split(":");
            setSelected((kind === "program" || kind === "blueprint") && versionId
              ? { kind, versionId } : null);
          }}>
          <option value="">Choose latest draft…</option>
          {catalog?.programModels.filter(row => row.lifecycle === "draft").map(item =>
            <option key={item.versionId} value={"program:" + item.versionId}>
              Program · {item.title} · v{item.versionNo}
            </option>)}
          {catalog?.blueprintRecipes.filter(row => row.lifecycle === "draft" && row.managedByPlatform).map(item =>
            <option key={item.versionId} value={"blueprint:" + item.versionId}>
              Blueprint · {item.title} · v{item.versionNo}
            </option>)}
        </Select>
      </Field>
      <ActionFooter layout="inline">
        <Button type="button" variant="outline" disabled={!selected || busy}
          onClick={() => void decide("review")}>Optional peer review</Button>
        <Button type="button" disabled={!selected || busy}
          onClick={() => void decide("publish")}>Publish reviewed planning version</Button>
      </ActionFooter>
      </div>
    </WorkspacePanel>
  </section>;
}
