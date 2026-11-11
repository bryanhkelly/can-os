import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { editorialIdentityKeys } from "@/domain/school-blueprint";
import {
  getSiteBlueprintWorkspace, saveSiteBlueprintIdentity, addSiteBlueprintTemplate,
} from "@/modules/programs/school-blueprint.functions";

type Workspace = Awaited<ReturnType<typeof getSiteBlueprintWorkspace>>;
const categories = [
  { id: "program", label: "Programs" },
  { id: "community", label: "Community" },
  { id: "experience", label: "Experiences" },
  { id: "club", label: "Clubs" },
  { id: "activity", label: "Activities" },
] as const;
const identityNames: Record<(typeof editorialIdentityKeys)[number], string> = {
  community_belonging: "Community & Belonging",
  academic_excellence: "Academic Excellence",
  innovation_discovery: "Innovation & Discovery",
  classical_humanities: "Classical & Humanities",
  creative_expression: "Creative Expression",
  leadership_service: "Leadership & Service",
};

/** A real Site-scoped planning surface; catalog selections never activate school operations. */
export function SchoolBlueprintWorkspace({ siteId }: { siteId: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [kind, setKind] = useState<(typeof categories)[number]["id"]>("program");
  const [affiliation, setAffiliation] = useState("");
  const [editorial, setEditorial] = useState<(typeof editorialIdentityKeys)[number]>("community_belonging");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const data = await getSiteBlueprintWorkspace({ data: { siteId } });
    setWorkspace(data);
    setAffiliation(data.identity.religiousAffiliationCode ?? "");
    setEditorial(data.identity.editorialIdentity as (typeof editorialIdentityKeys)[number]);
  }
  useEffect(() => {
    let alive = true;
    void getSiteBlueprintWorkspace({ data: { siteId } })
      .then(data => { if (alive) {
        setWorkspace(data);
        setAffiliation(data.identity.religiousAffiliationCode ?? "");
        setEditorial(data.identity.editorialIdentity as (typeof editorialIdentityKeys)[number]);
      }})
      .catch(() => { if (alive) setError("School Blueprint is unavailable. Check your school access and try again."); });
    return () => { alive = false; };
  }, [siteId]);

  async function saveIdentity() {
    if (!workspace || busy) return;
    setBusy("identity"); setError(""); setNotice("");
    try {
      await saveSiteBlueprintIdentity({ data: {
        siteId, expectedRevision: workspace.revision,
        identity: {
          religiousAffiliationCode: affiliation || null,
          editorialIdentity: editorial,
          culturalContext: workspace.identity.culturalContext,
        },
      }});
      await refresh();
      setNotice("School identity saved privately. Publication and network approval are separate.");
    } catch {
      setError("Could not save identity. Refresh your school configuration and try again.");
    } finally { setBusy(null); }
  }

  async function choose(catalogCode: string) {
    if (!workspace || busy) return;
    setBusy(catalogCode); setError(""); setNotice("");
    try {
      const result = await addSiteBlueprintTemplate({ data: {
        siteId, catalogCode, expectedRevision: workspace.revision,
      }});
      await refresh();
      setNotice(result.changed
        ? "Added to your private School Blueprint. You can prepare it for operation later."
        : "That reference is already in your school plan.");
    } catch {
      setError("The Blueprint changed or this reference is unavailable. Refresh before trying again.");
    } finally { setBusy(null); }
  }

  if (!workspace) return <section className="mt-6 rounded-lg border bg-card p-6" aria-label="School Blueprint">
    <h2 className="font-serif text-2xl">School Blueprint</h2>
    <p role={error ? "alert" : "status"} className="mt-3 text-sm text-muted-foreground">
      {error || "Loading your saved school plan and reference library…"}
    </p>
    {error && <Button className="mt-4" variant="outline" onClick={() => {
      setError(""); void refresh().catch(() => setError("School Blueprint is unavailable."));
    }}>Retry</Button>}
  </section>;

  const selectedVersions = new Set([
    ...workspace.programs.map(item => item.catalogVersionId),
    ...workspace.items.map(item => item.catalogVersionId),
  ].filter((id): id is string => Boolean(id)));
  const available = workspace.catalog.filter(item => item.kind === kind);

  return <section className="mt-6 space-y-7" aria-label="School Blueprint">
    <div className="border bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Build your school · Stage 3</p>
          <h2 className="mt-2 font-serif text-3xl">School Blueprint</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Design the programs and experiences you want to offer. Start with CAN's curated library
            and adapt your selections to the local school. Everything here remains private planning.
          </p>
        </div>
        <p className="border bg-muted px-4 py-2 text-xs font-medium">Draft revision {workspace.revision}</p>
      </div>
      {error && <p role="alert" className="mt-4 border border-destructive p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-4 border bg-muted p-3 text-sm">{notice}</p>}
    </div>

    <div className="grid gap-5 lg:grid-cols-2">
      <section className="border bg-card p-6" aria-label="Religious and editorial identity">
        <h3 className="font-serif text-2xl">School identity</h3>
        <p className="mt-2 text-sm text-muted-foreground">The host's identity does not determine the school's affiliation.</p>
        <label htmlFor="school-blueprint-affiliation" className="mt-5 block text-sm font-semibold">Religious affiliation</label>
        <select id="school-blueprint-affiliation" value={affiliation}
          onChange={e => setAffiliation(e.target.value)}
          className="mt-2 min-h-11 w-full rounded-md border bg-background px-3 text-sm">
          <option value="">Not selected</option>
          {workspace.affiliations.map(choice =>
            <option key={choice.code} value={choice.code}>{choice.label}</option>)}
        </select>
        <label htmlFor="school-blueprint-editorial" className="mt-5 block text-sm font-semibold">Editorial identity</label>
        <select id="school-blueprint-editorial" value={editorial}
          onChange={e => setEditorial(e.target.value as (typeof editorialIdentityKeys)[number])}
          className="mt-2 min-h-11 w-full rounded-md border bg-background px-3 text-sm">
          {editorialIdentityKeys.map(key =>
            <option key={key} value={key}>{identityNames[key]}</option>)}
        </select>
        <Button className="mt-5" disabled={busy !== null} onClick={() => void saveIdentity()}>
          {busy === "identity" ? "Saving…" : "Save school identity"}
        </Button>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Self-declared identity is not a verified network affiliation or permission to use a network's branding.
        </p>
      </section>

      <section className="border bg-card p-6" aria-label="Selected School Blueprint offerings">
        <h3 className="font-serif text-2xl">Your school plan</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {workspace.programs.length} planned programs · {workspace.items.length} planned experiences and activities
        </p>
        {workspace.programs.length + workspace.items.length === 0
          ? <p className="mt-5 border bg-muted p-4 text-sm">Nothing selected yet. Choose an offering from the library below.</p>
          : <ul className="mt-5 space-y-2">
            {workspace.programs.map(item => <li key={item.id} className="border p-3">
              <span className="font-semibold">{item.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">Program · {item.status}</span>
            </li>)}
            {workspace.items.map(item => <li key={item.id} className="border p-3">
              <span className="font-semibold">{item.title}</span>
              <span className="ml-2 text-xs text-muted-foreground">{item.kind} · {item.status}</span>
            </li>)}
          </ul>}
      </section>
    </div>

    <section className="border bg-card p-6" aria-label="School offering reference library">
      <h3 className="font-serif text-2xl">Choose from the CAN reference library</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Templates are starting points—not verified services, staffing commitments, registrations, or active programs.
      </p>
      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter library">
        {categories.map(item => <Button key={item.id} type="button"
          variant={kind === item.id ? "default" : "outline"} aria-pressed={kind === item.id}
          onClick={() => setKind(item.id)}>
          {item.label}
        </Button>)}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {available.map(item => {
          const selected = selectedVersions.has(item.versionId);
          return <article key={item.code} className="flex flex-col border p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.category}</p>
            <h4 className="mt-2 text-lg font-semibold">{item.name}</h4>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{item.summary}</p>
            <Button className="mt-4" type="button" variant={selected ? "outline" : "default"}
              disabled={busy !== null || selected} onClick={() => void choose(item.code)}>
              {selected ? "Added to your plan" : busy === item.code ? "Adding…" : "Add to school plan"}
            </Button>
          </article>;
        })}
      </div>
    </section>
    <p className="text-xs leading-5 text-muted-foreground">
      Planning is separate from approved curriculum, published school websites, active activities, and school-opening authorization.
    </p>
  </section>;
}
