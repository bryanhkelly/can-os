import { siteFontCatalog, type SiteFontId, resolveSiteTheme, sitePaletteIds, siteTypographyIds, type SiteTypographyId, type SiteTemplateId } from "@/domain/site-theme";
import { WebsiteTemplateGallery } from "@/components/launch-studio/WebsiteTemplateGallery";
import { SchoolBrandPreview } from "@/components/launch-studio/SchoolBrandPreview";
import { privateWebsitePreviewUrl } from "@/domain/private-website-preview";
import { schoolBrandDesigns } from "@/domain/school-brand-identity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import { LaunchStudioShell } from "@/components/launch-studio/LaunchStudioShell";
import { Link } from "@tanstack/react-router";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { GuidedSetupShell } from "@/components/workflow";
import { Eye } from "lucide-react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { useLaunchUnsavedChanges } from "@/components/launch-studio/useLaunchUnsavedChanges";
import {
  prepareWebsiteEditorContent, restoreOriginalWebsiteField, websiteStarterFieldIds, siteLocalContentLimits, siteLocalImageMaxBytes,
  siteLocalImagePublicationGaps, type SiteLocalContent, type SiteLocalImageConsent, type SiteLocalTextField,
} from "@/domain/site-local-content";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { prepareSchoolWebsite, getPartnerWebsitePreviewView, previewChurchWebsiteDraft, saveChurchWebsiteDraft, publishChurchWebsiteContent, restoreChurchWebsiteContent } from "@/modules/sites/site-website-preview.functions";
import { ChurchSourceSuggestionReview } from "@/components/operations/ChurchSourceSuggestionReview";
import { ChurchSourceReferenceEditor } from "@/components/operations/ChurchSourceReferenceEditor";
import {SchoolMediaFolderManager} from "@/components/operations/SchoolMediaFolderManager";
import {LaunchWebsiteEditorHandoff} from "@/components/operations/LaunchWebsiteEditorHandoff";
import {siteProgramSelectionSchema} from "@/lib/route-search";
import { z } from "zod";

export const websiteStudioStepIds = ["welcome", "template", "identity", "photos", "content", "preview"] as const;
export const websiteSearchSchema=siteProgramSelectionSchema.extend({
  // Preserve supplied selectors for explicit validation; never silently omit
  // an invalid Site and open the editor under a different active membership.
  siteId:z.string().optional(),
  programId:z.string().optional(),
  returnGrantId:z.string().optional(),
  returnToHub:z.boolean().optional(),
  returnToSettings:z.boolean().optional(),
  step:z.enum(websiteStudioStepIds).optional(),
});

export const loadWebsiteHome = (siteId?: string) => {
  if (siteId && !z.string().uuid().safeParse(siteId).success)
    return Promise.resolve({ok:false as const,authError:null,
      message:"This website link contains an invalid school identifier. Select an authorized school from the Launch Hub.",
      retryable:false});
  return safeLoader(
    () => getPartnerWebsitePreviewView({data:{siteId}}),
    { authMessage: "This website requires a verified Site editor or unaffiliated Site Administrator." },
  )();
};

export const Route = createFileRoute("/site-website")({
  validateSearch:(search:Record<string,unknown>)=>websiteSearchSchema.parse(search),
  loaderDeps:({search})=>({siteId:search.siteId}),
  loader:({deps})=>loadWebsiteHome(deps.siteId),
  component: PartnerSiteWebsitePage,
});

function PartnerSiteWebsitePage() {
  const navigate=Route.useNavigate();
  return <WebsiteHome outcome={Route.useLoaderData()} selection={Route.useSearch()}
    onStepChange={step=>void navigate({search:previous=>({...previous,step:websiteStudioStepIds[step]})})}/>;
}
function WebsiteAddressPreparation({siteId,canPrepare}:{siteId:string;canPrepare:boolean}) {
  const router=useRouter();
  const mutation=useMutationFeedback(()=>router.invalidate());
  return <section className="border bg-card p-5"><p className="text-sm">Prepare a private website address to begin designing. This does not publish your school or create a Program.</p>
    {canPrepare && <Button className="mt-4" disabled={mutation.pending||mutation.refreshFailed} onClick={()=>void mutation.run(()=>prepareSchoolWebsite({data:{siteId}}),{successMessage:"Private website address prepared.",commandErrorMessage:"Unable to prepare the website address."})}>Prepare school website</Button>}
    {!canPrepare && <p className="mt-3 text-sm">Your Site Administrator or publication manager must prepare the website address.</p>}
    <MutationFeedback state={mutation} pendingMessage="Preparing website…"/>
  </section>;
}

export function WebsiteHome({ outcome, selection, studio = false, onStepChange }: {
  outcome: Awaited<ReturnType<typeof loadWebsiteHome>>;
  selection: { siteId?:string; programId?:string; returnGrantId?:string; returnToHub?:boolean; returnToSettings?:boolean; step?:typeof websiteStudioStepIds[number] };
  studio?: boolean;
  onStepChange?: (step:number)=>void;
}) {
  const [localStep,setLocalStep]=useState(0);
  const requestedStep=websiteStudioStepIds.indexOf(selection.step??"welcome");
  // Re-entry skips the optional orientation, but the first Site visit without an
  // address always stays in a single preparation stage until it is reserved.
  const step=selection.step ? Math.max(0,requestedStep)
    : studio && (selection.returnToHub || selection.returnToSettings) ? 1 : localStep;
  const changeStep=onStepChange??setLocalStep;
  const returnToLaunch=selection.returnToSettings && selection.siteId
    ? <Link to="/settings" search={{siteId:selection.siteId}} className="font-semibold text-primary">Back to Settings</Link>
    : selection.returnToHub && selection.siteId
    ? <Link to="/launch/hub/school" search={{siteId:selection.siteId}} className="font-semibold text-primary">Back to Launch Hub</Link>
    : selection.siteId&&selection.programId&&selection.returnGrantId
    ?<LaunchWebsiteEditorHandoff siteId={selection.siteId} programId={selection.programId} returnGrantId={selection.returnGrantId} destination="launch"/>:null;
  if (!outcome.ok) return <>{returnToLaunch}<LoaderFailure eyebrow="Partner website"
    title="Your Site website" outcome={outcome} /></>;

  const data = outcome.data;
  const steps = [
    {id:"welcome",title:"Welcome"}, {id:"template",title:"Choose your design"},
    {id:"identity",title:"Your school brand"}, {id:"photos",title:"School photography"},
    {id:"content",title:"School story"}, {id:"preview",title:"Review & publish"},
  ];
  if (studio) return <LaunchStudioShell role="Website & Brand Studio" subject={data.siteName}
    title={data.host ? ["Create a recognizable school identity.","Choose your school design.","Make the brand your own.",
      "Bring your school to life.","Tell your school story.","Review your brand and website."][step] : "Prepare your private website address."}
    description={data.host ? "One school brand, one hosted website. Draft branding does not authorize school opening, academic claims or admissions." :
      "Create a private address before choosing a design. Nothing is published yet."}
    steps={data.host ? steps : [{id:"address",title:"Prepare private address",disabled:true}]}
    currentId={data.host ? websiteStudioStepIds[step]??"welcome" : "address"}
    onStepChange={id=>{if(data.host)changeStep(websiteStudioStepIds.indexOf(id as typeof websiteStudioStepIds[number]));}}
    help={<p>Unaffiliated Site Administrators manage their school website directly. Contributors need a verified Site website editor invitation. Previewing and saving a draft do not publish it.</p>}
    status={data.host ? <div className="space-y-2">
      <p className="font-semibold">School website address</p>
      <p className="break-all font-mono text-xs">{data.host}</p>
      <p>{data.status==="published" ? "Published in CAN OS. External host reachability is verified separately." : "Private draft address. Content is not published."}</p>
      <p>Saved revision: {data.currentRevision}</p>
    </div> : <p>No website address is reserved yet. Prepare an address to start the design workflow.</p>}
    exit={returnToLaunch ?? <Link to="/home" className="underline">Exit to your workspace</Link>}>
    {data.host
      ? <LocalWebsiteCopyEditor data={data} step={step} onStepChange={changeStep}/>
      : <WebsiteAddressPreparation siteId={data.siteId} canPrepare={data.canPrepareWebsite}/> }
  </LaunchStudioShell>;
  return <WorkspaceShell
    eyebrow="Website & Brand Studio"
    title={data.siteName + " · website & brand"}
    subtitle={data.organizationName + " · one local identity for your hosted website and reusable school materials"} actions={returnToLaunch}>
    <GuidedSetupShell
      title="Build your school website and brand together"
      description="Choose one of seven designs, personalize its identity, add the school's story and approved photos, then save a draft or publish when authorized."
      steps={data.host ? steps.map((item,index)=>({
        id:item.id,title:item.title,description:index===0?"Bring current sources":index===1?"Choose a design":
          index===2?"Customize and preview your school brand":index===3?"School content and media":"Review before publishing",
        status:step===index?"current":step>index?"complete":"upcoming",
      })) : [
        { id: "address", title: "Site address", description: "Prepare a private website address", status: "current" },
      ]}
      aside={<div className="space-y-3 py-1 text-sm">
        <p className="font-semibold">Site address</p>
        {data.host ? <>
          <p className="break-all font-mono text-xs">{data.host}</p>
          <p className="text-muted-foreground">
            {data.status === "published" ? "Published" : "Private draft"}. {data.canPrepareWebsite ? "Publish reviewed Site-owned content from this workspace." : "The Site address follows its existing approval workflow."}
          </p>
        </> : <p role="status" className="text-muted-foreground">
          No address is reserved yet.
        </p>}
        <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">
          You can publish church-owned content. CAN retains control of academic claims,
          admissions and institutional information.
        </p>
      </div>}>
      {data.host
        ? <LocalWebsiteCopyEditor data={data} step={step} onStepChange={changeStep} />
        : <WebsiteAddressPreparation siteId={data.siteId} canPrepare={data.canPrepareWebsite}/>}
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
  const saved = data.currentRevision > 0;
  const htmlPages = draftPreview ? draftPreview.previewPages : saved ? data.previewPages : {};
  const pages = Object.entries(htmlPages);
  // Never show another page's or an older revision's HTML for a missing page.
  const activeHtml = Object.hasOwn(htmlPages, selected) ? htmlPages[selected] : null;
  return <section aria-labelledby="partner-preview-title" className="mt-6 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
    <h2 id="partner-preview-title" className="flex items-center gap-2 font-serif text-2xl font-semibold"><Eye className="size-5 text-primary" /> {draftPreview ? "Preview of current changes · not saved" : !saved ? "No saved website design yet" : data.localContentStatus === "published" ? "Latest saved and published website" : "Latest saved private design · revision " + data.currentRevision}</h2>
    <p className="mt-2 text-sm text-muted-foreground">This read-only preview uses the same design as the hosted site. It does not submit forms or publish changes.</p>
    {pages.length > 0 && <div role="group" aria-label="Preview a website page" className="mt-4 flex flex-wrap gap-2">
      {pages.map(([path]) => <Button variant="outline" key={path} type="button" aria-pressed={selected === path}
        onClick={() => setSelected(path)} className="rounded-lg border px-3 py-2 text-sm aria-pressed:bg-primary aria-pressed:text-primary-foreground">
        {path === "/" ? "Home" : path.slice(1).replace(/-/g, " ")}
      </Button>)}
    </div>}
    <div role="group" aria-label="Preview width" className="mt-4 flex flex-wrap gap-2">
      <Button variant="outline" type="button" aria-pressed={device==="desktop"} onClick={()=>setDevice("desktop")}
        className="border px-3 py-2 text-xs font-semibold aria-pressed:border-primary aria-pressed:text-primary">Desktop</Button>
      <Button variant="outline" type="button" aria-pressed={device==="mobile"} onClick={()=>setDevice("mobile")}
        className="border px-3 py-2 text-xs font-semibold aria-pressed:border-primary aria-pressed:text-primary">Mobile</Button>
    </div>
    {activeHtml ? <iframe key={selected+"-"+device} title={`${data.siteName} ${selected} read-only website preview`}
      srcDoc={activeHtml} sandbox="" referrerPolicy="no-referrer" loading="lazy"
      className="mt-4 h-[700px] w-full border bg-white" style={{ maxWidth: device === "mobile" ? 390 : undefined }} />
      : <p role="status" className="mt-4 border p-4 text-sm">{pages.length
        ? "This page is not available in the selected preview. Choose an available page or generate an updated preview."
        : !saved ? "No website draft has been saved. Choose Preview unsaved changes to see your current design, or save a private draft to enable the full-page link." : "No preview pages are available for this school website. Check the reserved address and Site information."}</p>}
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
  const [editor, setEditor] = useState(() => {
    const initial = prepareWebsiteEditorContent(data.editingContent, data.siteName);
    return { content: initial, saved: initial, revision: data.currentRevision, siteId: data.siteId };
  });
  const content = editor.content;
  const setContent: Dispatch<SetStateAction<SiteLocalContent>> = update =>
    setEditor(previous => ({ ...previous, content: typeof update === "function"
      ? update(previous.content) : update }));
  const dirty = JSON.stringify(content) !== JSON.stringify(editor.saved);
  const revisionConflict = editor.siteId === data.siteId && editor.revision !== data.currentRevision;
  useLaunchUnsavedChanges(dirty);
  const [preparingArtwork, setPreparingArtwork] = useState(false);
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed || preparingArtwork;
  const [error, setError] = useState("");
  const [draftPreview, setDraftPreview] = useState<{source: SiteLocalContent; rendered: Awaited<ReturnType<typeof previewChurchWebsiteDraft>>} | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  useEffect(() => {
    setDraftPreview(null);
    setEditor(previous => {
      if (previous.siteId === data.siteId && previous.revision === data.currentRevision) return previous;
      // A loader refresh (including media changes) must never overwrite authored copy.
      if (previous.siteId === data.siteId &&
          JSON.stringify(previous.content) !== JSON.stringify(previous.saved)) return previous;
      const latest = prepareWebsiteEditorContent(data.editingContent, data.siteName);
      return { content: latest, saved: latest, revision: data.currentRevision, siteId: data.siteId };
    });
  }, [data.siteId, data.currentRevision, data.editingContent, data.siteName]);

  function loadLatestRevision() {
    if (dirty && !window.confirm("Discard your unsaved website changes and load the latest saved revision?")) return;
    const latest = prepareWebsiteEditorContent(data.editingContent, data.siteName);
    setEditor({ content: latest, saved: latest, revision: data.currentRevision, siteId: data.siteId });
    setDraftPreview(null);
    setError("");
  }

  function markSaved(submitted: SiteLocalContent, revision: number) {
    setEditor(previous => ({ ...previous, content: submitted, saved: submitted, revision }));
    setDraftPreview(null);
    setShareMessage("");
  }

  async function saveDraft() {
    if (busy || !data.canPublish || revisionConflict) return;
    setError("");
    const submitted = content;
    const outcome = await mutation.run(() => saveChurchWebsiteDraft({
      data: { content: submitted, siteId: data.siteId, expectedRevision: editor.revision },
    }), { successMessage: "Private website draft saved. The public site and approval statuses have not changed.",
      commandErrorMessage: "Could not save the private website draft." });
    if (outcome.status === "saved" || outcome.status === "refresh-failed")
      markSaved(submitted, outcome.value.revision);
    else if (outcome.status === "failed" &&
      /website content was updated/i.test(mutationErrorMessage(outcome.error, ""))) {
      // Surface the current revision without discarding what this editor typed.
      await router.invalidate().catch(() => undefined);
    }
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
    if (revisionConflict) return;
    const submitted = content;
    const outcome = await mutation.run(() => publishChurchWebsiteContent({
        data: { content: submitted, expectedRevision: editor.revision,siteId:data.siteId },
      }), { successMessage: result => result.status === "review_required"
        ? "Protected institutional language was held for CAN review. Previously published church content remains unchanged."
        : "Church content published. If this Site is publicly active, the new copy is available without separate CAN editorial approval.",
      commandErrorMessage: "Could not save church content." });
    if (outcome.status === "saved" || outcome.status === "refresh-failed")
      markSaved(submitted, outcome.value.revision);
    else if (outcome.status === "failed" &&
      /website content was updated/i.test(mutationErrorMessage(outcome.error, ""))) {
      // Surface the current revision without discarding what this editor typed.
      await router.invalidate().catch(() => undefined);
    }
  }

  async function restore(revision: number) {
    if (busy || revisionConflict) return;
    if (dirty && !window.confirm("Restoring an older revision will discard unsaved changes. Continue?")) return;
    setError("");
    await mutation.run(() => restoreChurchWebsiteContent({
        data: { expectedRevision: editor.revision, restoreRevision: revision,siteId:data.siteId },
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

  // Stable, numbered sequence in the editor and preview. Templates decide
  // presentation, but the administrator never orders or drags sections.
  const primaryFields = websiteStarterFieldIds.map(key =>
    churchFields.find(field => field.key === key)!);
  const additionalStoryFields = churchFields.filter(field =>
    ["churchHistory", "leadershipWelcome", "localTraditions", "denomination", "statementOfFaith", "spiritualFormation"].includes(field.key));
  const textField = (field: typeof churchFields[number]) => {
    const starter = content.editorialBaseline?.fields[field.key as typeof websiteStarterFieldIds[number]];
    const changed = typeof starter === "string" && (content[field.key] ?? "") !== starter;
    const sequence = websiteStarterFieldIds.indexOf(field.key as typeof websiteStarterFieldIds[number]);
    return <div key={field.key} className="border-b border-border pb-5 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Label className="min-w-0 flex-1 text-sm" htmlFor={`website-copy-${field.key}`}>
          <span className="flex items-center gap-3 font-semibold">
            {sequence >= 0 && <span aria-hidden="true" className="font-mono text-xs font-normal text-muted-foreground">
              {String(sequence + 1).padStart(2, "0")}
            </span>}
            {field.label}
          </span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{field.help}</span>
        </Label>
        {typeof starter === "string" && <Button variant="outline" type="button"
          aria-label={`Reset ${field.label} to original suggested copy`}
          disabled={!changed || busy || !data.canPublish}
          onClick={() => setContent(old => restoreOriginalWebsiteField(old, field.key))}
          className="min-h-11 shrink-0 border border-border px-3 py-2 text-xs font-semibold text-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
          Reset to original
        </Button>}
      </div>
      {field.multi
        ? <Textarea id={`website-copy-${field.key}`} rows={field.key === "statementOfFaith" ? 6 : field.key === "heroHeadline" ? 2 : 4}
            maxLength={siteLocalContentLimits[field.key]} disabled={busy || !data.canPublish}
            value={content[field.key] ?? ""} onChange={event => setContent(old =>
              ({ ...old, [field.key]: event.target.value }))}
            className="mt-3 w-full border border-border bg-background p-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        : <Input id={`website-copy-${field.key}`} type="text" maxLength={siteLocalContentLimits[field.key]}
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
    {revisionConflict && <div role="alert" className="mt-3 space-y-2 border border-amber-500 p-4 text-sm">
      <p className="font-semibold">A newer website revision ({data.currentRevision}) is available.</p>
      <p>Your unsaved edits remain here. Saving is paused to prevent overwriting someone else's revision.
        You can review or copy your current wording, then load the latest saved version.</p>
      <Button variant="outline" type="button" onClick={loadLatestRevision}
        className="min-h-11 border px-3 py-2 font-semibold">Discard my edits and load latest</Button>
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
    {data.approvedPhotoCount === 0 && !content.branding.heroImage && <p role="status" className="mt-3 border p-3 text-sm">No school photography is selected. Add approved photos in Photos &amp; artwork. No generated replacement artwork will appear.</p>}
    {siteLocalImagePublicationGaps(content.branding.heroImage).length > 0 &&
      <div role="status" className="mt-3 border p-3 text-sm">
        <p className="font-semibold">Artwork is incomplete. You can save a private draft now.</p>
        <p className="mt-1">This artwork stays private and will not appear in a preview or published page until these items are complete:</p>
        <ul className="mt-2 list-disc pl-5">{siteLocalImagePublicationGaps(content.branding.heroImage).map(gap =>
          <li key={gap}>{gap}</li>)}</ul>
      </div>}
    {error && <p role="alert" className="mt-3 rounded-lg border p-3 text-sm">{error}</p>}
    <MutationFeedback state={mutation} className="mt-3" pendingMessage="Saving website changes..."/>
    <div className="space-y-5">
      {step === 0 && <div className="space-y-5">
        <div className="border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Before you begin</p>
          <h3 className="mt-2 font-serif text-3xl">Your school's website, made personal.</h3>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Choose one of seven distinct designs, customize the school wordmark, colors and fonts, then build a website using approved information CAN OS already has.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground"><strong>Have ready:</strong> an existing public church or school website, social links if applicable, a logo, a rights-cleared photo folder and a short school welcome. All source links and imagery are optional.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground"><strong>Your outcome:</strong> a private, revisable school brand and website draft, with a downloadable wordmark. Publishing and hosting require separate authorization.</p>
        </div>
        {data.siteInformation && (data.siteInformation.contexts.length > 0 || data.siteInformation.hostChurchName || data.siteInformation.currentWebsiteUrl) && <section className="border bg-card p-5">
          <h3 className="font-semibold">Saved Site Information</h3>
          {data.siteInformation.contexts.length > 0 && <p className="mt-2 text-sm">{data.siteInformation.contexts.map(context=>context.replaceAll("_"," ")).join(" · ")}</p>}
          {data.siteInformation.hostChurchName && <p className="mt-1 text-sm">Host church or community: {data.siteInformation.hostChurchName}</p>}
          {data.siteInformation.currentWebsiteUrl && <a className="mt-2 inline-block text-sm font-semibold text-primary underline" href={data.siteInformation.currentWebsiteUrl} target="_blank" rel="noopener noreferrer">Open current website reference</a>}
          <p className="mt-2 text-xs text-muted-foreground">These private setup details do not verify school facts or publish content.</p>
        </section>}
        <details className="border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">Use your existing church website or social profiles (optional)</summary>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">These are the existing private Site source-reference controls. Social posts and media are not imported. Optional church website suggestions require a separate, enabled and approved discovery process.</p>
          <div className="mt-3"><ChurchSourceReferenceEditor suggestedSchoolWebsiteUrl={data.siteInformation?.currentWebsiteUrl}/></div>
        </details>
      </div>}
      {step === 1 && <div className="space-y-5">
        <WebsiteTemplateGallery schoolName={data.siteName}
          value={content.branding.templateId ?? "heritage"}
          onChange={(templateId: SiteTemplateId) => setContent(old => ({
            ...old, branding: { ...old.branding, templateId },
          }))}
          paletteId={content.branding.paletteId} typographyId={content.branding.typographyId}
          headingFontId={content.branding.headingFontId} bodyFontId={content.branding.bodyFontId}
          disabled={busy || !data.canPublish}/>
        <p className="text-xs text-muted-foreground">Your design and brand are saved together. Switching designs keeps school copy, photos, colors and fonts until you explicitly apply that design's recommended branding.</p>
      </div>}

      {step === 4 && <div className="space-y-5">
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
        <h3 className="text-lg font-semibold">Make your school brand your own</h3>
        <p className="mt-1 text-sm text-muted-foreground">Your school name and selected design produce a unique wordmark. Customize the safe palette and fonts below; see the result live before saving.</p>
      </div>
      <fieldset disabled={busy || !data.canPublish} className="space-y-4 border p-4">
        <legend className="px-2 text-sm font-semibold">Local branding and approved artwork</legend>
        <p className="text-xs leading-5 text-muted-foreground">
          Your chosen website design provides the visual structure. These colors and fonts become the same versioned school identity used by the site and downloadable wordmark.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <div>
            <p className="font-medium">Recommended brand for {schoolBrandDesigns[content.branding.templateId ?? "heritage"].name}</p>
            <p className="mt-1 text-xs text-muted-foreground">Apply the matching starter palette and typography without changing your school's name, copy or photos.</p>
          </div>
          <Button variant="outline" type="button" className="min-h-11 border" onClick={() => setContent(old => {
            const design = schoolBrandDesigns[old.branding.templateId ?? "heritage"];
            return { ...old, branding: { ...old.branding,
              paletteId: design.recommendedPalette, typographyId: design.recommendedTypography,
              headingFontId: undefined, bodyFontId: undefined,
            } };
          })}>Apply recommended brand</Button>
        </div>
        <div className="rounded-xl border p-4">
          <p className="font-medium">Choose your school's visual identity</p>
          <p className="mt-1 text-xs text-muted-foreground">CAN Signature gives you a complete editorial design.
            Inspired by your church uses approved palette and typography choices; automatic source discovery
            is not available until the separate church-reference integration is connected.</p>
          <div role="group" aria-label="School color palettes" className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            {sitePaletteIds.filter(id => !id.startsWith("brand-") ||
              id === schoolBrandDesigns[content.branding.templateId ?? "heritage"].recommendedPalette ||
              id === content.branding.paletteId).map(id => {
              const palette = resolveSiteTheme(id,content.branding.typographyId);
              return <Button variant="outline" type="button" key={id} aria-pressed={(content.branding.paletteId ?? "signature")===id}
                onClick={()=>setContent(old=>({...old,branding:{...old.branding,paletteId:id}}))}
                className="min-h-14 w-full flex-col items-stretch justify-start gap-0 whitespace-normal border p-3 text-left text-sm capitalize aria-pressed:ring-2 aria-pressed:ring-primary">
                <span aria-hidden="true" className="mb-2 flex h-5 overflow-hidden rounded">
                  <span className="flex-1" style={{backgroundColor:palette.ink}}/>
                  <span className="flex-1" style={{backgroundColor:palette.secondary}}/>
                  <span className="flex-1" style={{backgroundColor:palette.accent}}/>
                  <span className="flex-1" style={{backgroundColor:palette.canvas}}/>
                </span>{id === "signature" ? "CAN Signature" :
                  id.startsWith("brand-") ? `${schoolBrandDesigns[id.slice(6) as SiteTemplateId]?.name ?? "School"} palette` : id}
              </Button>;
            })}
          </div>
          <Label className="mt-4 block text-sm">
            <span className="font-medium">Approved typography pairing</span>
            <Select value={content.branding.typographyId ?? "editorial"}
              onChange={event=>setContent(old=>({...old,branding:{...old.branding,
                typographyId:event.target.value as SiteTypographyId, headingFontId:undefined, bodyFontId:undefined}}))}
              className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3">
              {siteTypographyIds.map(id=><option key={id} value={id}>
                {id === "editorial" ? "Editorial serif + modern sans" :
                  id === "traditional" ? "Heritage serif + clean sans" : "Contemporary humanist sans"}
              </option>)}
            </Select>
          </Label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(["headingFontId", "bodyFontId"] as const).map(key => <Label key={key} className="block text-sm">
              {key === "headingFontId" ? "Heading font" : "Body font"}
              <Select className="mt-2 min-h-11 w-full rounded border bg-background px-3" value={content.branding[key] ?? ""}
                onChange={event => setContent(old => ({...old, branding:{...old.branding, [key]:event.target.value ? event.target.value as SiteFontId : undefined}}))}>
                <option value="">Use recommended pairing</option>
                {Object.entries(siteFontCatalog).map(([id,font]) => <option key={id} value={id}>{font.label}</option>)}
              </Select>
            </Label>)}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">All choices use a maintained, contrast-checked palette
            and safe system fonts. Church website colors and fonts, when discovered, are suggestions only;
            no logo, third-party font, photograph or CSS is copied automatically.</p>
        </div>
      </fieldset>
      <SchoolBrandPreview schoolName={data.siteName} branding={content.branding}/>
      </div>}
      {step === 3 && <div className="space-y-5">
      <h3 className="font-serif text-2xl">Photos &amp; artwork</h3>
      <p className="text-sm">Gallery images are fictional template samples. They are not photos of your school and are never added to your school media library.</p>
      <fieldset disabled={busy || !data.canPublish} className="space-y-4 border p-4">
        <legend className="px-2 text-sm">Your school-owned artwork</legend>
        <Label className="block text-sm">
          <span className="font-medium">Church or community artwork (optional)</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            PNG or JPEG, re-encoded locally to a metadata-free PNG. No remote URLs, embeds or tracking.
          </span>
          <Input type="file" accept="image/png,image/jpeg" onChange={event => void selectArtwork(event)}
            className="mt-2 block w-full text-sm" />
        </Label>
        {content.branding.heroImage && <div className="space-y-3 rounded-lg bg-muted/40 p-3">
          <img src={content.branding.heroImage.dataUrl} alt="Selected artwork preview"
            className="max-h-52 w-full rounded-lg object-cover" />
          <Label className="block text-sm">
            <span className="font-medium">Artwork description for screen readers</span>
            <Input type="text" maxLength={180} value={content.branding.heroImage.altText}
              onChange={event => setContent(old => ({ ...old, branding: { ...old.branding,
                heroImage: old.branding.heroImage ? { ...old.branding.heroImage, altText: event.target.value } : null,
              } }))} className="mt-2 w-full rounded-lg border bg-background p-2 text-sm" />
          </Label>
          <Label className="flex items-start gap-2 text-sm">
            <Checkbox checked={content.branding.heroImage.rightsConfirmed}
              onChange={event => setContent(old => ({ ...old, branding: { ...old.branding,
                heroImage: old.branding.heroImage ? { ...old.branding.heroImage, rightsConfirmed: event.target.checked } : null,
              } }))} className="mt-1" />
            <span>I own this image or have documented permission to publish it on this public website.</span>
          </Label>
          <Label className="block text-sm">
            <span className="font-medium">Child privacy and consent</span>
            <Select value={content.branding.heroImage.childImageConsent}
              onChange={event => setContent(old => ({ ...old, branding: { ...old.branding,
                heroImage: old.branding.heroImage ? { ...old.branding.heroImage,
                  childImageConsent: event.target.value as SiteLocalImageConsent } : null,
              } }))} className="mt-2 w-full rounded-lg border bg-background p-2 text-sm">
              <option value="unconfirmed">Choose a confirmation</option>
              <option value="no_identifiable_children">No identifiable children appear</option>
              <option value="guardian_consent_confirmed">Documented guardian consent covers every identifiable child</option>
            </Select>
          </Label>
          <Button variant="outline" type="button" onClick={() => setContent(old => ({
            ...old, branding: { ...old.branding, heroImage: null },
          }))} className="rounded-lg border px-3 py-1 text-xs">Remove artwork</Button>
        </div>}
      </fieldset>
      <details className="border p-4">
        <summary className="cursor-pointer text-sm font-semibold">Import photos from a folder (optional)</summary>
        <div className="mt-4"><SchoolMediaFolderManager siteId={data.siteId} canPublish={data.canPublish}
          enabled={data.mediaUploadsEnabled}/></div>
      </details>
      </div>}
      {step === 5 && <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Review your website</h3>
          <p className="mt-1 text-sm text-muted-foreground">Preview your pages. Family information and institutional approvals are managed separately.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={previewPending} onClick={() => void previewCurrentDraft()}
            className="min-h-11 border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {previewPending ? "Generating secure preview..." : "Preview unsaved changes"}
          </Button>
          {data.currentRevision > 0 && <a
            href={privateWebsitePreviewUrl(data.siteId)}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center border border-primary px-4 py-2 text-sm font-semibold text-primary">
            Open full-page preview
          </a>}
          {data.currentRevision > 0 && <Button type="button" variant="outline" className="min-h-11 border"
            onClick={() => void navigator.clipboard.writeText(
              new URL(privateWebsitePreviewUrl(data.siteId), window.location.origin).href,
            ).then(() => setShareMessage("Preview link copied. Reviewers must sign in with their own authorized school account."))
              .catch(() => setShareMessage("Copy the address from Open full-page preview; clipboard permission was unavailable."))}>
            Copy preview link
          </Button>}
        </div>
        <p className="text-xs text-muted-foreground">The full-page link uses your latest saved private revision and your existing CAN OS sign-in. No draft is made public. {dirty ? "You have unsaved edits; save them before sharing the latest design." : ""}</p>
        {data.currentRevision === 0 && <p className="border p-3 text-sm" role="status">Save the private website draft to enable the full-page preview. You can test unsaved changes below without saving.</p>}
        {shareMessage && <p role="status" className="border p-3 text-sm">{shareMessage}</p>
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
        <Button type="button" disabled={busy || !data.canPublish || revisionConflict} onClick={() => void submit()}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
          {busy ? "Publishing…" : "Publish church-owned content"}
        </Button>
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
                <Button variant="outline" type="button" disabled={busy || revisionConflict} onClick={() => void restore(version.revision)}
                  className="rounded-lg border px-3 py-1 text-xs disabled:opacity-50">
                  Restore as new revision
                </Button>}
            </li>)}
          </ul>
        </details>}
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button variant="outline" type="button" disabled={step === 0}
          onClick={() => onStepChange(Math.max(0, step - 1))}
          className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
          Back
        </Button>
        <Button variant="outline" type="button" disabled={busy || !data.canPublish || revisionConflict} onClick={()=>void saveDraft()}
          className="min-h-11 border border-primary px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50">
          {busy?"Saving...":"Save private draft"}
        </Button>
        {step < 5 && <Button type="button"
          onClick={() => onStepChange(Math.min(5, step + 1))}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background">
          Continue
        </Button>}
      </div>
    </div>
  </section>;
}
