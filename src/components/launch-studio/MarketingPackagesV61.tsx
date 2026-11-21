import { MarketingPackageWizardV61 } from "./MarketingPackageWizardV61";
import { MarketingPackageReleaseHistoryV61 } from "./MarketingPackageReleaseHistoryV61";
import { MarketingPackageLibraryList } from "./MarketingPackageLibraryList";
import { readSiteBrandVersionView } from "@/modules/sites/site-brand.functions";
import { createSiteMarketingPackageRelease, listSiteMarketingPackageReleases, listSiteMarketingReleases, getSiteMarketingReleaseOutput } from "@/modules/programs/site-marketing-artifacts.functions";
import { useEffect, useState } from "react";
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
import { introduceModuleConfigV61, type IntroduceModuleV61 } from "@/domain/launch-introduce-v61";

type PackageRecord = Awaited<ReturnType<typeof listSiteMarketingPackagesV61>>[number];
type MarketingSuggestions = Awaited<ReturnType<typeof readSiteMarketingSuggestionsV61>>;

function message(error:unknown) {
  return error instanceof Error ? error.message : "The package operation could not be completed.";
}

type MarketingPackagesV61Props = {
  siteId:string;siteName:string;initial:PackageRecord[];
  suggestions:MarketingSuggestions|null;onExit:()=>void;
  module?:IntroduceModuleV61;suggestionsUnavailable?:boolean;
  siteIntent?:SiteProgramsAudiencesV61|null;intentUnavailable?:boolean;
  siteRevision?:string|null;
};

/**
 * Each Site and Introduce module owns a separate working editor session.
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
  const [view,setView]=useState<"library"|"wizard"|"detail"|"share"|"followup">(module==="create-outreach"?"wizard":"library");
  const [record,setRecord]=useState<PackageRecord|null>(null);
  const [title,setTitle]=useState(siteName+" outreach");
  const [content,setContent]=useState<MarketingPackageContent>(()=>({
    ...starter(context.defaultPurpose),
    plan:newPlan(siteIntent?.audienceIds??[]),
    formats:outreachFormatsV61(initialOutreachPlanV61().channels),
  }));
  const [step,setStep]=useState(0);
  // Saved/duplicated copy is presumed operator-authored. Only a brand-new
  // guided plan receives an automatic first draft when entering Review.
  const [hasAuthoredCopy,setHasAuthoredCopy]=useState(false);
  const [previewFormat,setPreviewFormat]=useState<MarketingFormat>("email");
  const [editingFormat,setEditingFormat]=useState<MarketingFormat|null>(null);
  const [showArchived,setShowArchived]=useState(false);
  const [busy,setBusy]=useState(false);
  const [deleteCandidate,setDeleteCandidate]=useState<PackageRecord|null>(null);
  const [discardDialogOpen,setDiscardDialogOpen]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [releases,setReleases]=useState<Awaited<ReturnType<typeof listSiteMarketingReleases>>>([]);
  const [packageReleases,setPackageReleases]=useState<Awaited<ReturnType<typeof listSiteMarketingPackageReleases>>>([]);
  const [releasesLoading,setReleasesLoading]=useState(false);
  const [releasesUnavailable,setReleasesUnavailable]=useState(false);
  const [releaseRefreshKey,setReleaseRefreshKey]=useState(0);
  const [releaseRequestId,setReleaseRequestId]=useState(()=>crypto.randomUUID());
  const [compare,setCompare]=useState<{id:string;format:MarketingFormat;mimeType:string;body:string;releaseNumber:number}|null>(null);
  const [currentBrand,setCurrentBrand]=useState<{id:string;revision:number}|null>(null);
  const [brandReadiness,setBrandReadiness]=useState<"loading"|"available"|"missing"|"unavailable">("loading");
  const [brandRefreshKey,setBrandRefreshKey]=useState(0);
  const [selectedBrandRevision,setSelectedBrandRevision]=useState<number|null>(null);
  // Shared prerequisite for Create Outreach and My Outreach. Brand edits
  // stay in Establish; a Marketing Package only selects an immutable version.
  useEffect(()=>{
    let live=true;
    setBrandReadiness("loading");
    void readSiteBrandVersionView({data:{siteId}})
      .then(brand=>{
        if(!live)return;
        const version=brand.current?.version;
        setCurrentBrand(version?{id:version.id,revision:version.revision}:null);
        setBrandReadiness(version?"available":"missing");
      })
      .catch(()=>{if(live)setBrandReadiness("unavailable");});
    return ()=>{live=false;};
  },[siteId,brandRefreshKey]);
  useEffect(()=>{
    if((view!=="detail"&&view!=="share"&&view!=="followup")||!record)return;
    let live=true;
    setReleasesLoading(true);setReleasesUnavailable(false);
    setReleases([]);setPackageReleases([]);setCompare(null);
    void Promise.all([
      listSiteMarketingReleases({data:{siteId,packageId:record.id}}),
      listSiteMarketingPackageReleases({data:{siteId,packageId:record.id}}),
      readSiteBrandVersionView({data:{siteId}}),
      record.brandVersionId
        ? readSiteBrandVersionView({data:{siteId,versionId:record.brandVersionId}})
        : Promise.resolve(null),
    ]).then(([records,packageVersions,brand,selected])=>{
      if(live){setReleases(records);setPackageReleases(packageVersions);setReleasesLoading(false);
        setReleasesUnavailable(false);
        setCurrentBrand(brand.current?.version
          ? {id:brand.current.version.id,revision:brand.current.version.revision}:null);
        setSelectedBrandRevision(selected?.current?.version.revision??null);}
    }).catch(error=>{if(live){setError(message(error));setReleasesLoading(false);
      setReleasesUnavailable(true);}});
    return ()=>{live=false;};
  },[view,record?.id,record?.brandVersionId,siteId,releaseRefreshKey]);
  const dirty=(view==="wizard" || (view==="detail" && editingFormat!==null)) && (!record || title!==record.title ||
    JSON.stringify(content)!==JSON.stringify(record.content));
  const releaseNavigation=useLaunchUnsavedChanges(()=>dirty||busy,
    "Leave your Marketing Package? Unsaved changes will be lost.");

  function open(recordToOpen:PackageRecord,editing=false) {
    setEditingFormat(null);
    setRecord(recordToOpen);setTitle(recordToOpen.title);
    setContent({...recordToOpen.content,plan:recordToOpen.content.plan??{
      ...newPlan(siteIntent?.audienceIds??[]),
      recipients:recordToOpen.content.audiences,
    }});
    setHasAuthoredCopy(true);
    setStep(0);setView(editing?"wizard":"detail");setError("");setNotice("");
    setReleases([]);setPackageReleases([]);setReleasesLoading(!editing);
    setReleasesUnavailable(false);
    setReleaseRequestId(crypto.randomUUID());setCompare(null);
  }
  function start() {
    setEditingFormat(null);
    setRecord(null);setTitle(siteName+" outreach");
    setContent({...starter(context.defaultPurpose),
      plan:newPlan(siteIntent?.audienceIds??[]),
      formats:outreachFormatsV61(initialOutreachPlanV61().channels)});
    setHasAuthoredCopy(false);
    setStep(0);setView("wizard");setError("");setNotice("");
  }
  function patch(value:Partial<MarketingPackageContent>) {
    if ("headline" in value || "message" in value || "callToAction" in value)
      setHasAuthoredCopy(true);
    setContent(current=>({...current,...value}));setError("");
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
      setError("Save a Site Brand in Establish → Website & Brand before creating outreach.");
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
        ? {...content,...composeOutreachDraftV61(siteName,content.plan,siteIntent)}
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
    setRecord(null);setView("library");setError("");setNotice("");
  }
  function leaveWizard() {
    if (dirty) { setDiscardDialogOpen(true); return; }
    discardWizard();
  }
  async function duplicate(selected:PackageRecord) {
    await run(async()=>{
      const copied=await duplicateSiteMarketingPackageV61({data:{siteId,packageId:selected.id}});
      updateList(copied);setTitle(copied.title);setContent(copied.content);
      setHasAuthoredCopy(true);
      setStep(0);setView("wizard");
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
      const files=outputs.map((output,index)=>({
        name:release.outputs[index]!.format+"."+output.fileName.split(".").at(-1),
        body:output.content,
      }));
      for(let index=0;index<outputs.length;index++){
        const output=outputs[index]!;
        if(release.outputs[index]?.format==="social"&&output.plainText)
          files.push({name:"social-caption.txt",body:output.plainText});
      }
      files.push({name:"package-manifest.json",body:JSON.stringify({
        packageReleaseId:release.id,releaseNumber:release.releaseNumber,
        brandVersionId:release.brandVersionId,sourcePackageRevision:release.packageRevision,
        createdAt:release.createdAt,formats:release.formats,
        outputs:release.outputs.map(x=>({id:x.id,format:x.format,templateVersion:x.templateVersion,sha256:x.checksum})),
      },null,2)});
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
  const titleText=view==="library"?context.libraryTitle:view==="wizard"?"Create Outreach":view==="share"?"Use & Share":view==="followup"?"Follow Up":record?.title??"Outreach Details";
  const rail=<div className="space-y-4">
    <WorkspacePanel title="About this step">
      <p className="text-sm leading-6 text-muted-foreground">{context.guidance}</p>
    </WorkspacePanel>
    <WorkspacePanel title={view==="wizard"?"Your next step":"Your outreach"}>
      <p className="text-sm leading-6 text-muted-foreground">
        {view==="wizard"
          ?["Choose recipients and beneficiaries.","Choose a clear message objective.",
            "Highlight the saved Programs and Experiences that matter.",
            "Give people one meaningful next action.","Select your outreach channels.",
            "Choose a story angle, review the message, and save."][step]
          :"An outreach draft is not a sent message. Releases preserve the exact materials and Brand used."}
      </p>
    </WorkspacePanel>
  </div>;
  return <WorkspaceShell title={titleText} eyebrow={context.eyebrow}
    subtitle={context.subtitle}
    width="wide" rail={rail}>
    <div className="mt-6 space-y-5">
      {error&&<p role="alert" className="border border-destructive bg-card p-4 text-sm text-destructive">{error}</p>}
      {notice&&<p role="status" className="border bg-card p-4 text-sm">{notice}</p>}
      {intentUnavailable&&<WorkspaceNotice tone="attention">
        Saved Programs, Audiences and Experiences could not be verified.
        Refresh the Site before choosing highlights; empty choices are not assumed.
      </WorkspaceNotice>}
      {suggestionsUnavailable&&<WorkspaceNotice tone="attention">
        Suggestions are unavailable. Saved packages are still available.
      </WorkspaceNotice>}
      {brandReadiness==="missing"&&<WorkspaceNotice tone="attention">
        Save your Site identity in Establish before building branded materials.
        {" "}<a href={`/launch/site?siteId=${encodeURIComponent(siteId)}&module=website-brand`}
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
          <p className="text-sm text-muted-foreground">Start with Who, Message, Highlight, Action, Channels, and Review.</p>
        </WorkspacePanel>}
        <MarketingPackageLibraryList records={visible} busy={busy}
          onOpen={open} onDuplicate={duplicate} onArchiveToggle={setArchived}
          onDelete={setDeleteCandidate} />
        <WorkspacePanel title="Continue in Introduce"
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
          Establish information changed after this plan was saved. Review the
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
            Establish information has changed since this outreach plan was drafted.
            Review its highlights and message before creating another release.
            Earlier materials are unchanged.
          </WorkspaceNotice>}
        {record.content.plan&&<WorkspacePanel title="Your outreach plan">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <p><strong>Recipients:</strong> {record.content.plan.recipients.join(", ")||"Not selected"}</p>
            <p><strong>Beneficiaries:</strong> {record.content.plan.beneficiaries.join(", ")||"Not selected"}</p>
            <p><strong>Highlights:</strong> {record.content.plan.highlights.map(x=>x.label).join(", ")||"Not selected"}</p>
            <p><strong>Action:</strong> {record.content.plan.action.replaceAll("-"," ")}</p>
          </div>
        </WorkspacePanel>}
        <WorkspacePanel title="Review material previews" description="Each preview uses the saved Brand and current message. This is not a sent or published campaign.">
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
        <WorkspacePanel title={record.title}>
          <dl className="mt-3 space-y-4 text-sm">
            <div><dt className="font-semibold">Purpose</dt><dd className="text-muted-foreground">
              {marketingPurposeOptions.find(option=>option.id===record.content.purpose)?.label}</dd></div>
            <div><dt className="font-semibold">Audience</dt><dd className="text-muted-foreground">
              {record.content.audiences.map(id=>marketingAudienceOptions.find(option=>option.id===id)?.label??id).join(", ")||"Not selected"}</dd></div>
            <div><dt className="font-semibold">Headline</dt><dd className="text-muted-foreground">{record.content.headline}</dd></div>
            <div><dt className="font-semibold">Message</dt><dd className="whitespace-pre-wrap text-muted-foreground">{record.content.message}</dd></div>
            <div><dt className="font-semibold">Preferred collateral</dt><dd className="text-muted-foreground">
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
          {packageReleases.some(item=>item.complete)
            ?"Generated materials are available below. No sending is implied."
            :"No complete material release has been generated yet. Save your plan, review the preview, then create materials."}
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
        <WorkspacePanel title="Use & Share" description="Download reviewed materials, or continue to a separately authorized sending or event workflow.">
          <p className="text-sm text-muted-foreground">
            {packageReleases.some(x=>x.complete)
              ?"Generated materials are ready for download. Nothing has been sent."
              :"Create a complete material release in Outreach Details before downloading."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {packageReleases.filter(x=>packageReleaseIsDownloadableV61(x)).slice(0,1).map(release=>
              <Button key={release.id} disabled={busy}
                onClick={()=>void downloadPackage(release)}>Download Package v{release.releaseNumber}</Button>)}
            {record.content.plan?.action==="attend-event"&&record.content.purpose==="event-invitation"&&
              <Button asChild variant="outline"><a href={"/operations/interest-events/new?siteId="+encodeURIComponent(siteId)+"&packageId="+encodeURIComponent(record.id)}>Create Event</a></Button>}
            <Button variant="outline" onClick={()=>setView("followup")}>Follow Up <ArrowRight aria-hidden="true"/></Button>
          </div>
          <WorkspaceNotice tone="info">A selected channel is not evidence of delivery. Email sending, public links and registration require separate authorized destinations.</WorkspaceNotice>
        </WorkspacePanel>
        <ActionFooter><Button variant="outline" onClick={()=>setView("detail")}>Back to Details</Button></ActionFooter>
      </>}
      {view==="followup"&&record&&<>
        <WorkspacePanel title="Follow Up" description="Review real inquiries and events through the existing authorized Site services. No inferred opens, sends, or responses.">
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <WorkspaceActionLink title="Inquiries & responses" description="Review actual Site intake and authorized learner interest."
              href={"/admissions/intake?siteId="+encodeURIComponent(siteId)} actionLabel="Review inquiries"/>
            <WorkspaceActionLink title="Interest Events" description="Review or set up a Program-linked event when eligible."
              href={"/operations/interest-events?siteId="+encodeURIComponent(siteId)} actionLabel="Review events"/>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Outreach-specific response attribution is not inferred from unrelated inquiries.</p>
        </WorkspacePanel>
        <ActionFooter><Button variant="outline" onClick={()=>setView("share")}>Back to Use &amp; Share</Button>
          <Button onClick={()=>setView("detail")}>Review Materials</Button></ActionFooter>
      </>}
      <ActionDialog open={discardDialogOpen} title="Discard unsaved package changes?"
        description="Your unsaved edits will be lost. Previously saved content will remain."
        confirmLabel="Discard changes" destructive pending={busy}
        onClose={()=>setDiscardDialogOpen(false)} onConfirm={discardWizard} />
      <ActionDialog open={Boolean(deleteCandidate)} title="Delete Marketing Package"
        description="Delete unused drafts only. Packages with generated materials must be archived so their released files remain available. This cannot be undone."
        confirmLabel="Delete package" destructive pending={busy}
        onClose={()=>setDeleteCandidate(null)}
        onConfirm={()=>{if(deleteCandidate)void remove(deleteCandidate);}} />
    </div>
  </WorkspaceShell>;
}
