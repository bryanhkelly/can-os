import { readSiteBrandVersionView } from "@/modules/sites/site-brand.functions";
import { MarketingMaterialPreviewV61 } from "./MarketingMaterialPreviewV61";
import { createSiteMarketingRelease, listSiteMarketingReleases, getSiteMarketingReleaseOutput } from "@/modules/programs/site-marketing-artifacts.functions";
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
import { downloadOriginalMarketingOutput, downloadMarketingPng } from "./marketing-output-download";
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
  const [currentBrand,setCurrentBrand]=useState<{id:string;revision:number}|null>(null);
  const [brandReadiness,setBrandReadiness]=useState<"loading"|"available"|"missing"|"unavailable">("loading");
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
  },[siteId]);
  useEffect(()=>{
    if(view!=="detail"||!record)return;
    let live=true;
    void Promise.all([
      listSiteMarketingReleases({data:{siteId,packageId:record.id}}),
      readSiteBrandVersionView({data:{siteId}}),
      record.brandVersionId
        ? readSiteBrandVersionView({data:{siteId,versionId:record.brandVersionId}})
        : Promise.resolve(null),
    ]).then(([records,brand,selected])=>{
      if(live){setReleases(records);
        setCurrentBrand(brand.current?.version
          ? {id:brand.current.version.id,revision:brand.current.version.revision}:null);
        setSelectedBrandRevision(selected?.current?.version.revision??null);}
    }).catch(error=>{if(live)setError(message(error));});
    return ()=>{live=false;};
  },[view,record?.id,record?.brandVersionId,siteId]);
  const dirty=view==="wizard" && (!record || title!==record.title ||
    JSON.stringify(content)!==JSON.stringify(record.content));
  const releaseNavigation=useLaunchUnsavedChanges(()=>dirty||busy,
    "Leave your Marketing Package? Unsaved changes will be lost.");

  function open(recordToOpen:PackageRecord,editing=false) {
    setRecord(recordToOpen);setTitle(recordToOpen.title);setContent(recordToOpen.content);
    setStep(0);setView(editing?"wizard":"detail");setError("");setNotice("");
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
  async function generate(format:MarketingPackageContent["formats"][number]){
    if(!record)return;
    await run(async()=>{
      await createSiteMarketingRelease({data:{
        siteId,packageId:record.id,expectedPackageRevision:record.revision,format,
      }});
      setReleases(await listSiteMarketingReleases({data:{siteId,packageId:record.id}}));
      setNotice("A new immutable "+format+" was generated. Earlier releases are unchanged.");
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
      {view==="library"&&brandReadiness==="unavailable"&&<WorkspaceNotice tone="attention">
        Site Brand status could not be checked. Existing packages remain available;
        the server will verify the selected Brand before creating any new materials.
      </WorkspaceNotice>}

      {view==="library"&&<>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{context.libraryDescription}</p>
          <Button disabled={busy||brandReadiness==="missing"} onClick={start}>
            <Plus aria-hidden="true"/> New package
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {purposeOptions.map(option=><button key={option.id} type="button"
            disabled={busy||brandReadiness==="missing"}
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
        {module==="interest-events" && record.content.purpose==="event-invitation" &&
          <WorkspacePanel title="Create an Interest Event"
            description="Reuse this saved invitation's headline as a starting title. Confirm the Program, date, time, location and event description in the separately authorized event workspace.">
            {record.status==="archived"
              ? <WorkspaceNotice tone="attention">Restore this package before using it for a new event.</WorkspaceNotice>
              : <Button asChild variant="outline"><a href={
                `/operations/interest-events/new?siteId=${encodeURIComponent(siteId)}&packageId=${encodeURIComponent(record.id)}`
              }>Continue with this package <ArrowRight aria-hidden="true"/></a></Button>}
          </WorkspacePanel>}
        <WorkspaceNotice tone="info">The package's content is saved. New branded releases are available to download. Sending marketing email requires separate authorization.</WorkspaceNotice>
        <WorkspacePanel title="Brand version and generated materials"
          description="Generated files retain their original Brand and message.">
          <div className="space-y-3">
            <p className="text-sm">Selected identity:
              <strong>{record.brandVersionId
                ? selectedBrandRevision!==null
                  ? " Brand v"+selectedBrandRevision
                  : " Selected saved Brand"
                : " No saved Brand selected"}</strong>
            </p>
            {currentBrand&&currentBrand.id!==record.brandVersionId&&
              <div className="flex flex-wrap items-center justify-between gap-3 border p-3">
                <p className="text-sm">A newer saved Brand (v{currentBrand.revision}) is available.
                  Existing releases remain unchanged.</p>
                <Button type="button" variant="outline" disabled={busy||record.status==="archived"}
                  onClick={()=>void selectCurrentBrand()}>Update package Brand</Button>
              </div>}
            <div className="flex flex-wrap gap-2">
              {record.content.formats.map(format=><Button key={format} type="button" variant="outline"
                disabled={busy||record.status==="archived"||!record.brandVersionId}
                onClick={()=>void generate(format)}>Generate {format}</Button>)}
            </div>
            {releases.length>0&&<ul className="space-y-2 border-t pt-3">
              {releases.map(item=><li key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 border p-3">
                <span className="text-xs">{item.format} · Package revision {item.packageRevision}
                  {" · "}{new Date(item.createdAt).toLocaleDateString()}
                  {item.withdrawnAt?" · Withdrawn":""}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm"
                    disabled={busy||Boolean(item.withdrawnAt)}
                    onClick={()=>void downloadRelease(item.id)}>
                    <Download className="size-4" aria-hidden="true"/> Download original
                  </Button>
                  {item.format!=="email"&&<Button type="button" variant="outline" size="sm"
                    disabled={busy||Boolean(item.withdrawnAt)}
                    onClick={()=>void downloadPng(item.id)}>PNG</Button>}
                  {item.format==="social"&&<Button type="button" variant="outline" size="sm"
                    disabled={busy||Boolean(item.withdrawnAt)}
                    onClick={()=>void copyCaption(item.id)}>Copy caption</Button>}
                </div>
              </li>)}
            </ul>}
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
