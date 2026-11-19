import { LaunchPreviewSharing } from "@/components/launch-studio/LaunchPreviewSharing";
import { siteBrandDirections, brandRecommendedLayout, brandRecommendedPalette } from "@/domain/site-brand-direction";
import { siteFontCatalog, type SiteFontId, resolveSiteTheme, sitePaletteIds, siteTypographyIds, type SiteTypographyId, type SiteTemplateId } from "@/domain/site-theme";
import { WebsiteTemplateGallery } from "@/components/launch-studio/WebsiteTemplateGallery";
import { SiteContentChannelEditor } from "@/components/launch-studio/SiteContentChannelEditor";
import { SchoolBrandPreview } from "@/components/launch-studio/SchoolBrandPreview";
import { privateWebsitePreviewUrl } from "@/domain/private-website-preview";
import { schoolBrandDesigns } from "@/domain/school-brand-identity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LaunchSiteFrame } from "@/components/launch-studio/LaunchSiteFrameV61";
import { DisclosureSection } from "@/components/workspace/disclosure-section";
import { WebsiteArtworkField } from "@/components/launch-studio/WebsiteArtworkField";
import { Link } from "@tanstack/react-router";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { normalizeClientError } from "@/lib/client-error";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { WorkspaceNotice, WorkspacePanel, StatusBadge, ActionFooter, type StatusTone } from "@/components/workspace";
import { GuidedSetupShell } from "@/components/workflow";
import { Eye } from "lucide-react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { useLaunchUnsavedChanges } from "@/components/launch-studio/useLaunchUnsavedChanges";
import {
  prepareWebsiteEditorContent, restoreOriginalWebsiteField, websiteStarterFieldIds, siteLocalContentLimits, siteLocalImageMaxBytes,
  siteLocalImagePublicationGaps, type SiteLocalContent, type SiteLocalTextField,
} from "@/domain/site-local-content";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { prepareSchoolWebsite, getPartnerWebsitePreviewView, previewChurchWebsiteDraft, saveChurchWebsiteDraft, publishChurchWebsiteContent, restoreChurchWebsiteContent } from "@/modules/sites/site-website-preview.functions";
import { ChurchSourceSuggestionReview } from "@/components/operations/ChurchSourceSuggestionReview";
import {SchoolMediaFolderManager} from "@/components/operations/SchoolMediaFolderManager";
import {LaunchWebsiteEditorHandoff} from "@/components/operations/LaunchWebsiteEditorHandoff";
import {siteProgramSelectionSchema} from "@/lib/route-search";
import { z } from "zod";

export const websiteStudioStepIds = ["brand", "wireframe", "visual", "content", "review"] as const;
const legacyWebsiteSteps = ["welcome","template","identity","photos","preview"] as const;
type LegacyWebsiteStep = (typeof legacyWebsiteSteps)[number];
function resolveWebsiteStep(step:typeof websiteStudioStepIds[number] | LegacyWebsiteStep | undefined):
  typeof websiteStudioStepIds[number] {
  if (!step) return "brand";
  switch(step) {
    case "welcome": return "brand";
    case "template": return "wireframe";
    case "identity": case "photos": return "visual";
    case "preview": return "review";
    default: return step;
  }
}
export const websiteSearchSchema=siteProgramSelectionSchema.extend({
  // Preserve supplied selectors for explicit validation; never silently omit
  // an invalid Site and open the editor under a different active membership.
  siteId:z.string().optional(),
  programId:z.string().optional(),
  returnGrantId:z.string().optional(),
  returnToHub:z.boolean().optional(),
  returnToSettings:z.boolean().optional(),
  step:z.union([z.enum(websiteStudioStepIds),z.enum(legacyWebsiteSteps)]).optional(),
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
  selection: { siteId?:string; programId?:string; returnGrantId?:string; returnToHub?:boolean; returnToSettings?:boolean; step?:typeof websiteStudioStepIds[number] | LegacyWebsiteStep };
  studio?: boolean;
  onStepChange?: (step:number)=>void;
}) {
  const [localStep,setLocalStep]=useState(0);
  const requestedStep=websiteStudioStepIds.indexOf(resolveWebsiteStep(selection.step));
  // Re-entry starts at Brand Identity, legacy bookmarked steps resolve to the new flow.
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
    <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-7">
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <main className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Establish / Website &amp; Brand</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold">
            {data.host?["Choose your Brand Identity","Choose your Wireframe","Design your Visual Identity",
              "Tell Your Story","Review & Finish"][step]:"Prepare your private website address"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            One Site-owned, revisioned private website. Draft changes never open enrollment, approve a school or publish content.
          </p>
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
        </main>
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
              Save an editable website draft. Any public release or protected school claim follows its separate review and approval process.
            </p>
          </section>
        </aside>
      </div>
    </div>
  </LaunchSiteFrame>;
  return <WorkspaceShell
    eyebrow="Website & Brand Studio"
    title={data.siteName + " · website & brand"}
    subtitle={data.organizationName + " · one local identity for your hosted website and reusable school materials"} actions={returnToLaunch}>
    <GuidedSetupShell
      title="Build your school website and brand together"
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

function WebsiteInformationChecklist({ data }: {
  data: Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>
}) {
  const readiness = data.publicInformationReadiness;
  const required = readiness.gaps.filter(gap => gap.required);
  const optional = readiness.gaps.filter(gap => !gap.required);
  return <section aria-labelledby="website-readiness-title"
    className="mt-6  border border-border/70 bg-card p-6 shadow-sm">
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
      <div className=" border p-3 text-sm">
        <p className="font-semibold">Website marketing</p>
        <p className="mt-1 text-muted-foreground">{readiness.marketing === "published"
          ? "Published in the Site registry; public host still needs verification"
          : "Not published"}</p>
      </div>
      <div className=" border p-3 text-sm">
        <p className="font-semibold">Information</p>
        <p className="mt-1 text-muted-foreground">{required.length === 0
          ? "Required parent information categories represented"
          : `${required.length} required information gaps`}</p>
      </div>
      <div className=" border p-3 text-sm">
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
            <ul className="mt-2 divide-y  border">
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

/** An authorized Site editor can reconcile Launch and Settings values with the
 * independently reviewed fields actually eligible for the public website.
 * This is a read-only mapping, never an alternative publisher or CMS. */
function WebsiteSourceMappingPanel({data}: {
  data: Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>;
}) {
  const mapping = data.sourceMapping;
  const sitePublished = data.status === "published";
  type MappingRow = {label:string;source:string;status:string;tone:StatusTone;details:string};
  const approvalStatus = (review:typeof mapping.physicalAddressReview,publicVisible:boolean) =>
    publicVisible
      ? sitePublished ? "Reviewed and publicly eligible" : "Reviewed; Site publication pending"
      : review === "source_changed" ? "Changed since last review"
      : review === "expired" ? "Review expired"
      : review === "withdrawn" ? "Approval withdrawn"
      : review === "invalid_review" ? "Review needs correction"
      : review === "approved" ? "Reviewed; not displayed"
      : "Independent review required";
  const rows:MappingRow[] = [
    {label:"School name and organization",source:"Canonical Site profile",
      status:sitePublished?"Site identity published":"Saved Site identity",
      tone:sitePublished?"success":"info",
      details:data.siteName+" · "+data.organizationName},
    {label:"Physical school address",source:"School profile · Location",
      status:mapping.physicalAddressSaved
        ? approvalStatus(mapping.physicalAddressReview,mapping.publicAddressVisible)
        : "No validated address saved",
      tone:mapping.publicAddressVisible?"success":mapping.physicalAddressSaved?"attention":"neutral",
      details:"A saved location never proves opening authority. Public display requires separate identity review."},
    {label:"Public contact information",source:"School profile · Contact",
      status:mapping.contactSaved
        ? approvalStatus(mapping.contactReview,mapping.publicContactVisible)
        : "No public contact channel saved",
      tone:mapping.publicContactVisible?"success":mapping.contactSaved?"attention":"neutral",
      details:"Only a reviewed school contact is eligible for publication. Private staff contact details are excluded."},
    {label:"School and community context",source:"Launch · Site information",
      status:mapping.schoolContextSaved?"Saved for planning":"Not configured",
      tone:mapping.schoolContextSaved?"info":"neutral",
      details:"Site type, host church and reference website stay private; affiliations are not inferred from these fields."},
    {label:"Learning interests and delivery intent",source:"Launch · Learning preferences",
      status:mapping.learningIntentSaved?"Saved for private preview":"Not configured",
      tone:mapping.learningIntentSaved?"info":"neutral",
      details:"Proposed grades, delivery mode and program interests never become published offerings."},
    {label:"Academic programs",source:"Reviewed Program marketing",
      status:data.approvedAcademicCount
        ? data.approvedAcademicCount+" reviewed Program"+(data.approvedAcademicCount===1?"":"s")
        : "No approved academic listings",
      tone:data.approvedAcademicCount?"success":"neutral",
      details:"Grades, academic summaries, school-day schedules and Apply eligibility come from their separate approval services."},
    {label:"Website blocks and placement",source:"Site content channel configuration",
      status:mapping.contentChannelsPublished
        ? "Published configuration · revision "+mapping.contentChannelPublishedRevision
        : "Published blocks not configured",
      tone:mapping.contentChannelsPublished?"success":"neutral",
      details:"Private block revision "+mapping.contentChannelDraftRevision+
        ". Saving a private layout never publishes it. Live pages read only the published configuration."},
    {label:"Website theme, story and artwork",source:"Website & Brand Studio",
      status:data.currentRevision===0?"No saved website revision":
        "Latest revision "+data.currentRevision+" · "+(
          data.localContentStatus==="published"?"published":
          data.localContentStatus==="draft"?"private draft":"requires review"),
      tone:data.localContentStatus==="published"?"success":
        data.localContentStatus==="review_required"?"attention":"info",
      details:"Artwork requires verified usage rights and child consent. Published pages use the latest independently eligible copy, not a private draft."},
  ];
  return <WorkspacePanel title="Launch and configuration mapping"
    description="See where the website gets each fact and why some saved setup data is not public. This view never changes publication or approval.">
    <dl className="divide-y border border-border/70">
      {rows.map(row=><div key={row.label} className="grid gap-2 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-5">
        <dt className="font-medium text-sm">{row.label}
          <span className="mt-1 block text-xs font-normal text-muted-foreground">{row.source}</span>
        </dt>
        <dd className="min-w-0 space-y-2">
          <StatusBadge tone={row.tone}>{row.status}</StatusBadge>
          <p className="text-sm leading-6 text-muted-foreground break-words">{row.details}</p>
        </dd>
      </div>)}
    </dl>
    <p className="mt-4 text-xs leading-5 text-muted-foreground">A published website address, a saved brand revision, public hosting reachability, and eligibility to accept applications are separate verifications. Changes in Launch or Settings do not bypass review.</p>
  </WorkspacePanel>;
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
  return <section aria-labelledby="school-website-design-readiness" className="mt-6  border border-border/70 bg-card p-6 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Website quality</p>
    <h2 id="school-website-design-readiness" className="mt-2 font-serif text-2xl font-semibold">Make this site feel like your school</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
      A strong school website combines your own story and photography with independently
      approved programs and family information. These checks are shared by every CAN OS school;
      they are editorial guidance, not a publication or operating authorization.
    </p>
    <p className="mt-3 text-sm font-semibold" role="status">{completed} of {items.length} content-quality signals represented</p>
    <ul className="mt-4 grid gap-3 md:grid-cols-2">
      {items.map(item=><li key={item.title} className=" border p-4">
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
  return <section aria-labelledby="partner-preview-title" className="mt-6  border border-border/70 bg-card p-6 shadow-sm">
    <h2 id="partner-preview-title" className="flex items-center gap-2 font-serif text-2xl font-semibold"><Eye className="size-5 text-primary" /> {draftPreview ? "Preview of current changes · not saved" : !saved ? "No saved website design yet" : data.localContentStatus === "published" ? "Latest saved and published website" : "Latest saved private design · revision " + data.currentRevision}</h2>
    <p className="mt-2 text-sm text-muted-foreground">This read-only preview uses the same design as the hosted site. It does not submit forms or publish changes.</p>
    {pages.length > 0 && <div role="group" aria-label="Preview a website page" className="mt-4 flex flex-wrap gap-2">
      {pages.map(([path]) => <Button variant="outline" key={path} type="button" aria-pressed={selected === path}
        onClick={() => setSelected(path)} className=" border px-3 py-2 text-sm aria-pressed:bg-primary aria-pressed:text-primary-foreground">
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
  data, step, onStepChange, allowPublication,
}: {
  data: Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>;
  step: number;
  onStepChange: (step: number) => void;
  allowPublication: boolean;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState(() => {
    const initial = prepareWebsiteEditorContent(data.editingContent, data.siteName);
    return { content: initial, saved: initial, revision: data.currentRevision, siteId: data.siteId };
  });
  const content = editor.content;
  const brandRecommendation = data.siteStoryRecommendation;
  const brandDirection = content.branding.brandDirectionId ?? null;
  const setContent: Dispatch<SetStateAction<SiteLocalContent>> = update =>
    setEditor(previous => ({ ...previous, content: typeof update === "function"
      ? update(previous.content) : update }));
  const dirty = JSON.stringify(content) !== JSON.stringify(editor.saved);
  const revisionConflict = editor.siteId === data.siteId && editor.revision !== data.currentRevision;
  const releaseNavigation = useLaunchUnsavedChanges(dirty);
  const [preparingArtwork, setPreparingArtwork] = useState(false);
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed || preparingArtwork;
  const artworkGaps = [content.branding.heroImage, content.branding.logoImage ?? null]
    .flatMap(siteLocalImagePublicationGaps);
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
    if (busy || !data.canPublish || !data.draftStorageReady || revisionConflict) return;
    setError("");
    const submitted = content;
    const outcome = await mutation.run(() => saveChurchWebsiteDraft({
      data: { content: submitted, siteId: data.siteId, expectedRevision: editor.revision },
    }), { successMessage: "Private website draft saved. Publication and enrollment states are unchanged.",
      commandErrorMessage: "Could not save the private website draft." });
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
      normalizeClientError(outcome.error).code === "CONFLICT") {
      // Surface the current revision without discarding what this editor typed.
      await router.invalidate().catch(() => undefined);
    }
  }

  async function restore(revision: number) {
    if (busy || revisionConflict) return;
    if (dirty && !window.confirm("Restoring an older revision will discard unsaved changes. Continue?")) return;
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
  const textField = (field: typeof churchFields[number]) => {
    const starter = content.editorialBaseline?.fields[field.key as typeof websiteStarterFieldIds[number]];
    const suggested = data.siteStoryCopyCandidates.find(item => item.field === field.key);
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
      {suggested && <div className="mt-3 border bg-muted/20 p-3">
        <p className="text-xs font-semibold">Suggested from Site Information</p>
        <p className="mt-1 text-xs text-muted-foreground">{suggested.reason}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm">{suggested.text}</p>
        <Button variant="outline" type="button" className="mt-3 min-h-11"
          disabled={busy || !data.canPublish || content[field.key] === suggested.text}
          onClick={()=>setContent(old=>({...old,[field.key]:suggested.text}))}>
          {content[field.key] === suggested.text ? "Suggestion applied" : "Apply suggestion"}
        </Button>
      </div>}
      {typeof starter === "string" && <p className="mt-2 text-xs text-muted-foreground">
        {changed ? "Personalized copy. Reset restores the original prepared wording for this field." :
          "Prepared starting copy. Edit anything, or keep it as written after review."}
      </p>}
    </div>;
  };

  return <section aria-label="Website content setup">
    {data.demonstration && !data.editingContent && <div role="note" className="mt-3  border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-950">
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
    {!data.canPublish && <WorkspaceNotice tone="attention" className="mt-3">
      You can preview this Site, but your current verified Site assignment has not
      been granted local website publishing. Ask the Site administrator to assign
      that specific capability; CAN academic approval is not required for church copy.
    </WorkspaceNotice>}
    {data.localContentStatus === "review_required" && <WorkspaceNotice tone="attention" className="mt-3">
      Your latest proposed wording includes a protected claim. It is held for review;
      the last published church copy remains unchanged.
    </WorkspaceNotice>}
    {data.approvedPhotoCount === 0 && !content.branding.heroImage && <p role="status" className="mt-3 border p-3 text-sm">Using illustrative template images. No school photography selected.</p>}
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
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Choose an editorial direction. Your saved Site Story can guide a suggestion, but this choice never verifies programs, staff or academic outcomes.</p>
          {data.siteStoryRevision
            ? <p className="mt-2 text-xs text-muted-foreground">Saved Site Story source: {new Date(data.siteStoryRevision).toLocaleDateString()}</p>
            : <p className="mt-2 text-xs text-muted-foreground">No saved Site Story available. You can still choose a direction.</p>}
        </div>
        <fieldset disabled={busy || !data.canPublish}>
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
                  {brandRecommendation===direction.id?"Suggested from your Story":""}
                </span>}
              </Button>;
            })}
          </div>
        </fieldset>
        <p className="text-xs text-muted-foreground">{brandRecommendation
          ?"A keyword suggestion from your saved Story is not a required choice or verified school claim."
          :"No recommendation appears without matching Story evidence."}</p>
        <p className="text-xs text-muted-foreground">Brand Identity is saved with this Site's versioned website draft. A broader Site-brand service is not connected yet.</p>
      </section>}
      {step === 1 && <div className="space-y-5">
        <h3 className="font-serif text-2xl font-semibold">Choose your wireframe</h3>
        <p className="text-sm text-muted-foreground">Compare seven structures in grayscale. Colors, typography and imagery come next.</p>
        {brandDirection && <div className="flex flex-wrap items-center justify-between gap-3 border p-3 text-sm">
          <span>Suggested structure: <strong>{schoolBrandDesigns[brandRecommendedLayout(brandDirection)].name}</strong></span>
          <Button type="button" variant="outline" disabled={busy || !data.canPublish}
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
          disabled={busy || !data.canPublish}/>
        <p className="text-xs text-muted-foreground">Your design and brand are saved together. Switching designs keeps school copy, photos, colors and fonts until you explicitly apply that design's recommended branding.</p>
      </div>}

      {step === 3 && <div className="space-y-5">
        <div>
          <h3 className="font-serif text-2xl">Your school story is ready to make your own.</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Prepared copy uses your Site name. Optional suggestions draw on saved Site Information
            and never overwrite a field until you explicitly apply them. Restore Original affects only that field.
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Prepared words are suggestions, not verified promises about programs, services, leaders or opening status.
            Please review them before publishing. Your actual academic and admissions information comes from CAN OS.
          </p>
        </div>
        {data.siteStorySourceChoices && <div className="border bg-muted/20 p-4 text-sm" role="note">
          <p className="font-semibold">Your original Site Story remains private</p>
          <p className="mt-2 text-muted-foreground">
            Values: {data.siteStorySourceChoices.values.join(", ") || "not selected"}.
            Priorities: {data.siteStorySourceChoices.motivations.join(", ") || "not selected"}.
            Website copy suggestions are editable aspirations, not verified claims.
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
                canPublish={data.canPublish}
                onSaved={() => { void router.invalidate(); }} />
              </div>
            : <WorkspaceNotice tone="attention" className="mt-4">
                Your verified Site grant allows previewing but not editing website
                sections. Ask a Site Administrator for local website publishing access.
              </WorkspaceNotice>}
        </details>
      </div>}
      {step === 2 && <div className="space-y-4">
        <div>
          <h3 className="font-serif text-2xl font-semibold">Create your visual identity</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Expand colors, typography, wordmark and imagery independently. Your chosen wireframe
            and website text remain unchanged when you adjust a visual option.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border bg-card p-4">
          <div>
            <p className="text-sm font-semibold">Suggested starting style</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use the palette and type pairing curated for {schoolBrandDesigns[content.branding.templateId ?? "heritage"].name}.
            </p>
          </div>
          <Button type="button" variant="outline" disabled={busy || !data.canPublish}
            onClick={()=>setContent(old=>{
              const design=schoolBrandDesigns[old.branding.templateId ?? "heritage"];
              return {...old,branding:{...old.branding,paletteId:design.recommendedPalette,
                typographyId:design.recommendedTypography,headingFontId:undefined,bodyFontId:undefined}};
            })}>Apply suggested style</Button>
        </div>
        <DisclosureSection title="Colors" description="All thirteen curated and contrast-checked palettes" defaultOpen>
          <fieldset disabled={busy || !data.canPublish}>
            <legend className="sr-only">Choose a color palette</legend>
            <div role="group" aria-label="School color palettes" className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {sitePaletteIds.map(id=>{
                const palette=resolveSiteTheme(id,content.branding.typographyId);
                const current=(content.branding.paletteId ?? "signature")===id;
                return <Button type="button" variant="outline" aria-pressed={current} key={id}
                  onClick={()=>setContent(old=>({...old,branding:{...old.branding,paletteId:id}}))}
                  className="h-auto min-h-16 w-full flex-col items-stretch gap-1 whitespace-normal border p-3 text-left text-sm capitalize aria-pressed:ring-2 aria-pressed:ring-primary">
                  <span className="mb-2 flex h-5 overflow-hidden" aria-hidden="true">
                    <span className="flex-1" style={{backgroundColor:palette.ink}}/>
                    <span className="flex-1" style={{backgroundColor:palette.secondary}}/>
                    <span className="flex-1" style={{backgroundColor:palette.accent}}/>
                    <span className="flex-1" style={{backgroundColor:palette.canvas}}/>
                  </span>
                  {id==="signature"?"CAN Signature":id.startsWith("brand-")
                    ?(schoolBrandDesigns[id.slice(6) as SiteTemplateId]?.name??"School")+" palette":id}
                </Button>;
              })}
            </div>
            {brandDirection && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border p-3 text-sm">
              <span>Suggested palette: <strong>{brandRecommendedPalette(brandDirection)}</strong></span>
              <Button type="button" variant="outline"
                onClick={()=>setContent(old=>({...old,branding:{...old.branding,paletteId:brandRecommendedPalette(brandDirection)}}))}>
                Apply suggested palette
              </Button>
            </div>}
            <p className="mt-4 text-xs text-muted-foreground">
              Custom colors are preview-only until individually validated, versioned and supported by the public renderer.
            </p>
          </fieldset>
        </DisclosureSection>
        <DisclosureSection title="Typography" description="Actual rendered font stacks and pairing choices" defaultOpen>
          <fieldset disabled={busy || !data.canPublish} className="space-y-4">
            <legend className="sr-only">Choose typography</legend>
            <Label className="block text-sm">
              <span className="font-medium">Curated typography pairing</span>
              <Select value={content.branding.typographyId ?? "editorial"}
                onChange={event=>setContent(old=>({...old,branding:{...old.branding,
                  typographyId:event.target.value as SiteTypographyId,headingFontId:undefined,bodyFontId:undefined}}))}
                className="mt-2 min-h-11 w-full border bg-background px-3">
                {siteTypographyIds.map(id=><option key={id} value={id}>
                  {id==="editorial"?"Editorial serif + modern sans":
                    id==="traditional"?"Heritage serif + clean sans":"Contemporary humanist sans"}
                </option>)}
              </Select>
            </Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["headingFontId","bodyFontId"] as const).map(key=><Label key={key} className="block text-sm">
                {key==="headingFontId"?"Heading font":"Body font"}
                <Select className="mt-2 min-h-11 w-full border bg-background px-3"
                  value={content.branding[key] ?? ""}
                  onChange={event=>setContent(old=>({...old,branding:{...old.branding,
                    [key]:event.target.value?event.target.value as SiteFontId:undefined}}))}>
                  <option value="">Use pairing default</option>
                  {Object.entries(siteFontCatalog).map(([id,font])=><option key={id} value={id}>{font.label}</option>)}
                </Select>
              </Label>)}
            </div>
            <div className="grid gap-3 border-t pt-4 sm:grid-cols-2" aria-label="Actual resolved font previews">
              {(["headingFontId","bodyFontId"] as const).map(key=>{
                const theme=resolveSiteTheme(content.branding.paletteId,content.branding.typographyId,
                  content.branding.headingFontId,content.branding.bodyFontId,content.branding.templateId);
                const chosen=content.branding[key];
                const fontFamily=key==="headingFontId"?theme.displayFont:theme.bodyFont;
                return <div key={key} className="min-w-0 border bg-background p-3">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {key==="headingFontId"?"Heading":"Body"} · {chosen?siteFontCatalog[chosen].label:"Curated pairing"}
                  </p>
                  <p className="mt-3 break-words text-2xl" style={{fontFamily}}>Learn with purpose.</p>
                  <p className="mt-2 break-words text-sm" style={{fontFamily}}>Every Site has a story worth sharing.</p>
                </div>;
              })}
            </div>
          </fieldset>
        </DisclosureSection>
        <DisclosureSection title="Wordmark & Logo" description="Preview the Site wordmark and upload approved logo artwork">
          <div className="space-y-4">
            <SchoolBrandPreview siteId={data.siteId} schoolName={data.siteName} branding={content.branding}/>
            <WebsiteArtworkField field="logoImage" value={content.branding.logoImage ?? null}
              disabled={busy || !data.canPublish} onSelect={selectArtwork}
              onChange={next=>setContent(old=>({...old,branding:{...old.branding,logoImage:next}}))}/>
          </div>
        </DisclosureSection>
        <DisclosureSection title="Imagery" description="Site-owned artwork, privacy rights and approved media">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Template gallery samples are fictional. They will never be added to your real Site's photo library.
              Uploaded artwork stays out of all previews until the rights and consent checks pass.
            </p>
            <WebsiteArtworkField field="heroImage" value={content.branding.heroImage}
              disabled={busy || !data.canPublish} onSelect={selectArtwork}
              onChange={next=>setContent(old=>({...old,branding:{...old.branding,heroImage:next}}))}/>
            <DisclosureSection title="Import photos from a Site folder (optional)">
              <SchoolMediaFolderManager siteId={data.siteId} canPublish={data.canPublish}
                enabled={data.mediaUploadsEnabled}/>
            </DisclosureSection>
          </div>
        </DisclosureSection>
      </div>}
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
            ).then(() => setShareMessage("Preview link copied. Reviewers must sign in with their own authorized school account."))
              .catch(() => setShareMessage("Copy the address from Open full-page preview; clipboard permission was unavailable."))}>
            Copy preview link
          </Button>}
        </div>
        <p className="text-xs text-muted-foreground">The full-page link uses your existing CAN OS sign-in. It never publishes a draft. {data.currentRevision > 0 ? "It shows the latest saved revision." : "Until the first save, it shows a clearly marked sample, not your unsaved edits."} {dirty ? "You have unsaved edits; save them before sharing the latest design." : ""}</p>
        {data.currentRevision === 0 && <p className="border p-3 text-sm" role="status">No saved website draft exists yet. The full-page preview shows an illustrative sample. You can test unsaved changes below; sharing your customized design requires saving.</p>}
        {shareMessage && <p role="status" className="border p-3 text-sm">{shareMessage}</p>}
        {previewError&&<WorkspaceNotice tone="danger">{previewError}</WorkspaceNotice>}
        <WebsitePreviewPanel data={data} draftPreview={draftPreview?.source === content ? draftPreview.rendered : null} />
        {!dirty && editor.revision > 0 && !revisionConflict
          ? <div className="flex flex-wrap items-center justify-between gap-3 border p-4">
              <div>
                <p className="text-sm font-semibold">Ready to show your proposed website?</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Share the latest saved snapshot without publishing the Site or opening enrollment.
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
              {data.canPublish && version.status === "published" && version.revision < data.currentRevision &&
                <Button variant="outline" type="button" disabled={busy || revisionConflict} onClick={() => void restore(version.revision)}
                  className=" border px-3 py-1 text-xs disabled:opacity-50">
                  Restore as new revision
                </Button>}
            </li>)}
          </ul>
        </details>}
      </div>}
      {!data.draftStorageReady && <p role="alert" className="border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
        <strong>Private draft storage requires an update.</strong> This Cloudflare-connected database has not
        applied website migration 0077. Draft saving is unavailable until an authorized database
        migration is completed. You can still preview the website, but your changes are not saved.
      </p>}
      <ActionFooter layout="inline" className="justify-between border-t border-border/60 pt-5">
        <Button type="button" variant="outline" disabled={busy || step === 0}
          onClick={()=>onStepChange(Math.max(0,step-1))}>Back</Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" type="button"
            disabled={busy || !data.canPublish || !data.draftStorageReady || revisionConflict}
            onClick={()=>void saveDraft("exit")}>Save & Exit</Button>
          {step < 4 ? <Button type="button"
            onClick={()=>onStepChange(Math.min(4,step+1))}>Continue</Button>
            : <Button type="button" disabled={busy || !data.canPublish || !data.draftStorageReady || revisionConflict}
              loading={busy} loadingLabel="Saving private draft…"
              onClick={()=>void saveDraft("stay")}>Save private draft & finish</Button>}
        </div>
      </ActionFooter>
    </div>
  </section>;
}
