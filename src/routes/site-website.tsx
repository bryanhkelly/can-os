import { saveSiteBrandVersion } from "@/modules/sites/site-brand.functions";
import { type SiteBrandConfiguration } from "@/domain/site-brand";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { prepareWebsiteCopyFromSiteInformation } from "@/domain/site-website-story-suggestions";
import { WebsiteCopyField } from "@/components/launch-studio/WebsiteCopyField";
import { WebsiteVisualIdentityStep } from "@/components/launch-studio/WebsiteVisualIdentityStep";
import { LaunchPreviewSharing } from "@/components/launch-studio/LaunchPreviewSharing";
import { siteBrandDirections, brandRecommendedLayout } from "@/domain/site-brand-direction";
import { type SiteTemplateId } from "@/domain/site-theme";
import { WebsiteTemplateGallery } from "@/components/launch-studio/WebsiteTemplateGallery";
import { SiteContentChannelEditor } from "@/components/launch-studio/SiteContentChannelEditor";
import { WebsiteInformationChecklist, WebsiteSourceMappingPanel, WebsiteDesignChecklist } from "@/components/sites/WebsiteReadinessPanels";
import { WebsitePreviewPanel } from "@/components/sites/WebsitePreviewPanel";
import { privateWebsitePreviewUrl } from "@/domain/private-website-preview";
import { schoolBrandDesigns } from "@/domain/school-brand-identity";
import { Button } from "@/components/ui/button";
import { LaunchSiteFrame } from "@/components/launch-studio/LaunchSiteFrameV61";
import { Link } from "@tanstack/react-router";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { normalizeClientError } from "@/lib/client-error";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { WorkspaceNotice, WorkspacePanel, ActionDialog, ActionFooter, PageHeader, PageFrame } from "@/components/workspace";
import { GuidedSetupShell } from "@/components/workflow";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { useLaunchUnsavedChanges } from "@/components/launch-studio/useLaunchUnsavedChanges";
import {
  prepareWebsiteEditorContent, restoreOriginalWebsiteField, websiteStarterFieldIds, siteLocalImageMaxBytes,
  siteLocalImagePublicationGaps, type SiteLocalContent, type SiteLocalTextField,
} from "@/domain/site-local-content";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { prepareSchoolWebsite, getPartnerWebsitePreviewView, previewChurchWebsiteDraft, saveChurchWebsiteDraft, publishChurchWebsiteContent, restoreChurchWebsiteContent } from "@/modules/sites/site-website-preview.functions";
import { ChurchSourceSuggestionReview } from "@/components/operations/ChurchSourceSuggestionReview";
import {LaunchWebsiteEditorHandoff} from "@/components/operations/LaunchWebsiteEditorHandoff";
import {siteProgramSelectionSchema} from "@/lib/route-search";
import { z } from "zod";

export const websiteStudioStepIds = ["brand", "wireframe", "visual", "content", "review"] as const;
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
      message:"This website link contains an invalid Site identifier. Select an authorized Site from Launch Studio.",
      retryable:false});
  return safeLoader(
    () => getPartnerWebsitePreviewView({data:{siteId}}),
    { authMessage: "This website requires an authorized Site editor or Site Administrator." },
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
  return <section className="border bg-card p-5"><p className="text-sm">Prepare a private website address to begin designing. This does not publish your Site or create a Program.</p>
    {canPrepare && <Button className="mt-4" disabled={mutation.pending||mutation.refreshFailed} onClick={()=>void mutation.run(()=>prepareSchoolWebsite({data:{siteId}}),{successMessage:"Private website address prepared.",commandErrorMessage:"Unable to prepare the website address."})}>Prepare Site website</Button>}
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
  const requestedStep=websiteStudioStepIds.indexOf(selection.step??"brand");
  const step=selection.step ? Math.max(0,requestedStep) : localStep;
  const changeStep=onStepChange??setLocalStep;
  const returnToLaunch=selection.returnToSettings && selection.siteId
    ? <Link to="/settings" search={{siteId:selection.siteId}} className="font-semibold text-primary">Back to Settings</Link>
    : selection.returnToHub && selection.siteId
    ? <Link to="/launch/site" search={{siteId:selection.siteId}} className="font-semibold text-primary">Back to Launch Studio</Link>
    : selection.siteId&&selection.programId&&selection.returnGrantId
    ?<LaunchWebsiteEditorHandoff siteId={selection.siteId} programId={selection.programId} returnGrantId={selection.returnGrantId} destination="launch"/>:null;
  if (!outcome.ok) return <>{returnToLaunch}<LoaderFailure eyebrow="Partner website"
    title="Your Site website" outcome={outcome} /></>;

  const data = outcome.data;
  const steps = [
    {id:"brand",title:"Brand Identity"}, {id:"wireframe",title:"Choose Wireframe"},
    {id:"visual",title:"Visual Identity"}, {id:"content",title:"Your Content"},
    {id:"review",title:"Review & Finish"},
  ];
  if (studio) return <LaunchSiteFrame
    site={{id:data.siteId,name:data.siteName}} active="website-brand"
    previewHref={privateWebsitePreviewUrl(data.siteId)}>
    <PageFrame width="wide" className="launch-studio-page">
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0">
          <PageHeader eyebrow="Establish / Website & Brand"
            title={data.host?["Choose your Brand Identity","Choose your Wireframe","Design your Visual Identity",
              "Tell Your Story","Review & Finish"][step]:"Prepare your private website address"}
            subtitle="One Site-owned, revisioned private website. Draft changes never open enrollment, approve a Site or publish content." />
          {data.host && <nav aria-label="Website & Brand steps" className="mt-5 flex min-w-0 gap-2 overflow-x-auto border-y py-3">
            {steps.map((item,index)=><Button key={item.id} type="button"
              variant={step===index?"default":"outline"}
              aria-current={step===index?"step":undefined}
              onClick={()=>changeStep(index)}
              className="h-auto min-h-12 min-w-28 shrink-0 flex-col items-start border px-3 py-2 text-left text-xs">
              <span className="text-2xs opacity-80">Step {index+1}</span>
              <span>{item.title}</span>
            </Button>)}
          </nav>}
          <div className="mt-5">
            {data.host
              ? <LocalWebsiteCopyEditor data={data} step={step} onStepChange={changeStep} allowPublication={!studio}/>
              : <WebsiteAddressPreparation siteId={data.siteId} canPrepare={data.canPrepareWebsite}/>}
          </div>
          <div className="mt-5 border-t pt-4 text-sm">{returnToLaunch??<Link to="/home" className="font-semibold text-primary">Exit to workspace</Link>}</div>
        </div>
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-6 xl:self-start" aria-label="Website and Brand guidance">
          <section className="bg-foreground p-5 text-background">
            <h2 className="font-serif text-xl font-semibold">What you can do</h2>
            <p className="mt-3 text-sm leading-6">Choose your identity, explore seven website structures,
              apply approved colors and fonts, add rights-cleared media, and edit your story.</p>
            <p className="mt-3 text-xs leading-5">Your Site's tools, approved catalog and learning experiences
              can later appear on the website through the existing content channels.</p>
          </section>
          <section className="border bg-card p-5">
            <h2 className="text-sm font-semibold">Your private website</h2>
            {data.host?<><p className="mt-2 break-all font-mono text-xs">{data.host}</p>
              <p className="mt-3 text-xs text-muted-foreground">Saved revision {data.currentRevision} · {data.status==="published"?"Some content is already published":"Private draft, not published"}</p>
              <a href={privateWebsitePreviewUrl(data.siteId)} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-block text-sm font-semibold text-primary underline underline-offset-4">
                Open saved private preview
              </a></>:<p className="mt-2 text-sm text-muted-foreground">Prepare a private address before editing.</p>}
          </section>
          <section className="border bg-card p-5">
            <h2 className="text-sm font-semibold">What happens next</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Save an editable website draft. Official publication and protected institutional claims follow separate review and authorization.
            </p>
          </section>
        </aside>
      </div>
    </PageFrame>
  </LaunchSiteFrame>;
  return <WorkspaceShell
    eyebrow="Website & Brand Studio"
    title={data.siteName + " · website & brand"}
    subtitle={data.organizationName + " · a Site website and reusable communications"} actions={returnToLaunch}>
    <GuidedSetupShell
      title="Build your Site website and brand together"
      description="Choose Brand Identity, a grayscale wireframe, visual identity and your content before saving a private draft."
      steps={data.host ? steps.map((item,index)=>({
        id:item.id,title:item.title,description:index===0?"Choose your editorial direction":index===1?"Choose a structure":
          index===2?"Colors, fonts and rights-cleared media":index===3?"Edit website content":"Review private draft",
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
        ? <LocalWebsiteCopyEditor data={data} step={step} onStepChange={changeStep} allowPublication={!studio} />
        : <WebsiteAddressPreparation siteId={data.siteId} canPrepare={data.canPrepareWebsite}/>}
    </GuidedSetupShell>
  </WorkspaceShell>;
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
  { key: "heroHeadline", label: "Homepage headline", help: "The first words families see. Your Site name still appears in the website header.", multi: true },
  { key: "welcomeMessage", label: "Welcome to families", help: "Introduce the kind of community you hope to build.", multi: true },
  { key: "churchHistory", label: "Tell us about your church", help: "When did your church begin? Share its history and important milestones.", multi: true },
  { key: "communityOutreach", label: "Your community", help: "What relationships, partnerships or hopes connect your Site with the people around it? Avoid describing unconfirmed activities.", multi: true },
  { key: "schoolVision", label: "Your vision", help: "What do you hope students will become? You can personalize the prepared wording.", multi: true },
  { key: "leadershipWelcome", label: "A welcome from your host or Site leader", help: "Optional words approved by your church leader for families.", multi: true },
  { key: "localTraditions", label: "Local traditions and experiences", help: "Share real local traditions, service projects and community experiences.", multi: true },
  { key: "localDescription", label: "Your Site story", help: "What makes your Site's purpose and community special? Avoid promises about unapproved academic services.", multi: true },
  { key: "denomination", label: "Denominational affiliation", help: "Describe your church's identity. Do not claim an endorsement that has not been granted.", multi: false },
  { key: "statementOfFaith", label: "Statement of faith", help: "Your church's own theological statement, not CAN's academic policies.", multi: true },
  { key: "spiritualFormation", label: "Spiritual formation", help: "Prayer, worship, discipleship, chapel or religious observances provided locally.", multi: true },
];

function LocalWebsiteCopyEditor({
  data, step, onStepChange, allowPublication,
}: {
  data: Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>;
  step: number;
  onStepChange: (step: number) => void;
  allowPublication: boolean;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState(() => {
    const starter = prepareWebsiteEditorContent(data.editingContent, data.siteName);
    // Source-derived copy is an editable, unsaved first draft, never an
    // automatic update of an already saved website revision.
    const initial = data.currentRevision === 0
      ? prepareWebsiteCopyFromSiteInformation(starter,data.siteStoryCopyCandidates) : starter;
    return { content: initial, saved: starter, revision: data.currentRevision, siteId: data.siteId };
  });
  const [brandDisplayName,setBrandDisplayName]=useState(
    data.currentBrandConfiguration?.displayName??data.siteName);
  const brandPointerRef=useRef<string|null>(data.currentBrandVersionId);
  const brandConfigRef=useRef<SiteBrandConfiguration|null>(data.currentBrandConfiguration);
  const [savedBrandName,setSavedBrandName]=useState(
    data.currentBrandConfiguration?.displayName??data.siteName);
  const content = editor.content;
  const brandDisplayNameDirty=brandDisplayName!==savedBrandName;
  const brandRecommendation = data.siteStoryRecommendation;
  const brandDirection = content.branding.brandDirectionId ?? null;
  const setContent: Dispatch<SetStateAction<SiteLocalContent>> = update =>
    setEditor(previous => ({ ...previous, content: typeof update === "function"
      ? update(previous.content) : update }));
  const dirty = JSON.stringify(content) !== JSON.stringify(editor.saved) || brandDisplayNameDirty;
  const revisionConflict = editor.siteId === data.siteId && editor.revision !== data.currentRevision;
  const releaseNavigation = useLaunchUnsavedChanges(dirty);
  const [preparingArtwork, setPreparingArtwork] = useState(false);
  const [contentBlocksDirty, setContentBlocksDirty] = useState(false);
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed || preparingArtwork;
  const artworkGaps = [content.branding.heroImage, content.branding.logoImage ?? null]
    .flatMap(siteLocalImagePublicationGaps);
  const [error, setError] = useState("");
  const [confirmation,setConfirmation] = useState<null | {kind:"reload"} | {kind:"restore";revision:number}>(null);
  const [draftPreview, setDraftPreview] = useState<{source: SiteLocalContent; rendered: Awaited<ReturnType<typeof previewChurchWebsiteDraft>>} | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  useEffect(() => {
    setDraftPreview(null);
    if(!dirty){
      setBrandDisplayName(data.currentBrandConfiguration?.displayName??data.siteName);
      brandPointerRef.current=data.currentBrandVersionId;
      brandConfigRef.current=data.currentBrandConfiguration;
      setSavedBrandName(data.currentBrandConfiguration?.displayName??data.siteName);
    }
    setEditor(previous => {
      if (previous.siteId === data.siteId && previous.revision === data.currentRevision) return previous;
      // A loader refresh (including media changes) must never overwrite authored copy.
      if (previous.siteId === data.siteId &&
          JSON.stringify(previous.content) !== JSON.stringify(previous.saved)) return previous;
      const latest = prepareWebsiteEditorContent(data.editingContent, data.siteName);
      return { content: latest, saved: latest, revision: data.currentRevision, siteId: data.siteId };
    });
  }, [data.siteId, data.currentRevision, data.editingContent, data.siteName,
      data.currentBrandVersionId]);

  function loadLatestRevision() {
    const latest = prepareWebsiteEditorContent(data.editingContent, data.siteName);
    setEditor({ content: latest, saved: latest, revision: data.currentRevision, siteId: data.siteId });
    setBrandDisplayName(data.currentBrandConfiguration?.displayName??data.siteName);
    brandPointerRef.current=data.currentBrandVersionId;
    brandConfigRef.current=data.currentBrandConfiguration;
    setSavedBrandName(data.currentBrandConfiguration?.displayName??data.siteName);
    setDraftPreview(null);
    setError("");
  }

  function markSaved(submitted: SiteLocalContent, revision: number, replaceContent = false) {
    // A save can finish after more typing. Advance the saved baseline and
    // revision without silently replacing changes made while the request ran.
    // An explicitly confirmed restore is different: replace the editor copy.
    setEditor(previous => ({
      ...previous,
      content: replaceContent || previous.content === submitted ? submitted : previous.content,
      saved: submitted, revision,
    }));
    setDraftPreview(null);
    setShareMessage("");
  }

  async function saveDraft(mode: "stay" | "exit" = "stay") {
    if (busy || !data.canEdit || !data.draftStorageReady || revisionConflict) return;
    if (contentBlocksDirty) {
      setError("Save your website section layout using 'Save private blocks' before saving or exiting.");
      return;
    }
    setError("");
    const submitted = content;
    const branding=submitted.branding;
    const configuration:SiteBrandConfiguration={
      directionId:branding.brandDirectionId??null,
      paletteId:branding.paletteId??"signature",
      typographyId:branding.typographyId??"editorial",
      headingFontId:branding.headingFontId??null,
      bodyFontId:branding.bodyFontId??null,
      displayName:brandDisplayName.trim(),
      logoAssetId:brandConfigRef.current?.logoAssetId??null,
      heroAssetId:brandConfigRef.current?.heroAssetId??null,
    };
    const outcome = await mutation.run(async()=>{
      // Authoritative Brand save happens first. This may create a new immutable
      // Brand version, but NEVER updates an existing released artifact.
      const brandResult=await saveSiteBrandVersion({data:{
        siteId:data.siteId,expectedBrandVersionId:brandPointerRef.current,
        configuration,
        logoImage:branding.logoImage??null,heroImage:branding.heroImage,
      }});
      brandPointerRef.current=brandResult.brandVersionId;
      brandConfigRef.current=brandResult.configuration;
      setSavedBrandName(brandResult.configuration.displayName);
      // Website content is a separate revision and stores only layout/copy.
      // A failure here is reported; the already-saved Brand is not rolled back.
      return saveChurchWebsiteDraft({data:{
        content:submitted,siteId:data.siteId,expectedRevision:editor.revision,
      }});
    },{successMessage:"Site Brand and private website draft saved. Publication and enrollment are unchanged.",
      commandErrorMessage:"The Site Brand or website draft could not be saved. Reload before retrying."});
    if (outcome.status === "saved" || outcome.status === "refresh-failed") {
      markSaved(submitted, outcome.value.revision);
      if (mode === "exit" && outcome.status === "saved") {
        releaseNavigation();
        await router.navigate({to:"/launch/site",search:{siteId:data.siteId}});
      }
    } else if (outcome.status === "failed" &&
      normalizeClientError(outcome.error).code === "CONFLICT") {
      // Keep all typed content; a newer server revision needs explicit review.
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
    if (artworkGaps.length) {
      setError("Complete the artwork description, usage rights and child-privacy confirmations before approving website copy.");
      return;
    }
    if (revisionConflict) return;
    const submitted = content;
    const outcome = await mutation.run(() => publishChurchWebsiteContent({
        data: { content: submitted, expectedRevision: editor.revision,siteId:data.siteId },
      }), { successMessage: result => result.status === "review_required"
        ? "Protected institutional language was held for CAN review. Previously published church content remains unchanged."
        : "Reviewed church-owned website copy saved. Official Site publication remains a separate Prepare decision. If this Site is already public, approved copy may update its live website.",
      commandErrorMessage: "Could not save church content." });
    if (outcome.status === "saved" || outcome.status === "refresh-failed")
      markSaved(submitted, outcome.value.revision);
    else if (outcome.status === "failed" &&
      normalizeClientError(outcome.error).code === "CONFLICT") {
      // Surface the current revision without discarding what this editor typed.
      await router.invalidate().catch(() => undefined);
    }
  }

  async function restore(revision: number) {
    if (busy || revisionConflict) return;
    setError("");
    const outcome = await mutation.run(() => restoreChurchWebsiteContent({
        data: { expectedRevision: editor.revision, restoreRevision: revision,siteId:data.siteId },
      }), { successMessage: result => result.status === "review_required"
        ? "Historical copy needs review under current claim rules; existing public content is unchanged."
        : `Revision ${revision} was restored as a new published revision.`,
      commandErrorMessage: "Unable to restore this revision." });
    if (outcome.status === "saved" || outcome.status === "refresh-failed") {
      // The restore returns its exact authorized, normalized snapshot. Apply it
      // only after the mutation succeeded so a failed restore never discards
      // unsaved copy, even when the route refresh was unable to complete.
      const restored = outcome.value.restoredContent;
      if (restored) markSaved(prepareWebsiteEditorContent(restored, data.siteName), outcome.value.revision, true);
    } else if (outcome.status === "failed" &&
      normalizeClientError(outcome.error).code === "CONFLICT") {
      await router.invalidate().catch(() => undefined);
    }
  }

  async function selectArtwork(event: ChangeEvent<HTMLInputElement>, field: "heroImage" | "logoImage" = "heroImage") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setPreparingArtwork(true); setError("");
    try {
      const dataUrl = await prepareWebsiteArtwork(file);
      setContent(old => ({ ...old, branding: { ...old.branding, [field]: {
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
  const textField = (field: typeof churchFields[number]) =>
    <WebsiteCopyField key={field.key} field={field} content={content}
      candidate={data.siteStoryCopyCandidates.find(item=>item.field===field.key)}
      disabled={busy||!data.canEdit}
      onChange={value=>setContent(old=>({...old,[field.key]:value}))}
      onRestore={()=>setContent(old=>restoreOriginalWebsiteField(old,field.key))}/>;

  return <section aria-label="Website content setup">
    {data.demonstration && !data.editingContent && <WorkspaceNotice tone="attention" className="mt-3">
      <p className="font-semibold">Fictional sample prepared for this demo Site</p>
      <p className="mt-1">We filled the draft with an example welcome, community story, vision and theme.
        This content has not been saved or published. Review and edit the story, then
        save your private draft. Site publication and legal authorization are separate.</p>
      <p className="mt-2">To change any suggested wording, go to Your Content and use the Reset to original action
        beside that individual field. No other answers are affected.</p>
    </WorkspaceNotice>}
    {revisionConflict && <WorkspaceNotice tone="attention" className="mt-3 space-y-2">
      <p className="font-semibold">A newer website revision ({data.currentRevision}) is available.</p>
      <p>Your unsaved edits remain here. Saving is paused to prevent overwriting someone else's revision.
        You can review or copy your current wording, then load the latest saved version.</p>
      <Button variant="outline" type="button" onClick={() => dirty ? setConfirmation({kind:"reload"}) : loadLatestRevision()}
        className="min-h-11 border px-3 py-2 font-semibold">Discard my edits and load latest</Button>
    </WorkspaceNotice>}
    {!data.canEdit && <WorkspaceNotice tone="attention" className="mt-3">
      This Site is view-only for your current assignment. A private Site Brand and
      website draft require an authorized editor. Public publication is reviewed separately.
    </WorkspaceNotice>}
    {data.localContentStatus === "review_required" && <WorkspaceNotice tone="attention" className="mt-3">
      Your latest proposed wording includes a protected claim. It is held for review;
      the last published church copy remains unchanged.
    </WorkspaceNotice>}
    {data.approvedPhotoCount === 0 && !content.branding.heroImage && <p role="status" className="mt-3 border p-3 text-sm">Using illustrative template images. No Site photography selected.</p>}
    {artworkGaps.length > 0 &&
      <div role="status" className="mt-3 border p-3 text-sm">
        <p className="font-semibold">Artwork is incomplete. You can save a private draft now.</p>
        <p className="mt-1">This artwork stays private and will not appear in a preview or published page until these items are complete:</p>
        <ul className="mt-2 list-disc pl-5">{[...new Set(artworkGaps)].map(gap =>
          <li key={gap}>{gap}</li>)}</ul>
      </div>}
    {error && <WorkspaceNotice tone="danger" className="mt-3">{error}</WorkspaceNotice>}
    <MutationFeedback state={mutation} className="mt-3" pendingMessage="Saving website changes..."/>
    <div className="space-y-5">
      {step === 0 && <section aria-label="Brand Identity" className="space-y-5">
        <div>
          <h3 className="font-serif text-2xl font-semibold">What should families feel about your Site?</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Choose an editorial direction. Your saved Site Information can guide a suggestion, but this choice never verifies programs, staff or academic outcomes.</p>
          {data.siteStoryRevision
            ? <p className="mt-2 text-xs text-muted-foreground">Saved Site Information: {new Date(data.siteStoryRevision).toLocaleDateString()}</p>
            : <p className="mt-2 text-xs text-muted-foreground">No optional purpose answers saved in Site Information. You can still choose a direction.</p>}
        </div>
        <Field label="Public-facing Site name"
          description="This display name is saved with the Brand version. Changing your Site Profile name later will not alter older flyers or released website pages.">
          <Input type="text" maxLength={120} value={brandDisplayName}
            disabled={busy||!data.canEdit}
            onChange={event=>setBrandDisplayName(event.target.value)}
            placeholder="Your learning community name" className="min-h-11 w-full"/>
        </Field>
        <div className="border bg-muted/20 p-3 text-sm">
          <p className="font-semibold">
            {data.currentBrandRevision>0
              ? `Current saved Site Brand: v${data.currentBrandRevision}`
              : "Site Brand not saved yet"}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Brand changes create immutable saved versions. Previously generated materials
            retain their original identity until you explicitly update and regenerate them.
          </p>
        </div>
        <fieldset disabled={busy || !data.canEdit}>
          <legend className="text-sm font-semibold">Choose your brand direction</legend>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {siteBrandDirections.map(direction=>{
              const selected=brandDirection===direction.id;
              return <Button key={direction.id} type="button" variant="outline" aria-pressed={selected}
                onClick={()=>setContent(old=>({...old,branding:{...old.branding,brandDirectionId:direction.id}}))}
                className={`h-auto min-h-32 w-full flex-col items-start whitespace-normal border p-5 text-left ${selected?"border-primary ring-2 ring-primary/40":""}`}>
                <span className="w-full text-sm font-bold">{direction.name}</span>
                <span className="mt-1 text-xs text-muted-foreground">{direction.character}</span>
                <span className="mt-2 text-xs leading-5 text-muted-foreground">{direction.description}</span>
                {(selected || brandRecommendation===direction.id) && <span className="mt-3 text-xs font-semibold text-primary">
                  {selected?"Selected":""}{selected && brandRecommendation===direction.id?" · ":""}
                  {brandRecommendation===direction.id?"Suggested from Site Information":""}
                </span>}
              </Button>;
            })}
          </div>
        </fieldset>
        <p className="text-xs text-muted-foreground">{brandRecommendation
          ?"A keyword suggestion from your saved Story is not a required choice or verified institutional claim."
          :"No recommendation appears without matching Story evidence."}</p>
        <p className="text-xs text-muted-foreground">
          Saving creates an immutable Site Brand version only when identity properties change.
          The website wireframe and content are saved separately.
        </p>
      </section>}
      {step === 1 && <div className="space-y-5">
        <h3 className="font-serif text-2xl font-semibold">Choose your wireframe</h3>
        <p className="text-sm text-muted-foreground">Compare seven structures in grayscale. Colors, typography and imagery come next.</p>
        {brandDirection && <div className="flex flex-wrap items-center justify-between gap-3 border p-3 text-sm">
          <span>Suggested structure: <strong>{schoolBrandDesigns[brandRecommendedLayout(brandDirection)].name}</strong></span>
          <Button type="button" variant="outline" disabled={busy || !data.canEdit}
            onClick={()=>setContent(old=>({...old,branding:{...old.branding,templateId:brandRecommendedLayout(brandDirection)}}))}>
            Use suggested layout
          </Button>
        </div>}
        <WebsiteTemplateGallery schoolName={data.siteName}
          value={content.branding.templateId ?? "heritage"}
          onChange={(templateId: SiteTemplateId) => setContent(old => ({
            ...old, branding: { ...old.branding, templateId },
          }))}
          paletteId={content.branding.paletteId} typographyId={content.branding.typographyId}
          headingFontId={content.branding.headingFontId} bodyFontId={content.branding.bodyFontId}
          disabled={busy || !data.canEdit}/>
        <p className="text-xs text-muted-foreground">Your design and brand are saved together. Switching designs keeps Site copy, photos, colors and fonts until you explicitly apply that design's recommended branding.</p>
      </div>}

      {step === 3 && <div className="space-y-5">
        <div>
          <h3 className="font-serif text-2xl">Build your website from what you have already shared.</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Your Site Information provides the foundation, including the origin story,
            community needs, values, learner experiences and future vision.
            New websites start with source-based copy; existing saved edits are never overwritten automatically.
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Prepared words are suggestions, not verified promises about programs, services, leaders or opening status.
            Review them before sharing. Approved academic and admissions facts still come from CAN OS.
          </p>
        </div>
        <p className="text-xs italic leading-5 text-muted-foreground">
          We use your saved Purpose &amp; Story answers to prepare website copy and potential outreach
          materials. You control what appears publicly. Review names, permissions, personal details
          and factual claims before sharing. Nothing goes live automatically.
        </p>
        {data.siteStoryCopyCandidates.length>0 && <div className="flex flex-wrap items-center justify-between gap-3 border p-3">
          <span className="text-sm">
            {data.siteStoryCopyCandidates.length} source-based drafts available from Site Information.
          </span>
          <Button type="button" variant="outline" disabled={busy || !data.canEdit}
            onClick={()=>setContent(old=>prepareWebsiteCopyFromSiteInformation(old,data.siteStoryCopyCandidates))}>
            Use Site Information in unchanged starter fields
          </Button>
        </div>}
        {data.siteStorySourceChoices && <div className="border bg-muted/20 p-4 text-sm" role="note">
          <p className="font-semibold">Suggestions from Site Information</p>
          <p className="mt-2 text-muted-foreground">
            Values: {data.siteStorySourceChoices.values.join(", ") || "not selected"}.
            Priorities: {data.siteStorySourceChoices.motivations.join(", ") || "not selected"}.
            Suggestions also draw on your written origin, community need and future vision.
            All proposed wording remains editable and reviewable.
          </p>
          <Link to="/launch/site" search={{siteId:data.siteId,module:"site-information"}}
            className="mt-3 inline-block font-semibold text-primary underline">Review Site Information</Link>
        </div>}
        {primaryFields.map(textField)}
        <details className="border p-4">
          <summary className="cursor-pointer text-sm font-semibold">Review source-attributed church story suggestions (optional)</summary>
          <div className="mt-4"><ChurchSourceSuggestionReview currentRevision={data.currentRevision}/></div>
        </details>
        <details className="border p-4">
          <summary className="cursor-pointer text-sm font-semibold">More optional church details</summary>
          <div className="mt-4 space-y-5">{additionalStoryFields.map(textField)}</div>
        </details>
        <details className="border p-4" id="website-content-layout">
          <summary className="cursor-pointer text-sm font-semibold">
            Arrange Programs, Courses, Classes and website sections
          </summary>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            These are the same Site-owned content blocks configured in Launch.
            Each section reads its approved source when available. Saving a layout
            changes only the private design; publishing the layout is a separate
            authorized action and never approves a Program or opens enrollment.
          </p>
          {data.canPublish
            ? <div className="mt-4"><SiteContentChannelEditor
                key={data.siteId + ":" + data.contentChannelConfig.revision}
                siteId={data.siteId}
                initialConfig={data.contentChannelConfig}
                canPublish={allowPublication && data.canPublish}
                onSaved={() => { void router.invalidate(); }} onDirtyChange={setContentBlocksDirty} />
              </div>
            : <WorkspaceNotice tone="attention" className="mt-4">
                Your verified Site grant allows previewing but not editing website
                sections. Ask a Site Administrator for local website publishing access.
              </WorkspaceNotice>}
        </details>
      </div>}
      {step === 2 && <WebsiteVisualIdentityStep
        data={data} content={content} brandDirection={brandDirection} busy={busy}
        setContent={setContent} onSelectArtwork={selectArtwork}/>}
      {step === 4 && <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Review your website</h3>
          <p className="mt-1 text-sm text-muted-foreground">Preview your pages. Family information and institutional approvals are managed separately.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={previewPending} onClick={() => void previewCurrentDraft()}
            className="min-h-11 border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {previewPending ? "Generating secure preview..." : "Preview unsaved changes"}
          </Button>
          {<a
            href={privateWebsitePreviewUrl(data.siteId)}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center border border-primary px-4 py-2 text-sm font-semibold text-primary">
            {data.currentRevision === 0 ? "Open full-page sample preview" : "Open full-page preview"}
          </a>}
          {data.currentRevision > 0 && <Button type="button" variant="outline" className="min-h-11 border"
            onClick={() => void navigator.clipboard.writeText(
              new URL(privateWebsitePreviewUrl(data.siteId), window.location.origin).href,
            ).then(() => setShareMessage("Preview link copied. Reviewers must sign in with their own authorized Site account."))
              .catch(() => setShareMessage("Copy the address from Open full-page preview; clipboard permission was unavailable."))}>
            Copy private preview link
          </Button>}
        </div>
        <p className="text-xs text-muted-foreground">This private full-page link requires a CAN OS sign-in; use Share preview for external reviewers. It never publishes a draft. {data.currentRevision > 0 ? "It shows the latest saved revision." : "Until the first save, it shows a clearly marked sample, not your unsaved edits."} {dirty ? "You have unsaved edits; save them before sharing the latest design." : ""}</p>
        {data.currentRevision === 0 && <p className="border p-3 text-sm" role="status">No saved website draft exists yet. The full-page preview shows an illustrative sample. You can test unsaved changes below; sharing your customized design requires saving.</p>}
        {shareMessage && <p role="status" className="border p-3 text-sm">{shareMessage}</p>}
        {previewError&&<WorkspaceNotice tone="danger">{previewError}</WorkspaceNotice>}
        <WebsitePreviewPanel data={data} draftPreview={draftPreview?.source === content ? draftPreview.rendered : null} />
        {!dirty && editor.revision > 0 && !revisionConflict
          ? <div className="flex flex-wrap items-center justify-between gap-3 border p-4">
              <div>
                <p className="text-sm font-semibold">Ready to show your proposed website?</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Share your proposed Site website, including planned Programs, without publishing the Site or opening enrollment.
                </p>
              </div>
              <LaunchPreviewSharing siteId={data.siteId}/>
            </div>
          : <p role="status" className="border p-3 text-sm">
              Save your latest website edits before sharing a review link.
            </p>}
        <WebsiteSourceMappingPanel data={data} />
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
        {allowPublication && <Button type="button" variant="outline"
          disabled={busy || !data.canPublish || revisionConflict} onClick={() => void submit()}>
          {busy ? "Publishing…" : "Publish reviewed church-owned content"}
        </Button>}
        {!allowPublication && <p className="text-sm text-muted-foreground">
          The Launch Studio saves a private draft only. Official Site publication belongs in Prepare.
        </p>}
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
              {allowPublication && data.canPublish && version.status === "published" && version.revision < data.currentRevision &&
                <Button variant="outline" type="button" disabled={busy || revisionConflict} onClick={() => dirty ? setConfirmation({kind:"restore",revision:version.revision}) : void restore(version.revision)}
                  className=" border px-3 py-1 text-xs disabled:opacity-50">
                  Restore as new revision
                </Button>}
            </li>)}
          </ul>
        </details>}
      </div>}
      {!data.draftStorageReady && <WorkspaceNotice tone="attention">
        <strong>Private draft storage requires an update.</strong> This Cloudflare-connected database has not
        applied website migration 0077. Draft saving is unavailable until an authorized database
        migration is completed. You can still preview the website, but your changes are not saved.
      </WorkspaceNotice>}
      <ActionDialog open={confirmation!==null}
        title={confirmation?.kind==="reload" ? "Discard changes and load latest?" : "Restore an earlier website revision?"}
        description="Unsaved website copy and Brand edits will be discarded. Previously saved versions stay in history."
        confirmLabel={confirmation?.kind==="reload" ? "Discard edits and reload" : "Restore revision"}
        destructive pending={busy} onClose={()=>setConfirmation(null)}
        onConfirm={()=>{
          const action=confirmation;
          setConfirmation(null);
          if(action?.kind==="reload") loadLatestRevision();
          else if(action?.kind==="restore") void restore(action.revision);
        }} />
      <ActionFooter layout="inline" className="justify-between border-t border-border/60 pt-5">
        <Button type="button" variant="outline" disabled={busy || step === 0}
          onClick={()=>onStepChange(Math.max(0,step-1))}>Back</Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" type="button"
            disabled={busy || !data.canEdit || !data.draftStorageReady || revisionConflict}
            onClick={()=>void saveDraft("exit")}>Save & Exit</Button>
          {step < 4 ? <Button type="button"
            onClick={()=>onStepChange(Math.min(4,step+1))}>Continue</Button>
            : <Button type="button" disabled={busy || !data.canEdit || !data.draftStorageReady || revisionConflict}
              loading={busy} loadingLabel="Saving private draft…"
              onClick={()=>void saveDraft("stay")}>Save private draft & finish</Button>}
        </div>
      </ActionFooter>
    </div>
  </section>;
}
