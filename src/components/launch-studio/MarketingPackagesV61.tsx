import { compactUuidUrlValue } from "@/domain/opaque-url-id";
import { siteAudienceNames } from "@/domain/site-audiences";
import { MarketingPackageWizardV61 } from "./MarketingPackageWizardV61";
import { marketingEditorReducer, type MarketingEditorView, type MarketingEditorState } from "./marketing-package-editor-state";
import { SiteGuideV61 } from "./SiteGuideV61";
import { MarketingPackageReleaseHistoryV61 } from "./MarketingPackageReleaseHistoryV61";
import { useMarketingPackageReadResources } from "./useMarketingPackageReadResources";
import { marketingPackageArchiveFiles } from "./marketing-package-archive-files";
import { MarketingPackageLibraryList } from "./MarketingPackageLibraryList";
import { createSiteMarketingPackageRelease, listSiteMarketingPackageReleases, listSiteMarketingReleases, getSiteMarketingReleaseOutput } from "@/modules/programs/site-marketing-artifacts.functions";
import { useReducer, useState, type SetStateAction } from "react";
import type { SiteProgramsAudiencesV61 } from "@/domain/site-launch-preferences";
import { MarketingMaterialPreviewV61 } from "./MarketingMaterialPreviewV61";
import { useRouter } from "@tanstack/react-router";
import { ArrowRight, Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActionDialog, ActionFooter, WorkspaceActionLink, WorkspaceNotice, WorkspacePanel, WorkspaceShell } from "@/components/workspace";
import {
  initialMarketingContent, marketingAudienceOptions, marketingFormatOptions,
  marketingPackageContentSchema, marketingPurposeOptions,
  outreachStepIdsV61, outreachStepIssueV61, initialOutreachPlanV61,
  outreachFormatsV61, composeOutreachDraftV61, outreachSourceChangedV61,
  type MarketingFormat, type MarketingPackageContent, type OutreachPlanV61,
} from "@/domain/marketing-package-v61";
import {
  archiveSiteMarketingPackageV61, createSiteMarketingPackageV61,
  deleteSiteMarketingPackageV61, duplicateSiteMarketingPackageV61,
  listSiteMarketingPackagesV61, readSiteMarketingSuggestionsV61,
  saveSiteMarketingPackageV61, selectSiteMarketingPackageBrandV61,
} from "@/modules/programs/site-marketing-packages-v61.functions";
import { useLaunchUnsavedChanges } from "./useLaunchUnsavedChanges";
import { downloadOriginalMarketingOutput, downloadMarketingPng, downloadMarketingPackageZip } from "./marketing-output-download";
import { packageReleaseIsDownloadableV61 } from "@/domain/marketing-package-release-v61";
import { MarketingPackageReleaseControlsV61 } from "./MarketingPackageReleaseControlsV61";
import { UniversalEngagementPublisher } from "./UniversalEngagementPublisher";
import { SiteEngagementLibrary } from "./SiteEngagementLibrary";
import { introduceModuleConfigV61, type IntroduceModuleV61 } from "@/domain/launch-introduce-v61";

type PackageRecord = Awaited<ReturnType<typeof listSiteMarketingPackagesV61>>[number];
type MarketingSuggestions = Awaited<ReturnType<typeof readSiteMarketingSuggestionsV61>>;

function message(error:unknown) {
  return error instanceof Error ? error.message : "The outreach action could not be completed.";
}

type MarketingPackagesV61Props = {
  siteId:string;siteName:string;initial:PackageRecord[];
  suggestions:MarketingSuggestions|null;onExit:()=>void;
  module?:IntroduceModuleV61;suggestionsUnavailable?:boolean;
  siteIntent?:SiteProgramsAudiencesV61|null;intentUnavailable?:boolean;
  siteRevision?:string|null;
};

/**
 * Each Site and Share module owns a separate working editor session.
 * React must discard private Package drafts, action dialogs, release previews,
 * and mutation feedback before rendering another Site's records.
 */
export function MarketingPackagesV61(props:MarketingPackagesV61Props) {
  return <MarketingPackagesV61Scoped
    key={props.siteId+":"+(props.module??"create-outreach")} {...props}/>;
}

function MarketingPackagesV61Scoped({siteId,siteName,initial,suggestions,onExit,
  module="create-outreach",suggestionsUnavailable=false,siteIntent=null,
  intentUnavailable=false,siteRevision=null}:MarketingPackagesV61Props) {
  const router=useRouter();
  const context=introduceModuleConfigV61[module];
  const purposeOptions=marketingPurposeOptions.filter(option=>context.purposes.includes(option.id));
  const starter=(purpose:MarketingPackageContent["purpose"])=>(
    suggestions?.[purpose]?.content??initialMarketingContent(siteName,purpose));
  const newPlan=(beneficiaries:OutreachPlanV61["beneficiaries"])=>
    ({...initialOutreachPlanV61(beneficiaries),
      ...(siteRevision?{sourceSiteRevision:siteRevision}:{})});
  const [packages,setPackages]=useState(initial);
  const [editor,dispatchEditor]=useReducer(marketingEditorReducer, {
    view: module==="create-outreach" ? "wizard" : "library",
    record:null,
    title:siteName+" outreach",
    content:{
      ...starter(context.defaultPurpose),
      plan:newPlan(siteIntent?.audienceIds??[]),
      formats:outreachFormatsV61(initialOutreachPlanV61().channels),
    },
    step:0,hasAuthoredCopy:false,previewFormat:"email",editingFormat:null,
  } satisfies MarketingEditorState);
  const {view,record,title,content,step,hasAuthoredCopy,previewFormat,editingFormat}=editor;
  const setView=(update:SetStateAction<MarketingEditorView>)=>dispatchEditor({type:"view",update});
  const setRecord=(update:SetStateAction<PackageRecord|null>)=>dispatchEditor({type:"record",update});
  const setTitle=(update:SetStateAction<string>)=>dispatchEditor({type:"title",update});
  const setContent=(update:SetStateAction<MarketingPackageContent>)=>dispatchEditor({type:"content",update});
  const setStep=(update:SetStateAction<number>)=>dispatchEditor({type:"step",update});
  const setPreviewFormat=(update:SetStateAction<MarketingFormat>)=>dispatchEditor({type:"previewFormat",update});
  const setEditingFormat=(update:SetStateAction<MarketingFormat|null>)=>dispatchEditor({type:"editingFormat",update});
  const [showArchived,setShowArchived]=useState(false);
  const [busy,setBusy]=useState(false);
  const [deleteCandidate,setDeleteCandidate]=useState<PackageRecord|null>(null);
  const [discardDialogOpen,setDiscardDialogOpen]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const {
    releases,setReleases,packageReleases,setPackageReleases,
    releasesLoading,setReleasesLoading,releasesUnavailable,setReleasesUnavailable,
    setReleaseRefreshKey,currentBrand,brandReadiness,setBrandRefreshKey,
    selectedBrandRevision,
  }=useMarketingPackageReadResources(siteId,view,record,setError);
  const [releaseRequestId,setReleaseRequestId]=useState(()=>crypto.randomUUID());
  const [compare,setCompare]=useState<{id:string;format:MarketingFormat;mimeType:string;body:string;releaseNumber:number}|null>(null);
  const dirty=(view==="wizard" || (view==="detail" && editingFormat!==null)) && (!record || title!==record.title ||
    JSON.stringify(content)!==JSON.stringify(record.content));
  const releaseNavigation=useLaunchUnsavedChanges(()=>dirty||busy,
    "Leave this outreach plan? Unsaved changes will be lost.");

  function open(recordToOpen:PackageRecord,editing=false) {
    dispatchEditor({type:"open",record:recordToOpen,editing,content:{
      ...recordToOpen.content,plan:recordToOpen.content.plan??{
        ...newPlan(siteIntent?.audienceIds??[]),
        recipients:recordToOpen.content.audiences,
      },
    }});
    setError("");setNotice("");
    setReleases([]);setPackageReleases([]);setReleasesLoading(!editing);
    setReleasesUnavailable(false);
    setReleaseRequestId(crypto.randomUUID());setCompare(null);
  }
  function start() {
    dispatchEditor({type:"start",title:siteName+" outreach",content:{
      ...starter(context.defaultPurpose),
      plan:newPlan(siteIntent?.audienceIds??[]),
      formats:outreachFormatsV61(initialOutreachPlanV61().channels),
    }});
    setError("");setNotice("");
  }
  function patch(value:Partial<MarketingPackageContent>) {
    dispatchEditor({type:"patch",patch:value});
    setError("");
  }

  async function run(action:()=>Promise<void>) {
    if(busy)return;
    setBusy(true);setError("");setNotice("");
    try { await action(); }
    catch(cause){setError(message(cause));}
    finally {setBusy(false);}
  }
  function updateList(saved:PackageRecord) {
    setPackages(previous=>[saved,...previous.filter(item=>item.id!==saved.id)]);
    setRecord(saved);
    // A newly saved draft is a different release intent. Uncertain retries
    // retain their requestId only while the same revision is being released.
    setReleaseRequestId(crypto.randomUUID());
  }
  async function saveCurrent(nextContent:MarketingPackageContent=content) {
    if(!record)throw new Error("Create the outreach plan before saving its details.");
    const parsed=marketingPackageContentSchema.parse(nextContent);
    const saved=await saveSiteMarketingPackageV61({data:{
      siteId,packageId:record.id,expectedRevision:record.revision,title,content:parsed,
    }});
    updateList(saved);
    return saved;
  }

  async function next() {
    const id=outreachStepIdsV61[step];
    if(!id)return;
    const issue=outreachStepIssueV61(id,title,content);
    if(issue){setError(issue);return;}
    if(step===5){
      const incomplete=outreachStepIdsV61.map((part,index)=>({
        index,issue:outreachStepIssueV61(part,title,content),
      })).find(item=>item.issue);
      if(incomplete){setStep(incomplete.index);setError(incomplete.issue!);return;}
    }
    if(!record&&brandReadiness!=="available"){
      setError("Save a Site Brand in Shape → Website & Brand before creating outreach.");
      return;
    }
    await run(async()=>{
      if(!record){
        const workingDraft=content;
        const created=await createSiteMarketingPackageV61({data:{siteId,title,purpose:content.purpose}});
        updateList(created);
        const parsed=marketingPackageContentSchema.parse(workingDraft);
        const saved=await saveSiteMarketingPackageV61({data:{
          siteId,packageId:created.id,expectedRevision:created.revision,title,content:parsed,
        }});
        updateList(saved);setContent(parsed);
        setStep(1);setNotice("Outreach draft saved.");
        return;
      }
      // The first draft is automatic; subsequent navigation must never
      // silently replace a message the operator has written or approved.
      const nextContent=step===4&&content.plan&&!hasAuthoredCopy
        ? {...content,...composeOutreachDraftV61(
            siteName,content.plan,siteIntent,suggestions?.[content.purpose]?.siteIdentity)}
        : content;
      const saved=await saveCurrent(nextContent);
      setContent(saved.content);
      if(step<5)setStep(value=>value+1);
      else {setView("detail");setNotice("Outreach plan saved. Materials are not generated or sent.");}
    });
  }
  async function saveMaterialOverride() {
    if(!record||!editingFormat)return;
    await run(async()=>{
      await saveCurrent();
      setEditingFormat(null);
      setNotice("Changes to this material were saved. Earlier generated versions are unchanged.");
    });
  }
  async function saveExit() {
    await run(async()=>{
      if(record)await saveCurrent();
      setView("library");setRecord(null);
      setNotice(record?"Package saved.":"No package created.");
    });
  }
  function discardWizard() {
    setDiscardDialogOpen(false);
    dispatchEditor({type:"discard"});setError("");setNotice("");
  }
  function leaveWizard() {
    if (dirty) { setDiscardDialogOpen(true); return; }
    discardWizard();
  }
  async function duplicate(selected:PackageRecord) {
    await run(async()=>{
      const copied=await duplicateSiteMarketingPackageV61({data:{siteId,packageId:selected.id}});
      updateList(copied);dispatchEditor({type:"duplicate",record:copied});
      setNotice("A separate editable draft was created.");
    });
  }
  async function setArchived(selected:PackageRecord) {
    await run(async()=>{
      const saved=await archiveSiteMarketingPackageV61({data:{
        siteId,packageId:selected.id,expectedRevision:selected.revision,archived:selected.status!=="archived",
      }});
      updateList(saved);setView("library");setRecord(null);
      setNotice(saved.status==="archived"?"Package archived.":"Package restored.");
    });
  }
  async function remove(selected:PackageRecord) {
    await run(async()=>{
      await deleteSiteMarketingPackageV61({data:{
        siteId,packageId:selected.id,expectedRevision:selected.revision,
      }});
      setPackages(current=>current.filter(item=>item.id!==selected.id));
      setRecord(null);setView("library");setDeleteCandidate(null);setNotice("Package deleted.");
    });
  }
  async function selectCurrentBrand(){
    if(!record||!currentBrand||record.brandVersionId===currentBrand.id)return;
    await run(async()=>{
      const saved=await selectSiteMarketingPackageBrandV61({data:{
        siteId,packageId:record.id,expectedRevision:record.revision,brandVersionId:currentBrand.id,
      }});
      updateList(saved);
      setNotice("Package updated to Brand v"+currentBrand.revision+". Existing releases remain unchanged.");
    });
  }
  async function releasePackage(){
    if(!record||releasesLoading||releasesUnavailable)return;
    await run(async()=>{
      const result=await createSiteMarketingPackageRelease({data:{
        siteId,packageId:record.id,expectedPackageRevision:record.revision,
        requestId:releaseRequestId,
      }});
      const versions=await listSiteMarketingPackageReleases({data:{siteId,packageId:record.id}});
      setPackageReleases(versions);
      setReleases(await listSiteMarketingReleases({data:{siteId,packageId:record.id}}));
      setReleaseRequestId(crypto.randomUUID());
      setNotice(result.created
        ? "Package Release v"+result.releaseNumber+" created with all "+result.formats.length+
          " selected materials. Earlier releases are unchanged."
        : "Package Release v"+result.releaseNumber+" was already created. No duplicate was generated.");
    });
  }
  async function downloadPackage(release:(typeof packageReleases)[number]){
    if(!packageReleaseIsDownloadableV61(release))return;
    await run(async()=>{
      const outputs=await Promise.all(release.outputs.map(item=>
        getSiteMarketingReleaseOutput({data:{siteId,releaseId:item.id}})));
      const files=marketingPackageArchiveFiles(release,outputs);
      downloadMarketingPackageZip(release.title,release.releaseNumber,files);
      setNotice("Downloaded the complete, original Package Release v"+release.releaseNumber+".");
    });
  }
  async function compareRelease(id:string,format:MarketingFormat,releaseNumber:number){
    await run(async()=>{
      const output=await getSiteMarketingReleaseOutput({data:{siteId,releaseId:id}});
      setCompare({id,format,mimeType:output.mimeType,body:output.content,releaseNumber});
    });
  }
  async function downloadRelease(id:string){
    await run(async()=>{
      const output=await getSiteMarketingReleaseOutput({data:{siteId,releaseId:id}});
      downloadOriginalMarketingOutput(output);
      setNotice("Original generated file downloaded.");
    });
  }
  async function downloadPng(id:string){
    await run(async()=>{
      const output=await getSiteMarketingReleaseOutput({data:{siteId,releaseId:id}});
      await downloadMarketingPng(output);
      setNotice("PNG created from this exact saved release.");
    });
  }
  async function copyCaption(id:string){
    await run(async()=>{
      const output=await getSiteMarketingReleaseOutput({data:{siteId,releaseId:id}});
      if(!output.plainText)throw new Error("No caption is saved with this release.");
      await navigator.clipboard.writeText(output.plainText);
      setNotice("The original social caption was copied.");
    });
  }
  async function exitLaunch() {
    releaseNavigation();
    await router.invalidate().catch(()=>undefined);
    onExit();
  }

  const visible=packages.filter(item=>context.purposes.includes(item.content.purpose) &&
    (showArchived?item.status==="archived":item.status!=="archived"));
  const currentSuggestion=suggestions?.[content.purpose]??null;
  const legacyReleases=releases.filter(item=>!item.packageReleaseId);
  const packageHandoff=record?.content.plan?.action==="attend-event" &&
    record.content.purpose==="event-invitation"
      ? {title:"Create an Interest Event",description:"Set the event details before inviting people.",
          href:(id:string,packageId:string)=>"/operations/interest-events/new?siteId="+
            encodeURIComponent(id)+"&packageId="+encodeURIComponent(packageId)} : null;
  const activePreviewFormat=content.formats.includes(previewFormat)?previewFormat:content.formats[0]??null;
  const downloadablePackageReleases=packageReleases.filter(packageReleaseIsDownloadableV61);
  const hasDownloadableMaterials=downloadablePackageReleases.length>0;
  const materialAvailabilityMessage=releasesUnavailable
    ? "We couldn't check your generated materials. Retry the history check before downloading or creating another version."
    : releasesLoading
      ? "Checking previously generated materials…"
      : hasDownloadableMaterials
        ? "Your reviewed materials can be downloaded. Nothing has been sent."
        : "Your plan is saved, but there are no complete materials to download yet. Review the previews and create materials first.";
  const titleText=view==="library"?context.libraryTitle:view==="wizard"?"Create Outreach":view==="share"?"Use & Share":view==="followup"?"Follow Up":record?.title??"Outreach Details";
  const guidePlan = view === "wizard" ? content.plan : record?.content.plan;
  const guideRecipients = (guidePlan?.recipients ?? []).slice(0, 2).map(id =>
    marketingAudienceOptions.find(option => option.id === id)?.label ?? id);
  const guideFocus = guidePlan?.highlights.find(item => item.role === "primary")?.label;
  const shareInsights = [
    guidePlan?.beneficiaries.includes("older_adults")
      ? "Participants and the people who help them decide may be different. Consider caregivers or trusted community connectors as possible recipients."
      : "The person who benefits isn't always the person who decides. Choose recipients with a clear reason to care.",
    "Lead with one purpose: invite feedback, introduce an opportunity, recruit support or share a verified update. Avoid implying a plan is already operating.",
    "One strong highlight is easier to remember than a list. Start with a real Site priority and keep any future offering framed as proposed.",
    "Choose one practical next action. A link, event or sign-up destination must actually exist and be authorized before sharing it.",
    "Pick channels the intended audience really uses. Selecting a channel here creates materials; it does not automatically send anything.",
    "Review how the message sounds to someone who knows nothing about your Site. The saved plan and downloadable material release are separate actions.",
  ] as const;
  const rail = <SiteGuideV61 guide={{
    summary: view === "wizard"
      ? context.guidance
      : view === "library"
        ? `You have ${visible.length} outreach plan${visible.length === 1 ? "" : "s"} in this view.`
        : view === "share"
          ? materialAvailabilityMessage
          : view === "followup"
            ? "Site-wide inquiries and events may include responses unrelated to this outreach plan."
            : "This plan records your choices. Materials retain the saved Brand version and wording used when generated.",
    highlights: [...guideRecipients, ...(guideFocus ? [guideFocus] : [])],
    insight: view === "wizard" ? shareInsights[step] ?? shareInsights[0]
      : view === "library" ? "Review an existing plan before creating another. A saved plan is not a sent message."
      : view === "share" ? "Check the full materials before downloading. Sending and delivery are handled through separate authorized actions."
      : view === "followup" ? "Treat Site-wide inquiries as leads to review, not proof that a specific message produced a response."
      : "A clear audience, one highlight and one next action make an outreach plan easier to use.",
    connection: view === "wizard"
      ? "Your message can build on saved Shape details only where permitted. Editing or saving here does not publish, send or open registration."
      : "Outreach plans, generated materials and actual delivery are tracked separately. Review the current status before making public claims.",
  }} />;
  return <WorkspaceShell title={titleText} eyebrow={context.eyebrow}
    subtitle={context.subtitle}
    width="wide" rail={rail}>
    <div className="mt-6 space-y-5">
      {error&&<p role="alert" className="border border-destructive bg-card p-4 text-sm text-destructive">{error}</p>}
      {notice&&<p role="status" className="border bg-card p-4 text-sm">{notice}</p>}
      {intentUnavailable&&<WorkspaceNotice tone="attention">
        We couldn't load your saved programs, audiences, or experiences. Refresh before choosing what to highlight.
      </WorkspaceNotice>}
      {suggestionsUnavailable&&<WorkspaceNotice tone="attention">
        Suggestions are unavailable. Saved packages are still available.
      </WorkspaceNotice>}
      {brandReadiness==="missing"&&<WorkspaceNotice tone="attention">
        Save your Site Brand in Shape → Website & Brand before creating materials.
        {" "}<a href={`/launch/site?siteId=${compactUuidUrlValue(siteId)}&module=website-brand`}
          className="font-semibold underline">Open Website &amp; Brand</a>
      </WorkspaceNotice>}
      {brandReadiness==="loading"&&<WorkspaceNotice tone="info">
        Checking your Site settings…
      </WorkspaceNotice>}
      {brandReadiness==="unavailable"&&<WorkspaceNotice tone="attention">
        Couldn't check your Site settings. Try again to create new packages.
        <div className="mt-3"><Button type="button" variant="outline" size="sm"
          onClick={()=>setBrandRefreshKey(value=>value+1)}>Try again</Button></div>
      </WorkspaceNotice>}

      {view==="library"&&<>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{context.libraryDescription}</p>
          <Button disabled={busy||brandReadiness!=="available"} onClick={start}>
            <Plus aria-hidden="true"/> New Outreach
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <h2 className="text-lg font-semibold">Saved outreach plans ({visible.length})</h2>
          <Button variant="outline" size="sm" onClick={()=>setShowArchived(value=>!value)}>
            {showArchived?"View active":"View archived"}
          </Button>
        </div>
        {!visible.length&&<WorkspacePanel title="No outreach plans yet">
          <p className="text-sm text-muted-foreground">Choose who to reach, what to say, and how you want to share it.</p>
        </WorkspacePanel>}
        <MarketingPackageLibraryList records={visible} busy={busy}
          onOpen={open} onDuplicate={duplicate} onArchiveToggle={setArchived}
          onDelete={setDeleteCandidate} />
        <WorkspacePanel title="Continue in Share"
          description={context.handoffDescription}>
          <div className="grid gap-3">
            {context.handoffs.map(item=><WorkspaceActionLink key={item.title}
              title={item.title} description={item.description} href={item.href(siteId)}
              actionLabel="Continue" />)}
          </div>
        </WorkspacePanel>
        <ActionFooter><Button variant="outline" onClick={()=>void exitLaunch()}>Back to Launch Overview</Button></ActionFooter>
      </>}

      {view==="wizard"&&record&&
        outreachSourceChangedV61(record.content.plan,siteRevision)&&
        <WorkspaceNotice tone="attention">
          Shape information changed after this plan was saved. Review the
          highlights before saving; nothing is replaced automatically.
        </WorkspaceNotice>}
      {view==="wizard"&&<MarketingPackageWizardV61
        siteId={siteId} siteName={siteName} siteIntent={siteIntent} step={step} title={title} content={content}
        busy={busy} brandVersionId={record?.brandVersionId??null}
        currentSuggestion={currentSuggestion}
        activePreviewFormat={activePreviewFormat}
        hasSavedPackage={Boolean(record)}
        onTitleChange={setTitle} onPatch={patch}
        onBack={()=>{if(step===0)void leaveWizard();else setStep(value=>value-1);}}
        onSaveExit={()=>{void saveExit();}}
        onNext={()=>{void next();}}/>}

      {view==="detail"&&record&&<>
        {outreachSourceChangedV61(record.content.plan,siteRevision)&&
          <WorkspaceNotice tone="attention">
            Your Site information has changed since this outreach plan was drafted.
            Review its highlights and message before creating another release.
            Earlier materials are unchanged.
          </WorkspaceNotice>}
        {record.content.plan&&<WorkspacePanel title="Audience & highlights">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <p><strong>Who you want to reach:</strong> {record.content.plan.recipients.map(id=>marketingAudienceOptions.find(option=>option.id===id)?.label??id).join(", ")||"Not selected"}</p>
            <p><strong>Who will benefit:</strong> {record.content.plan.beneficiaries.map(id=>siteAudienceNames[id]).join(", ")||"Not selected"}</p>
            <p><strong>Highlights:</strong> {record.content.plan.highlights.map(x=>x.label).join(", ")||"Not selected"}</p>
            <p><strong>Requested action:</strong> {record.content.plan.action.replaceAll("-"," ").replace(/^./,c=>c.toUpperCase())}</p>
          </div>
        </WorkspacePanel>}
        <WorkspacePanel title="Review material previews" description="See how your materials look with your saved brand and message. Nothing has been sent or published.">
          <div className="flex flex-wrap gap-2">{record.content.formats.map(format=>
            <Button type="button" key={format} size="sm" variant={activePreviewFormat===format?"default":"outline"}
              disabled={Boolean(editingFormat&&editingFormat!==format)}
              onClick={()=>setPreviewFormat(format)}>{format==="handout"?"Conversation Kit / Handout":format}</Button>)}</div>
          {activePreviewFormat&&<div className="mt-4">
            <MarketingMaterialPreviewV61 siteId={siteId} title={record.title}
              content={editingFormat===activePreviewFormat?content:record.content}
              brandVersionId={record.brandVersionId} format={activePreviewFormat}/>
          </div>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline"
              disabled={busy||record.status==="archived"||Boolean(editingFormat)} onClick={()=>{
                setTitle(record.title);setContent(record.content);setStep(5);setView("wizard");
              }}>Edit overall message</Button>
            {activePreviewFormat&&<Button type="button" variant="outline"
              disabled={busy||record.status==="archived"} onClick={()=>{
                if(editingFormat===activePreviewFormat){setContent(record.content);setEditingFormat(null);}
                else setEditingFormat(activePreviewFormat);
              }}>
                {editingFormat===activePreviewFormat?"Close material editor":"Customize this material"}
              </Button>}
          </div>
          {editingFormat&&activePreviewFormat===editingFormat&&<div className="mt-4 space-y-4 border bg-muted/20 p-4">
            <h3 className="text-sm font-semibold">Customize {editingFormat} only</h3>
            <Field label="Headline"><Input maxLength={160}
              value={content.materialOverrides?.[editingFormat]?.headline??content.headline}
              onChange={event=>patch({materialOverrides:{
                ...content.materialOverrides,
                [editingFormat]:{...content.materialOverrides?.[editingFormat],headline:event.target.value},
              }})}/></Field>
            <Field label="Message"><Textarea maxLength={1600} rows={6}
              value={content.materialOverrides?.[editingFormat]?.message??content.message}
              onChange={event=>patch({materialOverrides:{
                ...content.materialOverrides,
                [editingFormat]:{...content.materialOverrides?.[editingFormat],message:event.target.value},
              }})}/></Field>
            <Field label="Call to action"><Input maxLength={100}
              value={content.materialOverrides?.[editingFormat]?.callToAction??content.callToAction}
              onChange={event=>patch({materialOverrides:{
                ...content.materialOverrides,
                [editingFormat]:{...content.materialOverrides?.[editingFormat],callToAction:event.target.value},
              }})}/></Field>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy}
                onClick={()=>void saveMaterialOverride()}>Save this material</Button>
              <Button type="button" variant="outline" disabled={busy}
                onClick={()=>{setContent(record.content);setEditingFormat(null);}}>Discard material changes</Button>
            </div>
          </div>}
          {record.content.plan?.channels.includes("conversation-kit")&&<div className="mt-4 border p-4 text-sm">
            <h3 className="font-semibold">Conversation Starter Kit</h3>
            <p className="mt-2">30-second introduction: {record.content.message.slice(0,240)}</p>
            <p className="mt-2">Questions to ask: What needs matter most? What could we explore together? What would be a useful next step?</p>
            <p className="mt-2 text-muted-foreground">This kit is for talking points, not verified operational claims.</p>
          </div>}
        </WorkspacePanel>
        <WorkspacePanel title="Message & materials">
          <dl className="mt-3 space-y-4 text-sm">
            <div><dt className="font-semibold">Purpose</dt><dd className="text-muted-foreground">
              {marketingPurposeOptions.find(option=>option.id===record.content.purpose)?.label}</dd></div>
            <div><dt className="font-semibold">Audience</dt><dd className="text-muted-foreground">
              {record.content.audiences.map(id=>marketingAudienceOptions.find(option=>option.id===id)?.label??id).join(", ")||"Not selected"}</dd></div>
            <div><dt className="font-semibold">Headline</dt><dd className="text-muted-foreground">{record.content.headline}</dd></div>
            <div><dt className="font-semibold">Message</dt><dd className="whitespace-pre-wrap text-muted-foreground">{record.content.message}</dd></div>
            <div><dt className="font-semibold">Materials</dt><dd className="text-muted-foreground">
              {record.content.formats.map(id=>marketingFormatOptions.find(option=>option.id===id)?.label??id).join(", ")||"Not selected"}</dd></div>
          </dl>
        </WorkspacePanel>
        {packageHandoff &&
          <WorkspacePanel title={packageHandoff.title}
            description={packageHandoff.description}>
            {record.status==="archived"
              ? <WorkspaceNotice tone="attention">Restore this package to use it again.</WorkspaceNotice>
              : <Button asChild variant="outline"><a href={
                packageHandoff.href(siteId,record.id)
              }>Continue with this package <ArrowRight aria-hidden="true"/></a></Button>}
          </WorkspacePanel>}
        <WorkspaceNotice tone="info">
          {releasesUnavailable
            ?"We couldn't check earlier material versions. Retry the history check before creating more."
            :releasesLoading
              ?"Checking earlier material versions…"
              :hasDownloadableMaterials
                ?"Your generated materials are available below. Nothing has been sent."
                :"No complete materials have been generated yet. Review your plan and previews, then create materials."}
        </WorkspaceNotice>
        <MarketingPackageReleaseControlsV61 record={record} versions={packageReleases}
          currentBrand={currentBrand} selectedBrandRevision={selectedBrandRevision}
          busy={busy} releasesLoading={releasesLoading}
          releasesUnavailable={releasesUnavailable}
          onSelectCurrentBrand={() => {void selectCurrentBrand();}}
          onRetryHistory={() => setReleaseRefreshKey(value=>value+1)}
          onPreview={() => {setTitle(record.title);setContent(record.content);setStep(5);setView("wizard");}}
          onRelease={() => {void releasePackage();}} />
        <MarketingPackageReleaseHistoryV61
          siteId={siteId} record={record} versions={packageReleases}
          historicalSingles={legacyReleases} loading={releasesLoading}
          busy={busy} compare={compare}
          onDownloadPackage={version=>{void downloadPackage(version);}}
          onCompare={(id,format,number)=>{void compareRelease(id,format,number);}}
          onDownloadOriginal={id=>{void downloadRelease(id);}}
          onDownloadPng={id=>{void downloadPng(id);}}
          onCopyCaption={id=>{void copyCaption(id);}}
          onCloseCompare={()=>setCompare(null)}/>
        <ActionFooter>
          <Button variant="outline" disabled={Boolean(editingFormat)} onClick={()=>{setView("library");setRecord(null);}}>My Outreach</Button>
          <Button variant="outline" disabled={busy} onClick={()=>void duplicate(record)}><Copy aria-hidden="true"/> Duplicate</Button>
          <Button variant="outline" disabled={busy||record.status==="archived"||Boolean(editingFormat)} onClick={()=>open(record,true)}>Edit plan</Button>
          <Button disabled={busy||Boolean(editingFormat)} onClick={()=>setView("share")}>Use &amp; Share <ArrowRight aria-hidden="true"/></Button>
        </ActionFooter>
      </>}
      {view==="share"&&record&&<>
        <WorkspacePanel title="Available materials" description="Download reviewed materials, or continue to a separately authorized sending or event workflow.">
          <p className="text-sm text-muted-foreground">
            {materialAvailabilityMessage}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {downloadablePackageReleases.slice(0,1).map(release=>
              <Button key={release.id} disabled={busy}
                onClick={()=>void downloadPackage(release)}>Download Package v{release.releaseNumber}</Button>)}
            {record.content.plan?.action==="attend-event"&&record.content.purpose==="event-invitation"&&
              <Button asChild variant="outline"><a href={"/operations/interest-events/new?siteId="+encodeURIComponent(siteId)+"&packageId="+encodeURIComponent(record.id)}>Create Event</a></Button>}
            <Button variant="outline" onClick={()=>setView("followup")}>Follow Up <ArrowRight aria-hidden="true"/></Button>
          </div>
          {hasDownloadableMaterials&&<WorkspaceNotice tone="info">
            These files are ready to download. Sharing or sending them requires a separate action.
          </WorkspaceNotice>}
        </WorkspacePanel>
        <UniversalEngagementPublisher key={"engagement:"+record.id} siteId={siteId} packageId={record.id} />
        <SiteEngagementLibrary key={"library:"+record.id} siteId={siteId} packageId={record.id} />
        <ActionFooter><Button variant="outline" onClick={()=>setView("detail")}>Back to Details</Button></ActionFooter>
      </>}
      {view==="followup"&&record&&<>
        <WorkspacePanel title="Responses & events" description="Review inquiries and interest events for your site. These may include activity unrelated to this outreach plan.">
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <WorkspaceActionLink title="Inquiries & responses" description="See inquiries and recorded interest for this site."
              href={"/admissions/intake?siteId="+encodeURIComponent(siteId)} actionLabel="Review inquiries"/>
            <WorkspaceActionLink title="Interest Events" description="Review or set up a Program-linked event when eligible."
              href={"/operations/interest-events?siteId="+encodeURIComponent(siteId)} actionLabel="Review events"/>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">These links open site-wide records. Responses are associated with this outreach only when that connection has been recorded.</p>
        </WorkspacePanel>
        <ActionFooter><Button variant="outline" onClick={()=>setView("share")}>Back to Use &amp; Share</Button>
          <Button onClick={()=>setView("detail")}>Review Materials</Button></ActionFooter>
      </>}
      <ActionDialog open={discardDialogOpen} title="Discard unsaved package changes?"
        description="Your unsaved edits will be lost. Previously saved content will remain."
        confirmLabel="Discard changes" destructive pending={busy}
        onClose={()=>setDiscardDialogOpen(false)} onConfirm={discardWizard} />
      <ActionDialog open={Boolean(deleteCandidate)} title="Delete outreach plan"
        description="Delete unused drafts only. Packages with generated materials must be archived so their released files remain available. This cannot be undone."
        confirmLabel="Delete package" destructive pending={busy}
        onClose={()=>setDeleteCandidate(null)}
        onConfirm={()=>{if(deleteCandidate)void remove(deleteCandidate);}} />
    </div>
  </WorkspaceShell>;
}
