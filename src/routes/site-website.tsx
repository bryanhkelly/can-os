import { resolveSiteTheme, sitePaletteIds, siteTypographyIds, type SiteTypographyId } from "@/domain/site-theme";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { Eye, Globe2, LockKeyhole, PencilLine } from "lucide-react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  emptySiteLocalContent, siteLocalContentLimits, siteLocalImageMaxBytes,
  siteLocalThemes, type SiteLocalContent, type SiteLocalImageConsent, type SiteLocalTextField,
} from "@/domain/site-local-content";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { getPartnerWebsitePreviewView, publishChurchWebsiteContent, restoreChurchWebsiteContent } from "@/modules/sites/site-website-preview.functions";
import { ChurchSourceSuggestionReview } from "@/components/operations/ChurchSourceSuggestionReview";
import { ChurchSourceReferenceEditor } from "@/components/operations/ChurchSourceReferenceEditor";
import {LaunchWebsiteEditorHandoff} from "@/components/operations/LaunchWebsiteEditorHandoff";
import {optionalSearchString,siteProgramSelectionSchema} from "@/lib/route-search";
const websiteSearchSchema=siteProgramSelectionSchema.extend({returnGrantId:optionalSearchString});

export const Route = createFileRoute("/site-website")({
  validateSearch:(search:Record<string,unknown>):{siteId?:string;programId?:string;returnGrantId?:string}=>websiteSearchSchema.parse(search),
  loaderDeps:({search})=>({siteId:search.siteId}),
  loader:({deps})=>safeLoader(
    () => getPartnerWebsitePreviewView({data:{siteId:deps.siteId}}),
    { authMessage: "This website preview requires a verified, Site-specific editor assignment." },
  )(),
  component: PartnerSiteWebsitePage,
});

function PartnerSiteWebsitePage() {
  const outcome = Route.useLoaderData();
  const selection=Route.useSearch();
  const returnToLaunch=selection.siteId&&selection.programId&&selection.returnGrantId
    ?<LaunchWebsiteEditorHandoff siteId={selection.siteId} programId={selection.programId} returnGrantId={selection.returnGrantId} destination="launch"/>:null;
  if (!outcome.ok) return <>{returnToLaunch}<LoaderFailure eyebrow="CAN OS · Partner website"
    title="Your Site website" outcome={outcome} /></>;

  const data = outcome.data;
  return <WorkspaceShell
    eyebrow="CAN OS · Church partner website"
    title={data.siteName + " · church website"}
    subtitle={data.organizationName + " · edit local content, review CAN-approved school listings"} actions={returnToLaunch}>
    <WorkflowIntro eyebrow="Your community, your voice" title="Make your school feel local." description="Shape your church's welcome and community story while CAN maintains authoritative school programs, academic claims, and admissions information." actions={<div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-border/70 bg-background/90 p-4"><p className="flex items-center gap-2 text-sm font-semibold"><PencilLine className="size-4 text-primary" /> Church-owned content</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Edit and publish local descriptions and theological content without routine CAN approval.</p></div><div className="rounded-2xl border border-border/70 bg-background/90 p-4"><p className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="size-4 text-primary" /> CAN institutional content</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Academic listings, launch status, and regulated claims remain controlled by CAN.</p></div></div>} />
    <section className="mt-6 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
      <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold"><Globe2 className="size-5 text-primary" /> Your proposed Site address</h2>
      {data.host ? <>
        <p className="mt-3 font-mono text-sm">{data.host}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Site state: {data.status === "published" ? "Marketing approved" : "Private draft"}.
          The public hostname is not activated from this workspace.
        </p>
      </> : <p role="status" className="mt-3 text-sm">
        No public address is reserved for this Site. Ask your CAN launch registrar
        to finish website draft provisioning. You cannot reserve or publish
        addresses from this partner workspace.
      </p>}
      <p className="mt-3 text-sm text-muted-foreground">
        You may publish your church-owned descriptions and theological content without
        routine CAN approval. CAN remains responsible for the Site's institutional
        launch status, academic claims and admissions. This account cannot change
        those records or access student information.
      </p>
    </section>
    <WebsiteInformationChecklist data={data} />
    <ChurchSourceReferenceEditor />
    <ChurchSourceSuggestionReview currentRevision={data.currentRevision} />
    {data.host && <LocalWebsiteCopyEditor data={data} />}
    <WebsitePreviewPanel data={data} />

  </WorkspaceShell>;
}

function WebsiteInformationChecklist({ data }: {
  data: Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>
}) {
  const readiness = data.publicInformationReadiness;
  const required = readiness.gaps.filter(gap => gap.required);
  const optional = readiness.gaps.filter(gap => !gap.required);
  return <section aria-labelledby="website-readiness-title"
    className="mt-6 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Parent information</p>
    <h2 id="website-readiness-title" className="mt-2 font-serif text-2xl font-semibold">
      What families can learn about this school
    </h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
      This checklist is derived from approved public school records and published local
      content—not from draft copy or invented example data. It does not establish
      school-opening authority, admissions approval, or live website hosting.
    </p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border p-3 text-sm">
        <p className="font-semibold">Website marketing</p>
        <p className="mt-1 text-muted-foreground">{readiness.marketing === "published"
          ? "Published in the Site registry; public host still needs verification"
          : "Not published"}</p>
      </div>
      <div className="rounded-lg border p-3 text-sm">
        <p className="font-semibold">Information</p>
        <p className="mt-1 text-muted-foreground">{required.length === 0
          ? "Required parent information categories represented"
          : `${required.length} required information gaps`}</p>
      </div>
      <div className="rounded-lg border p-3 text-sm">
        <p className="font-semibold">Institutional authority</p>
        <p className="mt-1 text-muted-foreground">Not verified by this preview</p>
      </div>
    </div>
    {readiness.gaps.length ? <div className="mt-5 space-y-5">
      {[{label:"Needs approval or configuration", gaps:required},
        {label:"Additional information families value", gaps:optional}]
        .filter(group => group.gaps.length).map(group =>
          <div key={group.label}>
            <h3 className="text-sm font-semibold">{group.label}</h3>
            <ul className="mt-2 divide-y rounded-lg border">
              {group.gaps.map(gap => <li key={`${gap.category}:${gap.owner}`}
                className="flex flex-wrap items-start justify-between gap-2 px-3 py-3 text-sm">
                <span className="max-w-2xl">{gap.message}</span>
                <span className="text-xs text-muted-foreground">
                  Owner: {gap.owner.replace(/_/g, " ")}
                </span>
              </li>)}
            </ul>
          </div>)}
    </div> : <p role="status" className="mt-4 text-sm">
      All represented information categories have reviewed public values. This does
      not certify school opening or external hosting.
    </p>}
  </section>;
}

function WebsitePreviewPanel({ data }: { data: Awaited<ReturnType<typeof getPartnerWebsitePreviewView>> }) {
  const pages = Object.entries(data.previewPages ?? {});
  const [selected, setSelected] = useState("/");
  const activeHtml = data.previewPages?.[selected] ?? data.previewHtml;
  return <section aria-labelledby="partner-preview-title" className="mt-6 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
    <h2 id="partner-preview-title" className="flex items-center gap-2 font-serif text-2xl font-semibold"><Eye className="size-5 text-primary" /> Private website preview</h2>
    <p className="mt-2 text-sm text-muted-foreground">Review every page with the same server-rendered template used by the live website. Forms and scripts stay disabled here.</p>
    {pages.length > 0 && <div role="group" aria-label="Preview a website page" className="mt-4 flex flex-wrap gap-2">
      {pages.map(([path]) => <button key={path} type="button" aria-pressed={selected === path}
        onClick={() => setSelected(path)} className="rounded-lg border px-3 py-2 text-sm aria-pressed:bg-primary aria-pressed:text-primary-foreground">
        {path === "/" ? "Home" : path.slice(1).replace(/-/g, " ")}
      </button>)}
    </div>}
    {activeHtml ? <iframe key={selected} title={`${data.siteName} ${selected} read-only website preview`}
      srcDoc={activeHtml} sandbox="" referrerPolicy="no-referrer" loading="lazy"
      className="mt-4 h-[700px] w-full rounded-lg border bg-white" />
      : <p className="mt-4 rounded-lg border p-4 text-sm">A private website preview becomes available when a Site draft address is reserved by your registrar.</p>}
  </section>;
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result) : reject(new Error("Artwork could not be read"));
    reader.onerror = () => reject(new Error("Artwork could not be read"));
    reader.readAsDataURL(blob);
  });
}

/** Re-encoding removes source metadata and excludes SVG/external image loads. */
async function prepareWebsiteArtwork(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    throw new Error("Choose a PNG or JPEG image no larger than 8 MB");
  }
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Artwork could not be decoded"));
      image.src = sourceUrl;
    });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Artwork processing is unavailable in this browser");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (!png || png.size > siteLocalImageMaxBytes) {
      throw new Error("Processed artwork must be no larger than 160 KB; choose a simpler or smaller image");
    }
    return blobDataUrl(png);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

const churchFields: ReadonlyArray<{ key: SiteLocalTextField; label: string; help: string; multi: boolean }> = [
  { key: "welcomeMessage", label: "Welcome", help: "A message from your local church.", multi: true },
  { key: "churchHistory", label: "Tell us about your church", help: "When did your church begin? Share its history and important milestones.", multi: true },
  { key: "communityOutreach", label: "Who does your church serve?", help: "Describe the people, neighborhoods and outreach efforts central to your community.", multi: true },
  { key: "schoolVision", label: "Why did your church start a school?", help: "Share your vision without making promises about unapproved academic services.", multi: true },
  { key: "leadershipWelcome", label: "A welcome from your pastor or school leader", help: "Optional words approved by your church leader for families.", multi: true },
  { key: "localTraditions", label: "Local traditions and experiences", help: "Share real local traditions, service projects and community experiences.", multi: true },
  { key: "localDescription", label: "Local community and school vision", help: "Local vision, history, activities and community information; do not promise official academic services.", multi: true },
  { key: "denomination", label: "Denominational affiliation", help: "Describe your church's identity. Do not claim an endorsement that has not been granted.", multi: false },
  { key: "statementOfFaith", label: "Statement of faith", help: "Your church's own theological statement, not CAN's academic policies.", multi: true },
  { key: "spiritualFormation", label: "Spiritual formation", help: "Prayer, worship, discipleship, chapel or religious observances provided locally.", multi: true },
];

function LocalWebsiteCopyEditor({
  data,
}: { data: Awaited<ReturnType<typeof getPartnerWebsitePreviewView>> }) {
  const router = useRouter();
  const [content, setContent] = useState<SiteLocalContent>(
    data.editingContent ?? emptySiteLocalContent,
  );
  const [preparingArtwork, setPreparingArtwork] = useState(false);
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed || preparingArtwork;
  const [error, setError] = useState("");
  useEffect(() => {
    setContent(data.editingContent ?? emptySiteLocalContent);
  }, [data.currentRevision, data.editingContent]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    await mutation.run(() => publishChurchWebsiteContent({
        data: { content, expectedRevision: data.currentRevision,siteId:data.siteId },
      }), { successMessage: result => result.status === "review_required"
        ? "Protected institutional language was held for CAN review. Previously published church content remains unchanged."
        : "Church content published. If this Site is publicly active, the new copy is available without separate CAN editorial approval.",
      commandErrorMessage: "Could not save church content." });
  }

  async function restore(revision: number) {
    if (busy) return;
    setError("");
    await mutation.run(() => restoreChurchWebsiteContent({
        data: { expectedRevision: data.currentRevision, restoreRevision: revision,siteId:data.siteId },
      }), { successMessage: result => result.status === "review_required"
        ? "Historical copy needs review under current claim rules; existing public content is unchanged."
        : `Revision ${revision} was restored as a new published revision.`,
      commandErrorMessage: "Unable to restore this revision." });
  }

  async function selectArtwork(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setPreparingArtwork(true); setError("");
    try {
      const dataUrl = await prepareWebsiteArtwork(file);
      setContent(old => ({ ...old, branding: { ...old.branding, heroImage: {
        dataUrl, altText: "", rightsConfirmed: false, childImageConsent: "unconfirmed",
      } } }));
    } catch (caught) {
      setError(mutationErrorMessage(caught, "Artwork could not be prepared"));
    } finally { setPreparingArtwork(false); }
  }

  return <section aria-labelledby="local-copy-title" className="mt-6 rounded-xl border bg-card p-5">
    <h2 id="local-copy-title" className="text-xl font-semibold">Tell your school's story</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Share what you know now; optional questions can be left blank and revisited later. Local community, denominational and theological
      updates publish directly when basic safety checks pass, without CAN editorial
      approval. Official curriculum, admissions, tuition, accreditation and
      school-of-record information comes from CAN OS and cannot be edited here.
    </p>
    {!data.canPublish && <p role="status" className="mt-3 rounded-lg border p-3 text-sm">
      You can preview this Site, but your current verified Site assignment has not
      been granted local website publishing. Ask the Site administrator to assign
      that specific capability; CAN academic approval is not required for church copy.
    </p>}
    {data.localContentStatus === "review_required" && <p role="status" className="mt-3 rounded-lg border p-3 text-sm">
      Your latest proposed wording includes a protected claim. It is held for review;
      the last published church copy remains unchanged.
    </p>}
    {error && <p role="alert" className="mt-3 rounded-lg border p-3 text-sm">{error}</p>}
    <MutationFeedback state={mutation} className="mt-3" pendingMessage="Saving website content..."/>
    <form onSubmit={event => void submit(event)} className="mt-5 space-y-4">
      <fieldset disabled={busy || !data.canPublish} className="space-y-4 rounded-xl border p-4">
        <legend className="px-2 text-sm font-semibold">Local branding and approved artwork</legend>
        <label className="block text-sm">
          <span className="font-medium">Theme</span>
          <select value={content.branding.theme} onChange={event => setContent(old => ({
            ...old, branding: { ...old.branding, theme: event.target.value as typeof siteLocalThemes[number] },
          }))} className="mt-2 w-full rounded-lg border bg-background p-2 text-sm">
            <option value="classic">Classic blue</option>
            <option value="warm">Warm neutrals</option>
            <option value="light">Simple light</option>
          </select>
        </label>
        <div className="rounded-xl border p-4">
          <p className="font-medium">Choose your school's visual identity</p>
          <p className="mt-1 text-xs text-muted-foreground">CAN Signature gives you a complete editorial design.
            Inspired by your church uses approved palette and typography choices; automatic source discovery
            is not available until the separate church-reference integration is connected.</p>
          <div role="group" aria-label="School color palettes" className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            {sitePaletteIds.map(id => {
              const palette = resolveSiteTheme(id,content.branding.typographyId);
              return <button type="button" key={id} aria-pressed={(content.branding.paletteId ?? "signature")===id}
                onClick={()=>setContent(old=>({...old,branding:{...old.branding,paletteId:id}}))}
                className="min-h-14 rounded-lg border p-3 text-left text-sm capitalize aria-pressed:ring-2 aria-pressed:ring-primary">
                <span aria-hidden="true" className="mb-2 flex h-5 overflow-hidden rounded">
                  <span className="flex-1" style={{backgroundColor:palette.ink}}/>
                  <span className="flex-1" style={{backgroundColor:palette.secondary}}/>
                  <span className="flex-1" style={{backgroundColor:palette.accent}}/>
                  <span className="flex-1" style={{backgroundColor:palette.canvas}}/>
                </span>{id === "signature" ? "CAN Signature" : id}
              </button>;
            })}
          </div>
          <label className="mt-4 block text-sm">
            <span className="font-medium">Approved typography pairing</span>
            <select value={content.branding.typographyId ?? "editorial"}
              onChange={event=>setContent(old=>({...old,branding:{...old.branding,
                typographyId:event.target.value as SiteTypographyId}}))}
              className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">
              {siteTypographyIds.map(id=><option key={id} value={id}>
                {id === "editorial" ? "Editorial serif + modern sans" :
                  id === "traditional" ? "Heritage serif + clean sans" : "Contemporary humanist sans"}
              </option>)}
            </select>
          </label>
          <p className="mt-3 text-xs text-muted-foreground">All choices use a maintained, contrast-checked palette
            and safe system fonts. Church website colors and fonts, when discovered, are suggestions only;
            no logo, third-party font, photograph or CSS is copied automatically.</p>
        </div>
        <label className="block text-sm">
          <span className="font-medium">Church or community artwork (optional)</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            PNG or JPEG, re-encoded locally to a metadata-free PNG. No remote URLs, embeds or tracking.
          </span>
          <input type="file" accept="image/png,image/jpeg" onChange={event => void selectArtwork(event)}
            className="mt-2 block w-full text-sm" />
        </label>
        {content.branding.heroImage && <div className="space-y-3 rounded-lg bg-muted/40 p-3">
          <img src={content.branding.heroImage.dataUrl} alt="Selected artwork preview"
            className="max-h-52 w-full rounded-lg object-cover" />
          <label className="block text-sm">
            <span className="font-medium">Artwork description for screen readers</span>
            <input type="text" required maxLength={180} value={content.branding.heroImage.altText}
              onChange={event => setContent(old => ({ ...old, branding: { ...old.branding,
                heroImage: old.branding.heroImage ? { ...old.branding.heroImage, altText: event.target.value } : null,
              } }))} className="mt-2 w-full rounded-lg border bg-background p-2 text-sm" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required checked={content.branding.heroImage.rightsConfirmed}
              onChange={event => setContent(old => ({ ...old, branding: { ...old.branding,
                heroImage: old.branding.heroImage ? { ...old.branding.heroImage, rightsConfirmed: event.target.checked } : null,
              } }))} className="mt-1" />
            <span>I own this image or have documented permission to publish it on this public website.</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Child privacy and consent</span>
            <select required value={content.branding.heroImage.childImageConsent}
              onChange={event => setContent(old => ({ ...old, branding: { ...old.branding,
                heroImage: old.branding.heroImage ? { ...old.branding.heroImage,
                  childImageConsent: event.target.value as SiteLocalImageConsent } : null,
              } }))} className="mt-2 w-full rounded-lg border bg-background p-2 text-sm">
              <option value="unconfirmed">Choose a confirmation</option>
              <option value="no_identifiable_children">No identifiable children appear</option>
              <option value="guardian_consent_confirmed">Documented guardian consent covers every identifiable child</option>
            </select>
          </label>
          <button type="button" onClick={() => setContent(old => ({
            ...old, branding: { ...old.branding, heroImage: null },
          }))} className="rounded-lg border px-3 py-1 text-xs">Remove artwork</button>
        </div>}
      </fieldset>
      <div className="rounded-xl border bg-muted/30 p-4"><h3 className="font-serif text-lg font-semibold">Your church, in your own words</h3><p className="mt-1 text-sm text-muted-foreground">Answer the prompts below. Save when ready; unanswered sections remain hidden on the public website.</p></div>
      {churchFields.map(field => <label key={field.key} className="block text-sm">
        <span className="font-medium">{field.label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{field.help}</span>
        {field.multi
          ? <textarea rows={field.key === "statementOfFaith" ? 6 : 3}
              maxLength={siteLocalContentLimits[field.key]}
              value={content[field.key] ?? ""} onChange={e => setContent(old =>
                ({ ...old, [field.key]: e.target.value }))}
              className="mt-2 w-full rounded-lg border bg-background p-2 text-sm" />
          : <input type="text" maxLength={siteLocalContentLimits[field.key]}
              value={content[field.key] ?? ""} onChange={e => setContent(old =>
                ({ ...old, [field.key]: e.target.value }))}
              className="mt-2 w-full rounded-lg border bg-background p-2 text-sm" />}
      </label>)}
      <button type="submit" disabled={busy || !data.canPublish}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
        {busy ? "Saving…" : "Publish church-owned content"}
      </button>
      <p className="text-xs text-muted-foreground">
        Revision {data.currentRevision}. Raw HTML, embeds, testimonials and social links are not supported.
        Artwork requires rights and child-privacy confirmations on every new revision.
      </p>
    </form>
    {data.localHistory.length > 0 && <div className="mt-8 border-t pt-5">
      <h3 className="font-semibold">Version history and rollback</h3>
      <ul className="mt-3 space-y-2">
        {data.localHistory.map(version => <li key={version.revision}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <span>Revision {version.revision} · {version.status === "published" ? "Published" : "Held for review"}
            {" · "}{new Date(version.createdAt).toLocaleString()}</span>
          {data.canPublish && version.status === "published" && version.revision < data.currentRevision &&
            <button type="button" disabled={busy} onClick={() => void restore(version.revision)}
              className="rounded-lg border px-3 py-1 text-xs disabled:opacity-50">
              Restore as new revision
            </button>}
        </li>)}
      </ul>
    </div>}
  </section>;
}
