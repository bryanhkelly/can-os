import { readSiteBrandVersionView } from "@/modules/sites/site-brand.functions";
import { MarketingMaterialPreviewV61 } from "./MarketingMaterialPreviewV61";
import { createSiteMarketingPackageRelease, listSiteMarketingPackageReleases, listSiteMarketingReleases, getSiteMarketingReleaseOutput } from "@/modules/programs/site-marketing-artifacts.functions";
import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Archive, ArrowLeft, ArrowRight, Check, Copy, FileText, Megaphone, Plus, RotateCcw, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Radio } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActionDialog, ActionFooter, WorkspaceNotice, WorkspacePanel, WorkspaceShell } from "@/components/workspace";
import {
  initialMarketingContent, marketingAudienceOptions, marketingFormatOptions,
  marketingPackageContentSchema, marketingPurposeOptions, marketingStepIssue,
  type MarketingFormat, type MarketingPackageContent, type MarketingPackageStep,
} from "@/domain/marketing-package-v61";
import {
  archiveSiteMarketingPackageV61, createSiteMarketingPackageV61,
  deleteSiteMarketingPackageV61, duplicateSiteMarketingPackageV61,
  listSiteMarketingPackagesV61, readSiteMarketingSuggestionsV61,
  saveSiteMarketingPackageV61, selectSiteMarketingPackageBrandV61,
} from "@/modules/programs/site-marketing-packages-v61.functions";
import { useLaunchUnsavedChanges } from "./useLaunchUnsavedChanges";
import { downloadOriginalMarketingOutput, downloadMarketingPng, downloadMarketingPackageZip } from "./marketing-output-download";
import { packageReleaseChangesV61, packageReleaseIsDownloadableV61 } from "@/domain/marketing-package-release-v61";
import { introduceModuleConfigV61, type IntroduceModuleV61 } from "@/domain/launch-introduce-v61";

type PackageRecord = Awaited<ReturnType<typeof listSiteMarketingPackagesV61>>[number];
type MarketingSuggestions = Awaited<ReturnType<typeof readSiteMarketingSuggestionsV61>>;
const steps: readonly MarketingPackageStep[] = ["menu", "audience", "messages", "assets"];
const stepLabels = ["Menu", "Audience", "Messages", "Collateral & Assets"] as const;

function message(error:unknown) {
  return error instanceof Error ? error.message : "The package operation could not be completed.";
}

export function MarketingPackagesV61({siteId,siteName,initial,suggestions,onExit,
  module="promote",suggestionsUnavailable=false}:{
  siteId:string;siteName:string;initial:PackageRecord[];
  suggestions:MarketingSuggestions|null;onExit:()=>void;
  module?:IntroduceModuleV61;suggestionsUnavailable?:boolean;
}) {
  const router=useRouter();
  const context=introduceModuleConfigV61[module];
  const purposeOptions=marketingPurposeOptions.filter(option=>context.purposes.includes(option.id));
  const starter=(purpose:MarketingPackageContent["purpose"])=>(
    suggestions?.[purpose]?.content??initialMarketingContent(siteName,purpose));
  const [packages,setPackages]=useState(initial);
  const [view,setView]=useState<"library"|"wizard"|"detail">("library");
  const [record,setRecord]=useState<PackageRecord|null>(null);
  const [title,setTitle]=useState("");
  const [content,setContent]=useState<MarketingPackageContent>(()=>
    starter(context.defaultPurpose));
  const [step,setStep]=useState(0);
  const [previewFormat,setPreviewFormat]=useState<MarketingFormat>("flyer");
  const [showArchived,setShowArchived]=useState(false);
  const [busy,setBusy]=useState(false);
  const [deleteCandidate,setDeleteCandidate]=useState<PackageRecord|null>(null);
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
  // Shared prerequisite for Promote, Recruit and Interest Events. Brand edits
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
    if(view!=="detail"||!record)return;
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
  const dirty=view==="wizard" && (!record || title!==record.title ||
    JSON.stringify(content)!==JSON.stringify(record.content));
  const releaseNavigation=useLaunchUnsavedChanges(()=>dirty||busy,
    "Leave your Marketing Package? Unsaved changes will be lost.");

  function open(recordToOpen:PackageRecord,editing=false) {
    setRecord(recordToOpen);setTitle(recordToOpen.title);setContent(recordToOpen.content);
    setStep(0);setView(editing?"wizard":"detail");setError("");setNotice("");
    setReleases([]);setPackageReleases([]);setReleasesLoading(!editing);
    setReleasesUnavailable(false);
    setReleaseRequestId(crypto.randomUUID());setCompare(null);
  }
  function start() {
    setRecord(null);setTitle("");setContent(starter(context.defaultPurpose));
    setStep(0);setView("wizard");setError("");setNotice("");
  }
  function patch(value:Partial<MarketingPackageContent>) {
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
  async function saveCurrent() {
    if(!record)throw new Error("Create the package before saving its details.");
    const parsed=marketingPackageContentSchema.parse(content);
    const saved=await saveSiteMarketingPackageV61({data:{
      siteId,packageId:record.id,expectedRevision:record.revision,title,content:parsed,
    }});
    updateList(saved);
    return saved;
  }

  async function next() {
    const issue=marketingStepIssue(steps[step]!,title,content);
    if(issue){setError(issue);return;}
    if(step===3){
      const incomplete=steps.map((item,index)=>({index,issue:marketingStepIssue(item,title,content)}))
        .find(item=>item.issue);
      if(incomplete){setStep(incomplete.index);setError(incomplete.issue!);return;}
    }
    await run(async()=>{
      if(!record) {
        // The server persists the canonical starter. Keep any operator edits made
        // before creation as a working draft until the next save.
        const workingDraft=content;
        const created=await createSiteMarketingPackageV61({data:{siteId,title,purpose:content.purpose}});
        updateList(created);
        setContent(workingDraft);
        setStep(1);
        setNotice("Draft package created. Continue adding your audience and message.");
        return;
      }
      await saveCurrent();
      if(step<3)setStep(value=>value+1);
      else {setView("detail");setNotice("Package content saved. Creative assets are not generated yet.");}
    });
  }
  async function saveExit() {
    await run(async()=>{
      if(record)await saveCurrent();
      setView("library");setRecord(null);
      setNotice(record?"Package saved.":"No package created.");
    });
  }
  async function leaveWizard() {
    if(dirty&&!window.confirm("Discard unsaved changes and return to your packages?"))return;
    setRecord(null);setView("library");setError("");setNotice("");
  }
  async function duplicate(selected:PackageRecord) {
    await run(async()=>{
      const copied=await duplicateSiteMarketingPackageV61({data:{siteId,packageId:selected.id}});
      updateList(copied);setTitle(copied.title);setContent(copied.content);
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
  const latestPackageRelease=packageReleases[0]??null;
  const packageChanges=record?packageReleaseChangesV61(record,latestPackageRelease):[];
  const packageUpToDate=Boolean(latestPackageRelease?.complete && packageChanges.length===0);
  const legacyReleases=releases.filter(item=>!item.packageReleaseId);
  const packageHandoff=record && context.packageHandoff?.purpose===record.content.purpose
    ?context.packageHandoff:null;
  const activePreviewFormat=content.formats.includes(previewFormat)?previewFormat:content.formats[0]??null;
  const titleText=view==="library"?context.libraryTitle:view==="wizard"?"Build a Marketing Package":record?.title??"Marketing Package";
  const rail=<div className="space-y-4">
    <WorkspacePanel title="Why this matters">
      <p className="text-sm leading-6 text-muted-foreground">{context.guidance}</p>
    </WorkspacePanel>
    <WorkspacePanel title="What CAN prepares">
      <p className="text-sm leading-6 text-muted-foreground">Save the audience, message and preferred formats in one reusable package. Generated downloads use the exact saved Site Brand version of their Package.</p>
    </WorkspacePanel>
    <WorkspaceNotice tone="info">Saved package content is private planning information. It does not publish a Site, create an event, open enrollment or send email.</WorkspaceNotice>
  </div>;
  return <WorkspaceShell title={titleText} eyebrow={context.eyebrow}
    subtitle={context.subtitle}
    width="wide" rail={rail}>
    <div className="mt-6 space-y-5">
      {error&&<p role="alert" className="border border-destructive bg-card p-4 text-sm text-destructive">{error}</p>}
      {notice&&<p role="status" className="border bg-card p-4 text-sm">{notice}</p>}
      {suggestionsUnavailable&&<WorkspaceNotice tone="attention">
        Current Site Story and program suggestions could not be loaded. Saved packages remain
        available. Review the source information in Establish before using suggested wording.
      </WorkspaceNotice>}
      {view==="library"&&brandReadiness==="missing"&&<WorkspaceNotice tone="attention">
        Save your Site identity in Establish before building branded materials.
        {" "}<a href={`/launch/site?siteId=${encodeURIComponent(siteId)}&module=website-brand`}
          className="font-semibold underline">Open Website &amp; Brand</a>
      </WorkspaceNotice>}
      {view==="library"&&brandReadiness==="loading"&&<WorkspaceNotice tone="info">
        Checking your saved Site Brand before enabling new Marketing Packages.
      </WorkspaceNotice>}
      {view==="library"&&brandReadiness==="unavailable"&&<WorkspaceNotice tone="attention">
        Site Brand status could not be checked. Existing packages remain available,
        but new packages cannot start until the saved Brand is verified.
        <div className="mt-3"><Button type="button" variant="outline" size="sm"
          onClick={()=>setBrandRefreshKey(value=>value+1)}>Retry Brand check</Button></div>
      </WorkspaceNotice>}

      {view==="library"&&<>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{context.libraryDescription}</p>
          <Button disabled={busy||brandReadiness!=="available"} onClick={start}>
            <Plus aria-hidden="true"/> New package
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {purposeOptions.map(option=><button key={option.id} type="button"
            disabled={busy||brandReadiness!=="available"}
            className="border bg-card p-5 text-left hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            onClick={()=>{start();setTitle(option.label);setContent(starter(option.id));}}>
            <Megaphone className="mb-3 size-5 text-primary" aria-hidden="true"/>
            <strong className="block text-sm">{option.label}</strong>
            <span className="mt-2 block text-xs leading-5 text-muted-foreground">{option.description}</span>
          </button>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <h2 className="text-lg font-semibold">Saved packages ({visible.length})</h2>
          <Button variant="outline" size="sm" onClick={()=>setShowArchived(value=>!value)}>
            {showArchived?"View active":"View archived"}
          </Button>
        </div>
        {!visible.length&&<WorkspacePanel title="No packages in this view">
          <p className="text-sm text-muted-foreground">Create a package to save your messaging for future use.</p>
        </WorkspacePanel>}
        <div className="space-y-3">{visible.map(item=><article key={item.id}
          className="flex flex-wrap items-center gap-4 border bg-card p-4">
          <div className="flex size-11 items-center justify-center bg-muted"><FileText className="size-5"/></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">{item.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {marketingPurposeOptions.find(option=>option.id===item.content.purpose)?.label}
              {" · "}{item.status==="archived"?"Archived":"Saved draft"}
              {" · "}{new Date(item.updatedAt).toLocaleDateString()}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={()=>open(item)}>Open</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={()=>void duplicate(item)}
            aria-label={"Duplicate "+item.title}><Copy aria-hidden="true"/></Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={()=>void setArchived(item)}
            aria-label={(item.status==="archived"?"Restore ":"Archive ")+item.title}>
            {item.status==="archived"?<RotateCcw aria-hidden="true"/>:<Archive aria-hidden="true"/>}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={()=>setDeleteCandidate(item)}
            aria-label={"Delete "+item.title}><Trash2 aria-hidden="true"/></Button>
        </article>)}</div>
        <WorkspacePanel title={module==="promote"?"Continue in Introduce":"Continue with existing capabilities"}
          description={context.handoffDescription}>
          <div className="grid gap-3">
            {context.handoffs.map(item=><div key={item.title}
              className="flex flex-wrap items-center justify-between gap-3 border bg-background p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
              </div>
              <Button asChild variant="outline" size="sm"><a href={item.href(siteId)}>
                Continue <ArrowRight aria-hidden="true"/>
              </a></Button>
            </div>)}
          </div>
        </WorkspacePanel>
        <ActionFooter><Button variant="outline" onClick={()=>void exitLaunch()}>Back to Launch Overview</Button></ActionFooter>
      </>}

      {view==="wizard"&&<>
        <nav aria-label="Package steps" className="grid gap-2 sm:grid-cols-4">
          {steps.map((value,index)=><div key={value}
            aria-current={index===step?"step":undefined}
            className={"border px-3 py-3 text-left text-xs font-semibold focus-visible:ring-2 focus-visible:ring-ring "+
              (index===step?"border-primary bg-accent text-primary":"bg-card text-muted-foreground")}
>
            <span className="mr-2">{index+1}.</span>{stepLabels[index]}
          </div>)}
        </nav>

        {step===0&&<WorkspacePanel title="What would you like to share?" description="Choose a starting point. Your Site brand will be reused automatically later.">
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {purposeOptions.map(option=><label key={option.id}
              className={"flex cursor-pointer gap-3 border p-4 text-sm "+
                (content.purpose===option.id?"border-primary bg-accent":"bg-card")}>
              <Radio name="package-purpose" className="mt-1"
                checked={content.purpose===option.id} onChange={()=>
                  patch({...starter(option.id),audiences:content.audiences,formats:content.formats})}/>
              <span><strong>{option.label}</strong><span className="mt-1 block text-xs text-muted-foreground">{option.description}</span></span>
            </label>)}
          </div>
          <div className="mt-5"><Field label="Package name" required>
            <Input value={title} maxLength={120} onChange={event=>setTitle(event.target.value)}/>
          </Field></div>
        </WorkspacePanel>}

        {step===1&&<WorkspacePanel title="Who do you want to reach?" description="Select your intended audiences. This does not add contacts or authorize emails.">
          <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Intended audiences</legend>
            {marketingAudienceOptions.map(option=><label key={option.id}
              className="flex min-h-11 items-center gap-3 border bg-card p-3 text-sm">
              <Checkbox checked={content.audiences.includes(option.id)}
                onChange={event=>patch({audiences:event.target.checked
                  ? [...new Set([...content.audiences,option.id])]
                  : content.audiences.filter(id=>id!==option.id)})}/>
              {option.label}
            </label>)}
          </fieldset>
          <div className="mt-5"><Field label="Geographic focus (optional)">
            <Input maxLength={120} value={content.geography} placeholder="Your community or neighborhood"
              onChange={event=>patch({geography:event.target.value})}/>
          </Field></div>
        </WorkspacePanel>}

        {step===2&&<WorkspacePanel title="Your message"
          description="Start with your Site's saved vision and learning interests. Review each suggestion before sharing it.">
          {currentSuggestion&&<div className="mt-4 space-y-3 border bg-muted/30 p-4">
            <p className="text-sm font-semibold">Built from what you already shared</p>
            <p className="text-xs leading-5 text-muted-foreground">
              {currentSuggestion.sources.length
                ? currentSuggestion.sources.join(" · ")
                : "No saved Site Story or program interests yet. Start with this editable introduction."}
              {" "}These are proposed plans, not verified offerings or enrollment claims.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy}
                onClick={()=>patch({
                  headline:starter(content.purpose).headline,
                  message:starter(content.purpose).message,
                  callToAction:starter(content.purpose).callToAction,
                })}>Restore suggested message</Button>
              {currentSuggestion.websiteAlternative&&<Button type="button" size="sm"
                variant="outline" disabled={busy}
                onClick={()=>{
                  const alternative=currentSuggestion.websiteAlternative;
                  if(alternative)patch({
                    headline:alternative.headline||content.headline,
                    message:alternative.message,
                  });
                }}>Use saved website wording</Button>}
            </div>
            {currentSuggestion.websiteAlternative&&<p className="text-xs leading-5 text-muted-foreground">
              Website wording is a separate suggestion and never overwrites your edits automatically.
              Review any private planning details before generating materials.
            </p>}
          </div>}
          <div className="mt-4 space-y-5">
            <Field label="Headline" required><Input maxLength={160} value={content.headline}
              onChange={event=>patch({headline:event.target.value})}/></Field>
            <Field label="Your message" required><Textarea rows={7} maxLength={1600}
              value={content.message} onChange={event=>patch({message:event.target.value})}/></Field>
            <Field label="Call to action"><Input maxLength={100} value={content.callToAction}
              onChange={event=>patch({callToAction:event.target.value})}/></Field>
          </div>
        </WorkspacePanel>}

        {step===3&&<WorkspacePanel title="Choose and preview your materials"
          description="Your saved Site Brand is applied automatically. Review the real layout for each format before saving the package.">
          <div className="mt-4 grid min-w-0 gap-5 xl:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)]">
            <fieldset className="min-w-0 space-y-3">
              <legend className="text-sm font-semibold">Available formats</legend>
              <p className="text-xs leading-5 text-muted-foreground">
                Select the materials you need, then preview each one.
              </p>
              {marketingFormatOptions.map(option=>{
                const selected=content.formats.includes(option.id);
                return <div key={option.id} className={"flex min-w-0 flex-wrap items-start gap-2 border p-3 "+
                  (selected?"border-primary/60 bg-accent/25":"border-border bg-card")}>
                  <Checkbox id={"marketing-format-"+option.id} className="mt-1"
                    checked={selected}
                    onChange={event=>{
                      patch({formats:event.target.checked
                        ? [...new Set([...content.formats,option.id])]
                        : content.formats.filter(id=>id!==option.id)});
                      if(event.target.checked)setPreviewFormat(option.id);
                    }}/>
                  <label htmlFor={"marketing-format-"+option.id}
                    className="min-w-0 flex-1 cursor-pointer text-sm">
                    <strong className="block">{option.label}</strong>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </label>
                  <Button type="button" size="sm" variant="outline" disabled={!selected}
                    aria-pressed={activePreviewFormat===option.id}
                    onClick={()=>setPreviewFormat(option.id)}>Preview</Button>
                </div>;
              })}
            </fieldset>
            <div className="min-w-0">
              {activePreviewFormat
                ? <MarketingMaterialPreviewV61
                    siteId={siteId}
                    brandVersionId={record?.brandVersionId??null}
                    format={activePreviewFormat}
                    content={content}/>
                : <div className="flex min-h-72 items-center justify-center border bg-muted/25 p-6">
                    <p className="text-center text-sm text-muted-foreground">
                      Select a material format to preview your design.
                    </p>
                  </div>}
            </div>
          </div>
          <div className="mt-4"><WorkspaceNotice tone="info">
            This is a private working preview, not a public release.
            Graphic layouts use a shortened excerpt if the message is long. The full copy stays in your package.
            Save your package to generate immutable, downloadable materials; email sending is separate.
          </WorkspaceNotice></div>
        </WorkspacePanel>}

        <ActionFooter>
          <Button variant="outline" disabled={busy} onClick={()=>{if(step===0)void leaveWizard();else setStep(value=>value-1);}}>
            <ArrowLeft aria-hidden="true"/> {step===0?"Cancel":"Back"}
          </Button>
          {record&&<Button variant="outline" disabled={busy} onClick={()=>void saveExit()}>Save &amp; Exit</Button>}
          <Button disabled={busy} onClick={()=>void next()}>
            {busy?"Saving…":step===3?"Save package":"Save & Continue"}
            {step===3?<Check aria-hidden="true"/>:<ArrowRight aria-hidden="true"/>}
          </Button>
        </ActionFooter>
      </>}

      {view==="detail"&&record&&<>
        <WorkspacePanel title={record.title} description="Reusable package content, saved for your Site.">
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
              ? <WorkspaceNotice tone="attention">Restore this package before using it for a new activity.</WorkspaceNotice>
              : <Button asChild variant="outline"><a href={
                packageHandoff.href(siteId,record.id)
              }>Continue with this package <ArrowRight aria-hidden="true"/></a></Button>}
          </WorkspacePanel>}
        <WorkspaceNotice tone="info">The package's content is saved. New branded releases are available to download. Sending marketing email requires separate authorization.</WorkspaceNotice>
        <WorkspacePanel title="Package release"
          description="Release every selected format together. A Package Release is a frozen set; edits never change an earlier download or email.">
          <div className="space-y-4">
            <p className="text-sm">Selected identity:
              <strong>{record.brandVersionId
                ? selectedBrandRevision!==null
                  ? " Brand v"+selectedBrandRevision
                  : " Saved Site Brand"
                : " No saved Brand selected"}</strong>
            </p>
            {currentBrand&&currentBrand.id!==record.brandVersionId&&
              <div className="flex flex-wrap items-center justify-between gap-3 border p-3">
                <p className="text-sm">Brand v{currentBrand.revision} is available in Establish.
                  Updating your working Package will not change older releases.</p>
                <Button type="button" variant="outline" disabled={busy||record.status==="archived"}
                  onClick={()=>void selectCurrentBrand()}>Use newer Brand</Button>
              </div>}
            {releasesLoading&&<p role="status" className="text-sm text-muted-foreground">Loading Package Release history…</p>}
            {releasesUnavailable&&<WorkspaceNotice tone="attention">Package history is unavailable. To avoid duplicate releases, reload the history before generating new material.
              <Button type="button" variant="outline" size="sm"
                onClick={()=>setReleaseRefreshKey(value=>value+1)}>Retry history</Button>
            </WorkspaceNotice>}
            {!releasesLoading&&latestPackageRelease&&<div className="space-y-2 border bg-muted/25 p-4">
              <p className="text-sm font-semibold">Latest generated: Package Release v{latestPackageRelease.releaseNumber}</p>
              {packageChanges.length
                ? <p className="text-sm">Updates available: {packageChanges.join(", ")}. Preview and release an updated Package when ready.</p>
                : <p className="text-sm text-muted-foreground">The working Package matches the latest generated release. Reuse that release instead of creating a duplicate.</p>}
            </div>}
            {!releasesLoading&&!latestPackageRelease&&
              <p className="text-sm text-muted-foreground">This Package has no grouped release yet. Your first release will contain every selected format.</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy||record.status==="archived"}
                onClick={()=>{setTitle(record.title);setContent(record.content);setStep(3);setView("wizard");}}>
                Preview Package
              </Button>
              <Button type="button" disabled={busy||releasesLoading||releasesUnavailable||record.status==="archived"||!record.brandVersionId||packageUpToDate}
                onClick={()=>void releasePackage()}>
                {latestPackageRelease?"Release Updated Package":"Release Package"}
              </Button>
            </div>
            <WorkspaceNotice tone="info">Release creates all selected formats atomically. It does not publish the website,
              send email, update scheduled communications, or change earlier Package Releases.</WorkspaceNotice>
          </div>
        </WorkspacePanel>
        <WorkspacePanel title="Package release history"
          description="Downloads are grouped by Package Release. Every version preserves its original Brand, message and outputs.">
          <div className="space-y-3">
            {releasesLoading&&<p role="status" className="text-sm text-muted-foreground">Loading releases…</p>}
            {!releasesLoading&&packageReleases.length===0&&
              <p className="text-sm text-muted-foreground">No Package Releases yet.</p>}
            {!releasesLoading&&packageReleases.map((version,index)=>
              <details key={version.id} className="border bg-background" open={index===0}>
                <summary className="cursor-pointer p-4 text-sm font-semibold">
                  Package Release v{version.releaseNumber} {index===0?"· Latest generated":"· Previous version"}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {new Date(version.createdAt).toLocaleDateString()} · {version.formats.length} materials
                  </span>
                </summary>
                <div className="space-y-3 border-t p-4">
                  <p className="text-xs text-muted-foreground">
                    Saved content revision {version.packageRevision} · Brand preserved with this release
                  </p>
                  {!version.complete&&<WorkspaceNotice tone="attention">This historical release is incomplete.
                    Download the available original files individually; do not treat it as a full Package.</WorkspaceNotice>}
                  {version.outputs.some(item=>item.withdrawnAt)&&<WorkspaceNotice tone="attention">
                    At least one material was withdrawn. The full Package is unavailable, but unaffected
                    original files may still be downloaded individually.</WorkspaceNotice>}
                  <Button type="button" variant="outline" size="sm" disabled={busy||!packageReleaseIsDownloadableV61(version)}
                    onClick={()=>void downloadPackage(version)}>
                    <Download className="size-4" aria-hidden="true"/> Download Package ZIP
                  </Button>
                  <ul className="space-y-2">
                    {version.outputs.map(item=><li key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 border p-3">
                      <span className="text-sm">{marketingFormatOptions.find(x=>x.id===item.format)?.label??item.format}
                        {item.withdrawnAt?" · Withdrawn":""}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm"
                          disabled={busy||Boolean(item.withdrawnAt)}
                          onClick={()=>void compareRelease(item.id,item.format,version.releaseNumber)}>
                          Compare
                        </Button>
                        <Button type="button" variant="outline" size="sm"
                          disabled={busy||Boolean(item.withdrawnAt)}
                          onClick={()=>void downloadRelease(item.id)}>Original</Button>
                        {item.format!=="email"&&<Button type="button" variant="outline" size="sm"
                          disabled={busy||Boolean(item.withdrawnAt)}
                          onClick={()=>void downloadPng(item.id)}>PNG</Button>}
                        {item.format==="social"&&<Button type="button" variant="outline" size="sm"
                          disabled={busy||Boolean(item.withdrawnAt)}
                          onClick={()=>void copyCaption(item.id)}>Copy caption</Button>}
                      </div>
                    </li>)}
                  </ul>
                </div>
              </details>)}
            {!releasesLoading&&legacyReleases.length>0&&<details className="border bg-background">
              <summary className="cursor-pointer p-4 text-sm font-semibold">
                Previous individually generated materials ({legacyReleases.length})
              </summary>
              <ul className="space-y-2 border-t p-4">
                {legacyReleases.map(item=><li key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 border p-3">
                  <span className="text-xs">{item.format} · {new Date(item.createdAt).toLocaleDateString()}
                    {item.withdrawnAt?" · Withdrawn":""}</span>
                  <Button type="button" variant="outline" size="sm"
                    disabled={busy||Boolean(item.withdrawnAt)}
                    onClick={()=>void downloadRelease(item.id)}>Download original</Button>
                </li>)}
              </ul>
            </details>}
            {compare&&<section aria-label="Compare Package material" className="space-y-3 border p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-sm">Compare {compare.format} · Release v{compare.releaseNumber}</h3>
                <Button type="button" variant="ghost" size="sm" onClick={()=>setCompare(null)}>Close</Button>
              </div>
              <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-semibold">Original released material</p>
                  {compare.mimeType==="image/svg+xml"
                    ? <img src={"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(compare.body)}
                        alt={"Original "+compare.format+" from Package Release v"+compare.releaseNumber}
                        className="max-h-[36rem] max-w-full border bg-white object-contain"/>
                    : <iframe title="Original released email" sandbox="" srcDoc={compare.body}
                        className="h-[34rem] w-full border bg-white"/>}
                </div>
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-semibold">Current saved Package preview</p>
                  {record.content.formats.includes(compare.format)
                    ? <MarketingMaterialPreviewV61 siteId={siteId}
                        brandVersionId={record.brandVersionId}
                        format={compare.format} content={record.content}/>
                    : <p className="border p-4 text-sm">This format was removed from the working Package.
                        It remains available in the original release.</p>}
                </div>
              </div>
            </section>}
          </div>
        </WorkspacePanel>
        <ActionFooter>
          <Button variant="outline" onClick={()=>{setView("library");setRecord(null);}}>All packages</Button>
          <Button variant="outline" disabled={busy} onClick={()=>void duplicate(record)}><Copy aria-hidden="true"/> Duplicate</Button>
          <Button disabled={busy||record.status==="archived"} onClick={()=>open(record,true)}>Edit package</Button>
        </ActionFooter>
      </>}
      <ActionDialog open={Boolean(deleteCandidate)} title="Delete Marketing Package"
        description="Delete unused drafts only. Packages with generated materials must be archived so their released files remain available. This cannot be undone."
        confirmLabel="Delete package" destructive pending={busy}
        onClose={()=>setDeleteCandidate(null)}
        onConfirm={()=>{if(deleteCandidate)void remove(deleteCandidate);}} />
    </div>
  </WorkspaceShell>;
}
