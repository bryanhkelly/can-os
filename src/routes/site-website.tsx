import { decodeUuidPathParam } from "@/domain/opaque-url-id";
import { previewSiteIntelligence } from "@/modules/sites/site-content-generation.functions";
import { runSiteGeneration, useSiteGenerationPreview } from "@/components/launch-studio/useSiteGeneration";
import { WebsiteReviewStep } from "@/components/launch-studio/WebsiteReviewStep";
import { WebsiteBrandIdentityStep } from "@/components/launch-studio/WebsiteBrandIdentityStep";
import { WebsiteSiteContentStep } from "@/components/launch-studio/WebsiteSiteContentStep";
import { WebsiteContentConsentStep } from "@/components/launch-studio/WebsiteContentConsentStep";
import { siteBrandConfigurationSchema, type SiteBrandConfiguration } from "@/domain/site-brand";
import { prepareWebsiteCopyFromSiteInformation } from "@/domain/site-website-story-suggestions";
import { WebsiteVisualIdentityStep } from "@/components/launch-studio/WebsiteVisualIdentityStep";
import { brandRecommendedLayout } from "@/domain/site-brand-direction";
import { type SiteTemplateId } from "@/domain/site-theme";
import { WebsiteTemplateGallery } from "@/components/launch-studio/WebsiteTemplateGallery";
import { privateWebsitePreviewUrl } from "@/domain/private-website-preview";
import { schoolBrandDesigns } from "@/domain/school-brand-identity";
import { Button } from "@/components/ui/button";
import { launchModuleCompletionV61, type LaunchModuleCompletion } from "@/domain/launch-module-completion-v61";
import { LaunchSiteFrame } from "@/components/launch-studio/LaunchSiteFrameV61";
import { SiteGuideV61, type SiteGuideContentV61 } from "@/components/launch-studio/SiteGuideV61";
import type { FriendlySiteIdentity } from "@/domain/friendly-site-urls";
import { Link } from "@tanstack/react-router";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { normalizeClientError } from "@/lib/client-error";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { WorkspaceNotice, WorkspacePanel, ActionDialog, ActionFooter, PageHeader, PageFrame } from "@/components/workspace";
import { GuidedSetupShell } from "@/components/workflow";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { useLaunchUnsavedChanges } from "@/components/launch-studio/useLaunchUnsavedChanges";
import { emptySiteLocalContent, createSiteWebsiteStarterContent, siteLocalContentLimits, websiteStarterFieldIds, type SiteLocalTextField,
  prepareWebsiteEditorContent, siteLocalImageMaxBytes,
  siteLocalImagePublicationGaps, type SiteLocalContent,
} from "@/domain/site-local-content";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { prepareSchoolWebsite, getPartnerWebsitePreviewView, previewChurchWebsiteDraft, saveSiteWebsiteAndBrand, restoreChurchWebsiteContent } from "@/modules/sites/site-website-preview.functions";
import {LaunchWebsiteEditorHandoff} from "@/components/operations/LaunchWebsiteEditorHandoff";
import {siteProgramSelectionSchema} from "@/lib/route-search";
import { z } from "zod";

export const websiteStudioStepIds = ["brand", "wireframe", "visual", "consent", "content", "review"] as const;

const websiteGuideSteps: readonly SiteGuideContentV61[] = [
  {
    summary: "Your Brand makes this Site recognizable across the website and your outreach.",
    insight: "Start with the tone and values you want visitors to feel. The Site and its hosting organization may have different identities.",
    connection: "Saving a Brand version allows future outreach materials to retain the exact identity used to create them.",
  },
  {
    summary: "First choose the structure of your website, before adding color or images.",
    insight: "Look at the order of sections: can a first-time visitor quickly find who you serve, what you hope to offer and how to get in touch?",
    connection: "Your layout can change while the underlying Site information stays in one place.",
  },
  {
    summary: "Visual choices should support the Site's story and help people find their way.",
    insight: "Check contrast, readable type, image rights and whether the imagery reflects your actual community instead of promising facilities you do not yet have.",
    connection: "These choices belong to a versioned Brand, so existing outreach materials do not silently change.",
  },
  {
    summary: "Your Site Information can help create editable copy, but you decide what can be reused.",
    insight: "Only share information you have permission to use. Personal stories, names and images need separate care, especially when children are involved.",
    connection: "Content reuse consent controls suggestions. Declining does not prevent you from writing your own website copy.",
  },
  {
    summary: "Turn your Site's purpose and planned experiences into a clear visitor story.",
    insight: "Use a concrete opening, name the people you hope to serve, then offer one meaningful next action. Describe unapproved programs as plans, not services already available.",
    connection: "Saved copy can be reviewed in the private preview before any publishing decision.",
  },
  {
    summary: "Review the whole website as a visitor would see it.",
    insight: "Check names, links, accessibility, consent, dates and any statement that could sound like accreditation, partnership or open registration.",
    connection: "The private preview is not publication. Website publishing happens separately in Prepare and does not open registration.",
  },
] as const;

export const websiteSearchSchema=siteProgramSelectionSchema.extend({
  // Preserve supplied selectors for explicit validation; never silently omit
  // an invalid Site and open the editor under a different active membership.
  siteId:z.preprocess(value => typeof value === "string" ? decodeUuidPathParam(value) ?? value : value, z.string().optional()),
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

/** Reuse the authorized Launch read model for the dedicated website route. */
export async function loadWebsiteLaunchCompletion(siteId: string): Promise<LaunchModuleCompletion> {
  const { loadSiteLaunchView } = await import("./launch.site");
  const result = await loadSiteLaunchView({ siteId, module: "site-profile" });
  return result.ok && result.data.site?.id === siteId
    ? launchModuleCompletionV61(result.data.site, result.data.overview) : {};
}

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
  return <section className="border bg-card p-5"><p className="text-sm">Set up your website address to start designing.</p>
    {canPrepare && <Button className="mt-4" disabled={mutation.pending||mutation.refreshFailed} onClick={()=>void mutation.run(()=>prepareSchoolWebsite({data:{siteId}}),{successMessage:"Private website address prepared.",commandErrorMessage:"Unable to prepare the website address."})}>Prepare Site website</Button>}
    {!canPrepare && <p className="mt-3 text-sm">Ask a Site Administrator to set up the website address.</p>}
    <MutationFeedback state={mutation} pendingMessage="Preparing website…"/>
  </section>;
}

export function WebsiteHome({ outcome, selection, studio = false, friendlyIdentity, completion, onStepChange }: {
  outcome: Awaited<ReturnType<typeof loadWebsiteHome>>;
  selection: { siteId?:string; programId?:string; returnGrantId?:string; returnToHub?:boolean; returnToSettings?:boolean; step?:typeof websiteStudioStepIds[number] };
  studio?: boolean;
  friendlyIdentity?: FriendlySiteIdentity;
  completion?: LaunchModuleCompletion;
  onStepChange?: (step:number)=>void;
}) {
  const [localStep,setLocalStep]=useState(0);
  const requestedStep=websiteStudioStepIds.indexOf(selection.step??"brand");
  const step=selection.step ? Math.max(0,requestedStep) : localStep;
  const changeStep=onStepChange??setLocalStep;
  const returnToLaunch=selection.returnToSettings && selection.siteId
    ? <Link to="/settings" search={{siteId:selection.siteId}} className="font-semibold text-primary">Back to Settings</Link>
    : selection.returnToHub && friendlyIdentity
    ? <Link to="/o/$organizationSlug/$siteSlug/launch" params={friendlyIdentity} className="font-semibold text-primary">Back to Launch Studio</Link>
    : selection.returnToHub && selection.siteId
    ? <Link to="/launch/site" search={{siteId:selection.siteId}} className="font-semibold text-primary">Back to Launch Studio</Link>
    : selection.siteId&&selection.programId&&selection.returnGrantId
    ?<LaunchWebsiteEditorHandoff siteId={selection.siteId} programId={selection.programId} returnGrantId={selection.returnGrantId} destination="launch"/>:null;
  if (!outcome.ok) return <>{returnToLaunch}<LoaderFailure eyebrow="Partner website"
    title="Your Site website" outcome={outcome} /></>;

  const data = outcome.data;
  const steps = [
    {id:"brand",title:"Brand Identity"}, {id:"wireframe",title:"Choose Wireframe"},
    {id:"visual",title:"Visual Identity"}, {id:"consent",title:"Content Consent"},
    {id:"content",title:"Your Content"}, {id:"review",title:"Review & Finish"},
  ];
  if (studio) return <LaunchSiteFrame
    site={{id:data.siteId,name:data.siteName}} identity={friendlyIdentity} active="website-brand" completion={completion}
    previewAvailable={Boolean(data.host)}
    previewHref={privateWebsitePreviewUrl(data.siteId)}>
    <PageFrame width="wide" className="launch-studio-page">
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0">
          <PageHeader eyebrow="Shape / Website & Brand"
            title={data.host?["Brand Identity","Choose a Layout","Visual Identity",
              "Use Site Information","Your Content","Review"][step]:"Prepare your private website address"}
            subtitle="Design your Site website." />
          <div className="mt-5">
            {data.host ? <GuidedSetupShell
              title="Website & Brand" showHeader={false}
              progressLabel="Website & Brand steps"
              steps={steps.map((item,index)=>({
                id:item.id,
                title:item.title,
                description:index===0?"Choose a style":index===1?"Choose a layout":
                  index===2?"Colors, fonts and imagery":index===3?"Use saved information":
                  index===4?"Edit website content":"Review website",
                status:step===index?"current" as const:"upcoming" as const,
              }))}
              onStepChange={id=>changeStep(websiteStudioStepIds.indexOf(id as typeof websiteStudioStepIds[number]))}>
                <LocalWebsiteCopyEditor data={data} step={step} onStepChange={changeStep} allowPublication={!studio} friendlyIdentity={friendlyIdentity}/>
              </GuidedSetupShell>
              : <WebsiteAddressPreparation siteId={data.siteId} canPrepare={data.canPrepareWebsite}/>}
          </div>
          <div className="mt-5 border-t pt-4 text-sm">{returnToLaunch??<Link to="/home" className="font-semibold text-primary">Exit to workspace</Link>}</div>
        </div>
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-6 xl:self-start" aria-label="Website and Brand guidance">
          <SiteGuideV61 guide={data.host ? {
            ...websiteGuideSteps[step]!,
            highlights: [data.siteName, data.status === "published" ? "Published website" : "Private website draft"],
          } : {
            summary: "Prepare a private Site website address before you choose a layout or begin editing.",
            insight: "You can design and review privately without opening enrollment or publishing your Site.",
            connection: "Website & Brand uses your existing Site information; no separate organization or program setup is needed.",
          }} />
          <section className="border bg-card p-5">
            <h2 className="text-sm font-semibold">Preview</h2>
            {data.host?<><p className="mt-2 break-all font-mono text-xs">{data.host}</p>
              <p className="mt-3 text-xs text-muted-foreground">{data.status==="published"?"Published":"Draft"}</p>
              <a href={privateWebsitePreviewUrl(data.siteId)} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-block text-sm font-semibold text-primary underline underline-offset-4">
                Open preview
              </a></>:<p className="mt-2 text-sm text-muted-foreground">Set up an address to begin.</p>}
          </section>

        </aside>
      </div>
    </PageFrame>
  </LaunchSiteFrame>;
  return <WorkspaceShell
    eyebrow="Website & Brand Studio"
    title={data.siteName + " · website & brand"}
    subtitle={data.organizationName} actions={returnToLaunch}>
    <GuidedSetupShell
      title="Website & Brand" showHeader={false}
      steps={data.host ? steps.map((item,index)=>({
        id:item.id,title:item.title,description:index===0?"Choose a style":index===1?"Choose a layout":
          index===2?"Colors, fonts and imagery":index===3?"Use saved information":
            index===4?"Edit website content":"Review website",
        status:step===index?"current":"upcoming",
      })) : [
        { id: "address", title: "Site address", description: "Prepare a private website address", status: "current" },
      ]}
      aside={<div className="space-y-3 py-1 text-sm">
        <p className="font-semibold">Site address</p>
        {data.host ? <>
          <p className="break-all font-mono text-xs">{data.host}</p>
          <p className="text-muted-foreground">
            {data.status === "published" ? "Published" : "Draft"}
          </p>
        </> : <p role="status" className="text-muted-foreground">
          No address is reserved yet.
        </p>}

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

function LocalWebsiteCopyEditor({
  data, step, onStepChange, allowPublication, friendlyIdentity,
}: {
  data: Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>;
  step: number;
  onStepChange: (step: number) => void;
  allowPublication: boolean;
  friendlyIdentity?: FriendlySiteIdentity;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState(() => {
    // Do not auto-generate from Site Information before the user grants consent.
    // A new Site starts with blank editorial fields while preserving visual defaults.
    const starter = data.editingContent
      ? prepareWebsiteEditorContent(data.editingContent, data.siteName, data.siteExperienceProfile)
      : {...emptySiteLocalContent,branding:{...emptySiteLocalContent.branding}};
    return { content: starter, saved: starter, revision: data.currentRevision, siteId: data.siteId };
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
  const mutation = useMutationFeedback(() => router.invalidate());
  const [generating,setGenerating]=useState(false);
  const [generationMessage,setGenerationMessage]=useState("");
  const generationRequest={siteId:data.siteId,consumer:"website" as const,options:{tone:"welcoming" as const,language:"en" as const,includeStory:true,includeLeadership:false,includeExistingCopy:false,includePublicReferences:false}};
  const generationStatus=useSiteGenerationPreview(generationRequest,step===4&&content.contentReuseConsent==="granted"&&data.canEdit,data.currentRevision);
  const busy = mutation.pending || mutation.refreshFailed || preparingArtwork || generating;
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
      const latest = data.editingContent
        ? prepareWebsiteEditorContent(data.editingContent, data.siteName, data.siteExperienceProfile)
        : {...emptySiteLocalContent,branding:{...emptySiteLocalContent.branding}};
      return { content: latest, saved: latest, revision: data.currentRevision, siteId: data.siteId };
    });
  }, [data.siteId, data.currentRevision, data.editingContent, data.siteName,
      data.currentBrandVersionId]);

  function loadLatestRevision() {
    const latest = data.editingContent
      ? prepareWebsiteEditorContent(data.editingContent, data.siteName, data.siteExperienceProfile)
      : {...emptySiteLocalContent,branding:{...emptySiteLocalContent.branding}};
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

  function brandConfig(submitted:SiteLocalContent):SiteBrandConfiguration{
    const branding=submitted.branding;
    return {
      directionId:branding.brandDirectionId??null,
      paletteId:branding.paletteId??"signature",
      typographyId:branding.typographyId??"editorial",
      headingFontId:branding.headingFontId??null,
      bodyFontId:branding.bodyFontId??null,
      displayName:brandDisplayName.trim(),
      logoAssetId:brandConfigRef.current?.logoAssetId??null,
      heroAssetId:brandConfigRef.current?.heroAssetId??null,
      sharedHeroPhoto:branding.heroImage?null:branding.sharedHeroPhoto??null,
    };
  }
  function acceptSavedBrand(brand:{
    brandVersionId:string;configuration:SiteBrandConfiguration;
  }){
    brandPointerRef.current=brand.brandVersionId;
    brandConfigRef.current=brand.configuration;
    setSavedBrandName(brand.configuration.displayName);
  }

  const brandValid = siteBrandConfigurationSchema.safeParse(brandConfig(content)).success;
  const canSave = !busy && data.canEdit && data.draftStorageReady && !revisionConflict && brandValid;
  const saveBlockReason = !data.canEdit ? "You do not have permission to save this Site."
    : !data.draftStorageReady ? "Draft storage is unavailable."
    : revisionConflict ? "Load the latest saved revision before saving."
    : !brandValid ? "Enter a valid Site display name (1–120 characters) and Brand settings." : "";
  async function saveDraft(mode: "stay" | "exit" | "finish" = "stay") {
    if(!canSave)return;
    setError("");
    const submitted=content;
    const outcome=await mutation.run(()=>saveSiteWebsiteAndBrand({data:{
      siteId:data.siteId,operation:"draft",expectedRevision:editor.revision,
      expectedBrandVersionId:brandPointerRef.current,
      brand:brandConfig(submitted),content:submitted,
    }}),{
      successMessage:"Site Brand and website draft saved together. Publication and enrollment remain unchanged.",
      commandErrorMessage:"The Site Brand and website could not be saved. No partial changes were committed.",
    });
    if(outcome.status==="saved"||outcome.status==="refresh-failed"){
      acceptSavedBrand(outcome.value.brand);
      markSaved(submitted,outcome.value.website.revision);
      if(mode==="stay") return outcome.status==="saved";
      if(outcome.status==="saved"){
        releaseNavigation();
        try {
          if (mode === "finish" && !allowPublication) {
            if (friendlyIdentity) await router.navigate({ to: "/o/$organizationSlug/$siteSlug/launch", params: friendlyIdentity, search: { module: "create-outreach" } });
            else await router.navigate({ to: "/launch/site", search: { siteId: data.siteId, module: "create-outreach" } });
          } else if (friendlyIdentity) await router.navigate({ to: "/o/$organizationSlug/$siteSlug", params: friendlyIdentity });
          else await router.navigate({ to: "/sites/$siteId", params: { siteId: data.siteId } });
        }
        catch(failure) {
          setError(mutationErrorMessage(failure,
            "Website saved, but we could not open your Site Workspace. Try again from the navigation."));
        }
      }
    }else if(outcome.status==="failed"&&
      normalizeClientError(outcome.error).code==="CONFLICT"){
      await router.invalidate().catch(()=>undefined);
    }
  }
  async function generateContent(advance=false) {
    if(!canSave||(!advance&&!generationStatus.preview?.eligibility.allowed))return;
    const consent=content.contentReuseConsent;
    if(consent!=="granted"&&consent!=="denied")return;
    // Save through the existing versioned draft command before reading the brief.
    setGenerationMessage("");
    setGenerating(true);
    try {
      if(!await saveDraft("stay"))return;
      if(advance)onStepChange(4);
      if(consent==="denied")return;
      const preview=await previewSiteIntelligence({data:generationRequest});
      const result=await runSiteGeneration(generationRequest,preview);
      if(!result.success){setGenerationMessage(result.message+" Existing content is unchanged.");return;}
      const item=result.stored?.package;
      if(!item?.website)throw new Error("Current generated content is unavailable.");
      // Only initialize unchanged starter fields on Continue; explicit regeneration
      // may replace wording after the operator confirms.
      setContent(old=>{
        if(old.contentReuseConsent!=="granted")return old;
        const next={...old};
        for(const field of websiteStarterFieldIds){
          const proposed=item.website?.[field];
          if(typeof proposed==="string"&&(!advance||!old[field]?.trim()||data.currentRevision===0||old[field]===old.editorialBaseline?.fields[field]))next[field]=proposed;
        }
        if(item.websiteComposition&&!old.websiteComposition)next.websiteComposition=item.websiteComposition;
        return next;
      });
      setGenerationMessage("Site content is ready. Review your wording and save your private draft.");
    }catch(cause){
      setGenerationMessage(mutationErrorMessage(cause,"Site content generation could not finish. Edit the wording manually or reload generation status."));
    }finally{setGenerating(false);generationStatus.reload();}
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
    if(busy||!data.canPublish||revisionConflict)return;
    setError("");
    if(artworkGaps.length){
      setError("Confirm artwork descriptions, usage rights and child privacy before reviewing website copy.");
      return;
    }
    const submitted=content;
    const outcome=await mutation.run(()=>saveSiteWebsiteAndBrand({data:{
      siteId:data.siteId,operation:"save",expectedRevision:editor.revision,
      expectedBrandVersionId:brandPointerRef.current,
      brand:brandConfig(submitted),content:submitted,
    }}),{
      successMessage:result=>result.website.status==="review_required"
        ?"Protected institutional copy has been held for CAN review. Site Brand and submitted copy were saved together."
        :"Reviewed Site-owned copy and Site Brand saved together. Publish or republish separately in Prepare.",
      commandErrorMessage:"Site Brand and website copy were not saved. No partial changes were committed.",
    });
    if(outcome.status==="saved"||outcome.status==="refresh-failed"){
      acceptSavedBrand(outcome.value.brand);
      markSaved(submitted,outcome.value.website.revision);
    }else if(outcome.status==="failed"&&
      normalizeClientError(outcome.error).code==="CONFLICT"){
      await router.invalidate().catch(()=>undefined);
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
      if(restored){
        const restoredCopy=prepareWebsiteEditorContent(restored,data.siteName);
        // Website history does not own Site branding. Restoring copy must
        // preserve the current canonical identity and media selection.
        markSaved({...restoredCopy,branding:{...content.branding,
          templateId:restoredCopy.branding.templateId}},outcome.value.revision,true);
      }
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
      setContent(old => ({ ...old, branding: { ...old.branding, ...(field==="heroImage"?{sharedHeroPhoto:null}:{}), [field]: {
        dataUrl, altText: "", rightsConfirmed: false, childImageConsent: "unconfirmed",
      } } }));
    } catch (caught) {
      setError(mutationErrorMessage(caught, "Artwork could not be prepared"));
    } finally { setPreparingArtwork(false); }
  }

  return <section aria-label="Website content setup">

    {revisionConflict && <WorkspaceNotice tone="attention" className="mt-3 space-y-2">
      <p className="font-semibold">A newer website revision ({data.currentRevision}) is available.</p>
      <p>Your unsaved edits remain here. Saving is paused to prevent overwriting someone else's revision.
        You can review or copy your current wording, then load the latest saved version.</p>
      <Button variant="outline" type="button" onClick={() => dirty ? setConfirmation({kind:"reload"}) : loadLatestRevision()}
        className="min-h-11">Discard my edits and load latest</Button>
    </WorkspaceNotice>}
    {!data.canEdit && <WorkspaceNotice tone="attention" className="mt-3">
      This Site is view-only for your current assignment. A private Site Brand and
      website draft require an authorized editor. Public publication is reviewed separately.
    </WorkspaceNotice>}
    {data.localContentStatus === "review_required" && <WorkspaceNotice tone="attention" className="mt-3">
      Your latest proposed wording includes a protected claim. It is held for review;
      the last published church copy remains unchanged.
    </WorkspaceNotice>}

    {artworkGaps.length > 0 &&
      <div role="status" className="mt-3 border p-3 text-sm">
        <p className="font-semibold">Some images need attention.</p>
        <p className="mt-1">Complete these items before using the images:</p>
        <ul className="mt-2 list-disc pl-5">{[...new Set(artworkGaps)].map(gap =>
          <li key={gap}>{gap}</li>)}</ul>
      </div>}
    {error && <WorkspaceNotice tone="danger" className="mt-3">{error}</WorkspaceNotice>}
    <MutationFeedback state={mutation} className="mt-3" pendingMessage="Saving website changes..."/>
    <div className="space-y-5">
      {step===0&&<WebsiteBrandIdentityStep
        displayName={brandDisplayName}
        currentRevision={data.currentBrandRevision}
        canEdit={data.canEdit} busy={busy}
        direction={brandDirection} recommendation={brandRecommendation}
        onDisplayNameChange={setBrandDisplayName}
        onDirectionChange={id=>setContent(old=>({...old,
          branding:{...old.branding,brandDirectionId:id}}))}/>}
      {step === 1 && <div className="space-y-5">
        <h3 className="font-serif text-2xl font-semibold">Choose a layout</h3>

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

      </div>}

      {step===3&&<WebsiteContentConsentStep
        value={content.contentReuseConsent??"unselected"}
        onChange={choice=>setContent(old=>{
          if(choice==="denied"){
            // An explicit No clears the editable draft, not saved version history.
            // A subsequent save creates a new revision; previous revisions persist.
            const cleared={...old,contentReuseConsent:"denied" as const,
              editorialBaseline:undefined,leadershipMembers:[]};
            for(const field of Object.keys(siteLocalContentLimits) as SiteLocalTextField[])
              cleared[field]="";
            return cleared;
          }
          if(old.contentReuseConsent==="granted")return old;
          const baseline=createSiteWebsiteStarterContent(data.siteName, data.siteExperienceProfile);
          const withStarter={...old,contentReuseConsent:"granted" as const,
            editorialBaseline:old.editorialBaseline??baseline.editorialBaseline};
          if(data.currentRevision===0||old.contentReuseConsent==="denied"){
            for(const field of websiteStarterFieldIds) {
              const suggestion = baseline[field];
              if (!(withStarter[field] ?? "").trim() && typeof suggestion === "string")
                withStarter[field] = suggestion;
            }
            return prepareWebsiteCopyFromSiteInformation(withStarter,data.siteStoryCopyCandidates);
          }
          return withStarter;
        })}
        disabled={busy||!data.canEdit}
        hasSavedContent={data.currentRevision>0}/>}
      {step===4&&<WebsiteSiteContentStep data={data} content={content}
        setContent={setContent} busy={busy}/>}
      {step===4&&content.contentReuseConsent==="granted"&&<div className="space-y-2 border p-3">
        <p role="status" className="text-sm">{generating?"Generating Site content…":generationMessage||generationStatus.error||generationStatus.preview?.eligibility.message||"Checking generation availability…"}</p>
        <Button type="button" disabled={!canSave||!generationStatus.preview?.eligibility.allowed} loading={generating} loadingLabel="Generating content…" onClick={()=>{
          if(window.confirm("Generate and replace the five main website text fields? Saved versions remain available."))void generateContent();
        }}>Generate Site Content</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={generationStatus.reload}>Reload generation status</Button>
        {generationStatus.preview&&!generationStatus.preview.eligibility.allowed&&<p role="status" className="text-xs text-muted-foreground">{generationStatus.preview.eligibility.message} You can continue with manual content.</p>}
      </div>}
      {step === 2 && <WebsiteVisualIdentityStep
        data={data} content={content} brandDirection={brandDirection} busy={busy}
        setContent={setContent} onSelectArtwork={selectArtwork}/>}
      {step===5&&<WebsiteReviewStep
        data={data} content={content} draftPreview={draftPreview}
        dirty={dirty} editorRevision={editor.revision}
        revisionConflict={revisionConflict} busy={busy}
        previewPending={previewPending} previewError={previewError}
        shareMessage={shareMessage} allowPublication={allowPublication}
        onPreview={()=>{void previewCurrentDraft();}}
        onShareMessage={setShareMessage}
        onSubmit={()=>{void submit();}}
        onRestore={revision=>dirty
          ?setConfirmation({kind:"restore",revision})
          :void restore(revision)}/>}
      {!data.draftStorageReady && <WorkspaceNotice tone="attention">
        <strong>Saving is currently unavailable.</strong> You can still preview your website. Contact support to restore saving.
      </WorkspaceNotice>}
      <ActionDialog open={confirmation!==null}
        title={confirmation?.kind==="reload" ? "Discard changes and load latest?" : "Restore an earlier website revision?"}
        description="Your unsaved changes will be lost. Saved versions will remain available."
        confirmLabel={confirmation?.kind==="reload" ? "Discard edits and reload" : "Restore revision"}
        destructive pending={busy} onClose={()=>setConfirmation(null)}
        onConfirm={()=>{
          const action=confirmation;
          setConfirmation(null);
          if(action?.kind==="reload") loadLatestRevision();
          else if(action?.kind==="restore") void restore(action.revision);
        }} />
      {!canSave && !busy && <p role="status" className="text-sm text-muted-foreground">{saveBlockReason}</p>}
      <ActionFooter layout="inline" className="justify-between border-t border-border/60 pt-5">
        <Button type="button" variant="outline" disabled={busy || step === 0}
          onClick={()=>onStepChange(Math.max(0,step-1))}>Back</Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" type="button"
            disabled={!canSave}
            onClick={()=>void saveDraft("exit")}>Save &amp; Exit</Button>
          {step < 5 ? <Button type="button"
            disabled={!canSave||(step===3 && (content.contentReuseConsent??"unselected")==="unselected")}
            onClick={()=>step===3?void generateContent(true):onStepChange(Math.min(5,step+1))}>Continue</Button>
            : <Button type="button" disabled={!canSave}
              loading={mutation.pending} loadingLabel="Saving private draft…"
              onClick={()=>void saveDraft("finish")}>Save & Finish</Button>}
        </div>
      </ActionFooter>
    </div>
  </section>;
}
