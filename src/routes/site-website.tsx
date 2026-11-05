import { resolveSiteTheme, sitePaletteIds, siteTypographyIds, type SiteTypographyId, type SiteTemplateId } from "@/domain/site-theme";
import { WebsiteTemplateGallery } from "@/components/launch-studio/WebsiteTemplateGallery";
import { LaunchStudioShell } from "@/components/launch-studio/LaunchStudioShell";
import { Link } from "@tanstack/react-router";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { GuidedSetupShell } from "@/components/workflow";
import { Eye } from "lucide-react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent } from "react";
import {
  prepareWebsiteEditorContent, restoreOriginalWebsiteField, websiteStarterFieldIds, siteLocalContentLimits, siteLocalImageMaxBytes,
  type SiteLocalContent, type SiteLocalImageConsent, type SiteLocalTextField,
} from "@/domain/site-local-content";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { getPartnerWebsitePreviewView, previewChurchWebsiteDraft, saveChurchWebsiteDraft, publishChurchWebsiteContent, restoreChurchWebsiteContent } from "@/modules/sites/site-website-preview.functions";
import { ChurchSourceSuggestionReview } from "@/components/operations/ChurchSourceSuggestionReview";
import { ChurchSourceReferenceEditor } from "@/components/operations/ChurchSourceReferenceEditor";
import {SchoolMediaFolderManager} from "@/components/operations/SchoolMediaFolderManager";
import {LaunchWebsiteEditorHandoff} from "@/components/operations/LaunchWebsiteEditorHandoff";
import {optionalSearchString,siteProgramSelectionSchema} from "@/lib/route-search";
const websiteSearchSchema=siteProgramSelectionSchema.extend({returnGrantId:optionalSearchString});

export const loadWebsiteHome = (siteId?: string) => safeLoader(
  () => getPartnerWebsitePreviewView({data:{siteId}}),
  { authMessage: "This website preview requires a verified, Site-specific editor assignment." },
)();

export const Route = createFileRoute("/site-website")({
  validateSearch:(search:Record<string,unknown>):{siteId?:string;programId?:string;returnGrantId?:string}=>websiteSearchSchema.parse(search),
  loaderDeps:({search})=>({siteId:search.siteId}),
  loader:({deps})=>loadWebsiteHome(deps.siteId),
  component: PartnerSiteWebsitePage,
});

function PartnerSiteWebsitePage() {
  return <WebsiteHome outcome={Route.useLoaderData()} selection={Route.useSearch()} />;
}
export function WebsiteHome({ outcome, selection, studio = false }: {
  outcome: Awaited<ReturnType<typeof loadWebsiteHome>>;
  selection: { siteId?: string; programId?: string; returnGrantId?: string };
  studio?: boolean;
}) {
  const [step, setStep] = useState(0);
  const returnToLaunch=selection.siteId&&selection.programId&&selection.returnGrantId
    ?<LaunchWebsiteEditorHandoff siteId={selection.siteId} programId={selection.programId} returnGrantId={selection.returnGrantId} destination="launch"/>:null;
  if (!outcome.ok) return <>{returnToLaunch}<LoaderFailure eyebrow="Partner website"
    title="Your Site website" outcome={outcome} /></>;

  const data = outcome.data;
  const steps = [
    {id:"0", title:"Welcome & sources"}, {id:"1",title:"Choose a template"},
    {id:"2",title:"Colors & photography"}, {id:"3",title:"School story"},
    {id:"4",title:"Preview & finish"},
  ];
  if (studio) return <LaunchStudioShell role="Website design" subject={data.siteName}
    title={["Bring your school online.","Find the right first impression.","Make it your own.",
      "Tell your school's story.","Review your website."][step]}
    description="One Site, one school website. Academic, admissions and school-opening approvals remain separate."
    steps={steps} currentId={String(step)} onStepChange={id => setStep(Number(id))}
    help={<p>Need editing permission? Ask your Site administrator for a verified Site website editor invitation. Previewing and saving a draft do not publish it.</p>}
    exit={returnToLaunch ?? <Link to="/home" className="underline">Exit to your workspace</Link>}>
    {data.host
      ? <LocalWebsiteCopyEditor data={data} step={step} onStepChange={setStep}/>
      : <p role="status" className="border bg-card p-5 text-sm">Your registrar must reserve a draft Site address before website design can be saved.</p>}
  </LaunchStudioShell>;
  return <WorkspaceShell
    eyebrow="Church partner website"
    title={data.siteName + " · church website"}
    subtitle={data.organizationName + " · edit local content, review CAN-approved school listings"} actions={returnToLaunch}>
    <GuidedSetupShell
      title="Make your school website feel local"
      description="Start with a welcome, add your church's story and visual identity, then review the private preview. Your answers stay in this page as you move between steps; nothing is saved or published until you choose Publish."
      steps={data.host ? steps.map((item,index)=>({
        id:item.id,title:item.title,description:index===0?"Bring current sources":index===1?"Choose a design":
          index===2?"Personalize the look":index===3?"Approved school copy":"Private preview and publication",
        status:step===index?"current":step>index?"complete":"upcoming",
      })) : [
        { id: "address", title: "Site address", description: "Ask your registrar to provision a draft", status: "current" },
      ]}
      aside={<div className="space-y-3 py-1 text-sm">
        <p className="font-semibold">Site address</p>
        {data.host ? <>
          <p className="break-all font-mono text-xs">{data.host}</p>
          <p className="text-muted-foreground">
            {data.status === "published" ? "Marketing approved" : "Private draft"}.
            The public hostname is not activated from this workspace.
          </p>
        </> : <p role="status" className="text-muted-foreground">
          No address is reserved. Ask your CAN launch registrar to finish draft provisioning.
        </p>}
        <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">
          You can publish church-owned content. CAN retains control of academic claims,
          admissions and institutional information.
        </p>
      </div>}>
      {data.host
        ? <LocalWebsiteCopyEditor data={data} step={step} onStepChange={setStep} />
        : <p role="status" className="text-sm text-muted-foreground">
          Your registrar must reserve a draft Site address before website content can be edited.
        </p>}
    </GuidedSetupShell>
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
              {group.gaps.map(gap => <li key={`${gap.category}:${gap.owner}:${gap.message}`}
                className="flex flex-wrap items-start justify-between gap-2 px-3 py-3 text-sm">
                <span className="max-w-2xl">{gap.message}</span>
                <span className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                  <span>Owner: {gap.owner.replace(/_/g, " ")}</span>
                  <a className="font-semibold underline underline-offset-4" href={gap.destination}>
                    Open owning workspace
                  </a>
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

/** A shared quality guide for every partner school. This is advisory and
 * never substitutes for publisher, school opening, hosting, or consent checks. */
function WebsiteDesignChecklist({data}:{data:Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>}) {
  const content=data.editingContent;
  const publishedPages=Object.keys(data.previewPages??{});
  const items=[
    {title:"A recognizable school welcome",ready:Boolean(content?.welcomeMessage?.trim()),
      help:"Add a short, distinctive welcome in the local website editor."},
    {title:"Your school's purpose and story",ready:Boolean(content?.schoolVision?.trim() &&
      (content?.localDescription?.trim() || content?.churchHistory?.trim())),
      help:"Describe why this school exists and the people and community behind it."},
    {title:"Reviewed school photography",ready:data.approvedPhotoCount>0 || Boolean(content?.branding.heroImage?.rightsConfirmed &&
      content?.branding.heroImage?.altText?.trim() &&
      content?.branding.heroImage?.childImageConsent !== "unconfirmed"),
      help:"Add one rights-cleared photograph with accessible alt text; the layout works without a photo."},
    {title:"A complete About page",ready:publishedPages.includes("/about"),
      help:"Publish local identity content to make the About page available."},
    {title:"Published academic information",ready:data.approvedAcademicCount>0,
      help:"Academic Programs require separate institution-owned marketing approval."},
    {title:"Useful family next steps",ready:Boolean(publishedPages.includes("/admissions") ||
      publishedPages.includes("/contact")),
      help:"Families should have a published contact channel or an approved Program inquiry route."},
  ];
  const completed=items.filter(item=>item.ready).length;
  return <section aria-labelledby="school-website-design-readiness" className="mt-6 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Website quality</p>
    <h2 id="school-website-design-readiness" className="mt-2 font-serif text-2xl font-semibold">Make this site feel like your school</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
      A strong school website combines your own story and photography with independently
      approved programs and family information. These checks are shared by every CAN OS school;
      they are editorial guidance, not a publication or operating authorization.
    </p>
    <p className="mt-3 text-sm font-semibold" role="status">{completed} of {items.length} content-quality signals represented</p>
    <ul className="mt-4 grid gap-3 md:grid-cols-2">
      {items.map(item=><li key={item.title} className="rounded-lg border p-4">
        <p className="text-sm font-semibold">{item.ready?"✓ ":"○ "}{item.title}</p>
        {!item.ready&&<p className="mt-2 text-sm text-muted-foreground">{item.help}</p>}
      </li>)}
    </ul>
    <p className="mt-3 text-xs text-muted-foreground">Draft media and copy require the existing publication and rights checks before appearing publicly. External hosting, applications and school opening are verified separately.</p>
  </section>;
}

function WebsitePreviewPanel({ data, draftPreview }: {
  data: Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>;
  draftPreview?: Awaited<ReturnType<typeof previewChurchWebsiteDraft>> | null;
}) {
  const [selected, setSelected] = useState("/");
  const [device, setDevice] = useState<"desktop"|"mobile">("desktop");
  const htmlPages = draftPreview?.previewPages ?? data.previewPages ?? {};
  const pages = Object.entries(htmlPages);
  const activeHtml = htmlPages[selected] ?? draftPreview?.previewHtml ?? data.previewHtml;
  return <section aria-labelledby="partner-preview-title" className="mt-6 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
    <h2 id="partner-preview-title" className="flex items-center gap-2 font-serif text-2xl font-semibold"><Eye className="size-5 text-primary" /> {draftPreview ? "Your unsaved design preview" : "Previously saved website preview"}</h2>
    <p className="mt-2 text-sm text-muted-foreground">Review every page with the same server-rendered template used by the live website. Forms and scripts stay disabled here.</p>
    {pages.length > 0 && <div role="group" aria-label="Preview a website page" className="mt-4 flex flex-wrap gap-2">
      {pages.map(([path]) => <button key={path} type="button" aria-pressed={selected === path}
        onClick={() => setSelected(path)} className="rounded-lg border px-3 py-2 text-sm aria-pressed:bg-primary aria-pressed:text-primary-foreground">
        {path === "/" ? "Home" : path.slice(1).replace(/-/g, " ")}
      </button>)}
    </div>}
    <div role="group" aria-label="Preview width" className="mt-4 flex flex-wrap gap-2">
      <button type="button" aria-pressed={device==="desktop"} onClick={()=>setDevice("desktop")}
        className="border px-3 py-2 text-xs font-semibold aria-pressed:border-primary aria-pressed:text-primary">Desktop</button>
      <button type="button" aria-pressed={device==="mobile"} onClick={()=>setDevice("mobile")}
        className="border px-3 py-2 text-xs font-semibold aria-pressed:border-primary aria-pressed:text-primary">Mobile</button>
    </div>
    {activeHtml ? <iframe key={selected+"-"+device} title={`${data.siteName} ${selected} read-only website preview`}
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
  { key: "heroHeadline", label: "Homepage headline", help: "The first words families see. Your school name still appears in the website header.", multi: true },
  { key: "welcomeMessage", label: "Welcome to families", help: "Introduce the kind of community you hope to build.", multi: true },
  { key: "churchHistory", label: "Tell us about your church", help: "When did your church begin? Share its history and important milestones.", multi: true },
  { key: "communityOutreach", label: "Your community", help: "What relationships, partnerships or hopes connect your school with the people around it? Avoid describing unconfirmed activities.", multi: true },
  { key: "schoolVision", label: "Your vision", help: "What do you hope students will become? You can personalize the prepared wording.", multi: true },
  { key: "leadershipWelcome", label: "A welcome from your pastor or school leader", help: "Optional words approved by your church leader for families.", multi: true },
  { key: "localTraditions", label: "Local traditions and experiences", help: "Share real local traditions, service projects and community experiences.", multi: true },
  { key: "localDescription", label: "Your school story", help: "What makes your school's purpose and community special? Avoid promises about unapproved academic services.", multi: true },
  { key: "denomination", label: "Denominational affiliation", help: "Describe your church's identity. Do not claim an endorsement that has not been granted.", multi: false },
  { key: "statementOfFaith", label: "Statement of faith", help: "Your church's own theological statement, not CAN's academic policies.", multi: true },
  { key: "spiritualFormation", label: "Spiritual formation", help: "Prayer, worship, discipleship, chapel or religious observances provided locally.", multi: true },
];

function LocalWebsiteCopyEditor({
  data, step, onStepChange,
}: {
  data: Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>;
  step: number;
  onStepChange: (step: number) => void;
}) {
  const router = useRouter();
  const [content, setContent] = useState<SiteLocalContent>(() =>
    prepareWebsiteEditorContent(data.editingContent, data.siteName),
  );
  const [preparingArtwork, setPreparingArtwork] = useState(false);
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed || preparingArtwork;
  const [error, setError] = useState("");
  const [draftPreview, setDraftPreview] = useState<{source: SiteLocalContent; rendered: Awaited<ReturnType<typeof previewChurchWebsiteDraft>>} | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState("");
  useEffect(() => {
    setDraftPreview(null);
    setContent(prepareWebsiteEditorContent(data.editingContent, data.siteName));
  }, [data.currentRevision, data.editingContent, data.siteName]);

  async function saveDraft() {
    if (busy || !data.canPublish) return;
    setError("");
    await mutation.run(() => saveChurchWebsiteDraft({
      data: { content, siteId: data.siteId, expectedRevision: data.currentRevision },
    }), { successMessage: "Private website draft saved. The public site and approval statuses have not changed.",
      commandErrorMessage: "Could not save the private website draft." });
  }
  async function previewCurrentDraft() {
    if (previewPending) return;
    setPreviewPending(true); setPreviewError("");
    try {
      const source = content;
      const preview = await previewChurchWebsiteDraft({ data: { content: source, siteId: data.siteId } });
      setDraftPreview({ source, rendered: preview });
    } catch (cause) {
      setPreviewError(mutationErrorMessage(cause,"The private draft could not be rendered. Check artwork rights and source fields."));
    } finally { setPreviewPending(false); }
  }

  async function submit() {
    if (busy) return;
    setError("");
    const heroImage = content.branding.heroImage;
    if (heroImage && (!heroImage.altText.trim() || !heroImage.rightsConfirmed ||
      heroImage.childImageConsent === "unconfirmed")) {
      setError("Complete the artwork description, usage rights and child-privacy confirmations before publishing.");
      return;
    }
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

  const primaryFields = churchFields.filter(field =>
    ["heroHeadline", "welcomeMessage", "schoolVision", "localDescription", "communityOutreach"].includes(field.key));
  const additionalStoryFields = churchFields.filter(field =>
    ["churchHistory", "leadershipWelcome", "localTraditions", "denomination", "statementOfFaith", "spiritualFormation"].includes(field.key));
  const textField = (field: typeof churchFields[number]) => {
    const starter = content.editorialBaseline?.fields[field.key as typeof websiteStarterFieldIds[number]];
    const changed = typeof starter === "string" && (content[field.key] ?? "") !== starter;
    const sequence = websiteStarterFieldIds.indexOf(field.key as typeof websiteStarterFieldIds[number]);
    return <div key={field.key} className="border-b border-border pb-5 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <label className="min-w-0 flex-1 text-sm" htmlFor={`website-copy-${field.key}`}>
          <span className="flex items-center gap-3 font-semibold">
            {sequence >= 0 && <span aria-hidden="true" className="font-mono text-xs font-normal text-muted-foreground">
              {String(sequence + 1).padStart(2, "0")}
            </span>}
            {field.label}
          </span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{field.help}</span>
        </label>
        {typeof starter === "string" && <button type="button"
          aria-label={`Reset ${field.label} to original suggested copy`}
          disabled={!changed || busy || !data.canPublish}
          onClick={() => setContent(old => restoreOriginalWebsiteField(old, field.key))}
          className="min-h-11 shrink-0 border border-border px-3 py-2 text-xs font-semibold text-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
          Reset to original
        </button>}
      </div>
      {field.multi
        ? <textarea id={`website-copy-${field.key}`} rows={field.key === "statementOfFaith" ? 6 : field.key === "heroHeadline" ? 2 : 4}
            maxLength={siteLocalContentLimits[field.key]} disabled={busy || !data.canPublish}
            value={content[field.key] ?? ""} onChange={event => setContent(old =>
              ({ ...old, [field.key]: event.target.value }))}
            className="mt-3 w-full border border-border bg-background p-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        : <input id={`website-copy-${field.key}`} type="text" maxLength={siteLocalContentLimits[field.key]}
            disabled={busy || !data.canPublish} value={content[field.key] ?? ""} onChange={event => setContent(old =>
              ({ ...old, [field.key]: event.target.value }))}
            className="mt-3 min-h-11 w-full border border-border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />}
      {typeof starter === "string" && <p className="mt-2 text-xs text-muted-foreground">
        {changed ? "Personalized copy. Reset restores the original prepared wording for this field." :
          "Prepared starting copy. Edit anything, or keep it as written after review."}
      </p>}
    </div>;
  };

  return <section aria-label="Website content setup">
    {data.demonstration && !data.editingContent && <div role="note" className="mt-3 rounded-lg border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">Fictional sample prepared for this demo school</p>
      <p className="mt-1">We filled the draft with an example welcome, community story, vision and theme.
        This content has not been saved or published. Review and edit the story, then
        use the normal publishing action. The school publication and legal gates do not change.</p>
      <p className="mt-2">To change any suggested wording, go to School story and use the Reset to original action
        beside that individual field. No other answers are affected.</p>
    </div>}
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
    <MutationFeedback state={mutation} className="mt-3" pendingMessage="Saving website changes..."/>
    <div className="space-y-5">
      {step === 0 && <div className="space-y-5">
        <div className="border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Before you begin</p>
          <h3 className="mt-2 font-serif text-3xl">Your school's website, made personal.</h3>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">This guided design journey helps you choose a layout, colors, fonts and school imagery, then review the approved information CAN OS already has. Plan for approximately 15–25 minutes for initial design; this is an estimate, not a measured requirement.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground"><strong>Have ready:</strong> an existing public church or school website, social links if applicable, a logo, a rights-cleared photo folder and a short school welcome. All source links and imagery are optional.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground"><strong>Your outcome:</strong> a private, revisable website design draft. Publishing and hosting require separate authorization.</p>
        </div>
        <details className="border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">Use your existing church website or social profiles (optional)</summary>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">These are the existing private Site source-reference controls. Social posts and media are not imported. Optional church website suggestions require a separate, enabled and approved discovery process.</p>
          <div className="mt-3"><ChurchSourceReferenceEditor /></div>
        </details>
      </div>}
      {step === 1 && <div className="space-y-5">
        <WebsiteTemplateGallery schoolName={data.siteName}
          value={content.branding.templateId ?? "heritage"}
          onChange={(templateId: SiteTemplateId) => setContent(old => ({
            ...old, branding: { ...old.branding, templateId },
          }))}
          paletteId={content.branding.paletteId} typographyId={content.branding.typographyId}
          disabled={busy || !data.canPublish}/>
        <p className="text-xs text-muted-foreground">Changing a template preserves school data, approved content and your other design choices. Select Preview current changes on the final step to see the actual rendered layout.</p>
      </div>}

      {step === 3 && <div className="space-y-5">
        <div>
          <h3 className="font-serif text-2xl">Your school story is ready to make your own.</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            We've prepared thoughtful starting copy using your school name. You can keep it, personalize it,
            or reset an individual answer to its original wording. Your changes save only when you choose Save private draft or Publish.
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Prepared words are suggestions, not verified promises about programs, services, leaders or opening status.
            Please review them before publishing. Your actual academic and admissions information comes from CAN OS.
          </p>
        </div>
        {primaryFields.map(textField)}
        <details className="border p-4">
          <summary className="cursor-pointer text-sm font-semibold">Review source-attributed church story suggestions (optional)</summary>
          <div className="mt-4"><ChurchSourceSuggestionReview currentRevision={data.currentRevision}/></div>
        </details>
        <details className="border p-4">
          <summary className="cursor-pointer text-sm font-semibold">More optional church details</summary>
          <div className="mt-4 space-y-5">{additionalStoryFields.map(textField)}</div>
        </details>
      </div>}
      {step === 2 && <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">Choose a visual identity</h3>
        <p className="mt-1 text-sm text-muted-foreground">Select a ready-made theme. Artwork is optional and requires rights and privacy confirmation.</p>
      </div>
      <fieldset disabled={busy || !data.canPublish} className="space-y-4 border p-4">
        <legend className="px-2 text-sm font-semibold">Local branding and approved artwork</legend>
        <p className="text-xs leading-5 text-muted-foreground">
          Your layout comes from the selected template; color scheme and typography are separate.
          Existing legacy theme values are preserved for compatibility rather than shown as a second conflicting template selector.
        </p>
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
            <input type="text" maxLength={180} value={content.branding.heroImage.altText}
              onChange={event => setContent(old => ({ ...old, branding: { ...old.branding,
                heroImage: old.branding.heroImage ? { ...old.branding.heroImage, altText: event.target.value } : null,
              } }))} className="mt-2 w-full rounded-lg border bg-background p-2 text-sm" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={content.branding.heroImage.rightsConfirmed}
              onChange={event => setContent(old => ({ ...old, branding: { ...old.branding,
                heroImage: old.branding.heroImage ? { ...old.branding.heroImage, rightsConfirmed: event.target.checked } : null,
              } }))} className="mt-1" />
            <span>I own this image or have documented permission to publish it on this public website.</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Child privacy and consent</span>
            <select value={content.branding.heroImage.childImageConsent}
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
      <details className="border p-4">
        <summary className="cursor-pointer text-sm font-semibold">Import photos from a folder (optional)</summary>
        <div className="mt-4"><SchoolMediaFolderManager siteId={data.siteId} canPublish={data.canPublish}
          enabled={data.mediaUploadsEnabled}/></div>
      </details>
      </div>}
      {step === 4 && <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Review your website</h3>
          <p className="mt-1 text-sm text-muted-foreground">Preview your pages. Family information and institutional approvals are managed separately.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={previewPending} onClick={() => void previewCurrentDraft()}
            className="min-h-11 border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {previewPending ? "Generating secure preview..." : "Preview current changes"}
          </button>
          <p className="text-xs text-muted-foreground">Preview is private and read-only, and does not save or publish.</p>
        </div>
        {previewError&&<p role="alert" className="border border-destructive p-3 text-sm">{previewError}</p>}
        <WebsitePreviewPanel data={data} draftPreview={draftPreview?.source === content ? draftPreview.rendered : null} />
        <details className="border p-4">
          <summary className="cursor-pointer text-sm font-semibold">Review family information readiness</summary>
          <div className="mt-4"><WebsiteInformationChecklist data={data} /></div>
        </details>
        <details className="border p-4">
          <summary className="cursor-pointer text-sm font-semibold">Review website content quality</summary>
          <div className="mt-4"><WebsiteDesignChecklist data={data} /></div>
        </details>

        {!data.canPublish && <p role="status" className="border p-3 text-sm">
          You can preview this Site, but your verified Site assignment does not include local website publishing.
        </p>}
        <button type="button" disabled={busy || !data.canPublish} onClick={() => void submit()}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
          {busy ? "Publishing…" : "Publish church-owned content"}
        </button>
        <p className="text-xs text-muted-foreground">
          Revision {data.currentRevision}. Raw HTML, embeds, testimonials and social links are not supported.
          Only church-owned content is published here; CAN controls institutional information.
        </p>
        {data.localHistory.length > 0 && <details className="border p-4">
          <summary className="cursor-pointer text-sm font-semibold">Version history and rollback</summary>
          <ul className="mt-3 space-y-2">
            {data.localHistory.map(version => <li key={version.revision}
              className="flex flex-wrap items-center justify-between gap-3 border p-3 text-sm">
              <span>Revision {version.revision} · {version.status === "published" ? "Published" : version.status === "draft" ? "Private draft" : "Held for review"}
                {" · "}{new Date(version.createdAt).toLocaleString()}</span>
              {data.canPublish && version.status === "published" && version.revision < data.currentRevision &&
                <button type="button" disabled={busy} onClick={() => void restore(version.revision)}
                  className="rounded-lg border px-3 py-1 text-xs disabled:opacity-50">
                  Restore as new revision
                </button>}
            </li>)}
          </ul>
        </details>}
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <button type="button" disabled={step === 0}
          onClick={() => onStepChange(Math.max(0, step - 1))}
          className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
          Back
        </button>
        <button type="button" disabled={busy || !data.canPublish} onClick={()=>void saveDraft()}
          className="min-h-11 border border-primary px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50">
          {busy?"Saving...":"Save private draft"}
        </button>
        {step < 4 && <button type="button"
          onClick={() => onStepChange(Math.min(4, step + 1))}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background">
          Continue
        </button>}
      </div>
    </div>
  </section>;
}
