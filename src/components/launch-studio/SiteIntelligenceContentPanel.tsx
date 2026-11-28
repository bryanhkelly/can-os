import {useEffect,useRef,useState} from "react";
import {Checkbox} from "@/components/ui/choice";
import {Field} from "@/components/ui/field";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import {Textarea} from "@/components/ui/textarea";
import {WorkspaceNotice,AsyncOperationStatus} from "@/components/workspace";
import {SiteGenerationStatus,type GenerationFeedback} from "./SiteGenerationStatus";
import {readSiteIntelligenceContent,previewSiteIntelligence} from "@/modules/sites/site-content-generation.functions";
import {runSiteGeneration} from "./useSiteGeneration";
import type {SiteContentPackage} from "@/domain/site-content-package";
import type {SiteGenerationOptions} from "@/domain/site-content-generation";
import type {MarketingPackageContent} from "@/domain/marketing-package-v61";
type Stored=Awaited<ReturnType<typeof readSiteIntelligenceContent>>;
type Preview=Awaited<ReturnType<typeof previewSiteIntelligence>>;
type Patch={website:Partial<SiteContentPackage["website"]>|null;websiteComposition?:SiteContentPackage["websiteComposition"];outreach:Partial<SiteContentPackage["marketing"]["site-announcement"]>|null};
const defaults:SiteGenerationOptions={tone:"welcoming",language:"en",includeStory:false,includeLeadership:false,includeExistingCopy:false,includePublicReferences:false};
const optionalSources=[{key:"includeStory",label:"Saved Site Story"},{key:"includeLeadership",label:"Consented leadership biographies"},{key:"includeExistingCopy",label:"Existing saved website copy"},{key:"includePublicReferences",label:"Saved public website and consented profile references"}] as const;
const fields:Record<string,string>={heroHeadline:"Homepage headline",welcomeMessage:"Welcome",localDescription:"Site story",schoolVision:"Vision",communityOutreach:"Community",headline:"Headline",message:"Message",callToAction:"Requested action"};
/** A database reader shared by Website and Marketing. Only the Website
 * surface exposes the central Site package processing command. */
type PanelProps={siteId:string;target:"website"|"outreach";purpose?:MarketingPackageContent["purpose"];disabled:boolean;onApply:(draft:Patch)=>void};
export function SiteIntelligenceContentPanel(props:PanelProps){
 return <SiteIntelligenceSession key={JSON.stringify([props.siteId,props.target,props.purpose])} {...props}/>;
}
function SiteIntelligenceSession({siteId,target,purpose="site-announcement",disabled,onApply}:PanelProps){
 const [options,setOptions]=useState<SiteGenerationOptions>(defaults);
 const [stored,setStored]=useState<Stored|null>(null);
 const [preview,setPreview]=useState<Preview|null>(null);
 const [approved,setApproved]=useState(false);
 const [pending,setPending]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [feedback,setFeedback]=useState<GenerationFeedback|null>(null);
 const [selected,setSelected]=useState<string[]>([]);
 const [refresh,setRefresh]=useState(0);
 const generation=useRef(0);
 useEffect(()=>{
   const requestId=++generation.current;
   setStored(null);setSelected([]);
   void readSiteIntelligenceContent({data:{siteId,consumer:target}}).then(value=>{
     if(generation.current===requestId)setStored(value);
   }).catch(()=>{
     if(generation.current===requestId)setError("Stored Site Intelligence could not be loaded. Check your Site access and deployment readiness.");
   });
   return ()=>{generation.current++;};
 },[siteId,target,refresh]);
 useEffect(()=>{setSelected([]);},[purpose]);
 const canUse=!disabled&&!pending;
 const request={siteId,consumer:target,options};
 function change(patch:Partial<SiteGenerationOptions>){setOptions(old=>({...old,...patch}));setPreview(null);setApproved(false);setError("");setFeedback(null);}
 async function prepare(){
   if(target!=="website"||!canUse)return;
   setPending(true);setPreview(null);setApproved(false);setError("");setNotice("");setFeedback(null);
   try{setPreview(await previewSiteIntelligence({data:request}));}
   catch{setError("Could not prepare saved Site information. Verify editing permissions and save content reuse permission first.");}
   finally{setPending(false);}
 }
 async function process(){
   if(target!=="website"||!preview?.eligibility.allowed||!approved||!canUse)return;
   setPending(true);setError("");setNotice("");setFeedback(null);
   try{
     const result=await runSiteGeneration(request,preview);
     if(result.success)setNotice("Site Intelligence package is available in both Website and Marketing.");
     else setFeedback({kind:result.kind==="ready"?"refresh-required":result.kind,message:result.message});
     setPreview(null);setApproved(false);setRefresh(n=>n+1);
   }catch{setError("Processing could not be confirmed. Reload stored content before retrying if permitted.");}
   finally{setPending(false);}
 }
 const item=stored?.package;
 const values=target==="website"?item?.website:item?.marketing?.[purpose];
 return <section className="space-y-3 border border-border p-4" aria-label="Site Intelligence content">
   <div><h3 className="text-sm font-semibold">Site Intelligence</h3><p className="mt-1 text-xs text-muted-foreground">Use the shared, saved Site content package. Website and Marketing read the same database version. Applying wording does not publish it.</p></div>
   <div className="flex flex-wrap items-center justify-between gap-2">
     <p className="text-sm">{item?("Stored content v"+item.revision+" · "+(item.language==="es"?"Spanish":"English")):stored?.status==="consent-required"?"Saved content reuse permission is required.":stored?.status==="processing"?"Processing is in progress.":stored?.status==="refresh-required"?"A new processing run is required.":stored?.status==="not-generated"?"No content package has been processed yet.":error?"Stored content unavailable.":"Reading stored content…"}</p>
     <Button type="button" size="sm" variant="outline" disabled={pending} onClick={()=>setRefresh(n=>n+1)}>Reload stored content</Button>
   </div>
   {stored?.generation&&<p role="status" className="text-xs text-muted-foreground">Latest generation: {stored.generation.status} · {stored.generation.attempts} attempts{stored.generation.errorCode?" · "+stored.generation.errorCode:""}</p>}
   {stored?.status==="ready"&&stored.latestStatus==="processing"&&<WorkspaceNotice>New content is processing. The displayed version is the last compatible stored package.</WorkspaceNotice>}
   {stored?.status==="ready"&&stored.latestStatus==="failed"&&<WorkspaceNotice tone="attention">The latest processing attempt failed. The displayed version remains available for review.</WorkspaceNotice>}
   {item?.stale&&<WorkspaceNotice tone="attention">Saved Site information has changed since this package was generated. Review all wording against current information before use.</WorkspaceNotice>}
   {values&&item&&<div className="space-y-3">
     <p className="text-xs text-muted-foreground">Select only the wording you want to use. Your existing copy stays unchanged until you apply a selection.</p>
     {Object.entries(values).map(([key,value])=><label key={key} className="flex items-start gap-2 border p-3 text-sm"><Checkbox checked={selected.includes(key)} disabled={disabled||pending} onChange={e=>setSelected(old=>e.target.checked?[...old,key]:old.filter(x=>x!==key))}/><span><strong>{fields[key]??key}</strong><span className="mt-1 block whitespace-pre-wrap">{value}</span></span></label>)}
     {item.reviewNotes.length>0&&<div className="text-xs text-muted-foreground"><strong>Review notes</strong><ul className="list-disc pl-5">{item.reviewNotes.map((note,i)=><li key={i}>{note}</li>)}</ul></div>}
     <Button type="button" disabled={!canUse||!selected.length} onClick={()=>{
       const patch=Object.fromEntries(Object.entries(values).filter(([key])=>selected.includes(key)));
       onApply({website:target==="website"?patch:null,websiteComposition:target==="website"&&!item.stale?item.websiteComposition??undefined:undefined,outreach:target==="outreach"?patch:null});
       setNotice("Selected stored wording applied to your working editor. Review the website preview and save using the existing workflow.");setSelected([]);
     }}>Use selected stored wording</Button>
   </div>}
   {target==="outreach"&&<p className="text-xs text-muted-foreground">Process or refresh the shared Site content package in Website &amp; Brand. Marketing does not invoke Gloo.</p>}
   {target==="website"&&<details className="space-y-3 border p-3" open={!item}>
     <summary className="cursor-pointer text-sm font-semibold">Process or refresh Site Intelligence</summary>
     <p className="text-xs text-muted-foreground">One Gloo processing run creates both website and outreach content, with reusable descriptions for audiences, programs and experiences. The validated result is stored before it is available to any editor.</p>
     <div className="grid gap-3 sm:grid-cols-2">
       <Field label="Tone">
          <Select value={options.tone} disabled={!canUse} onChange={e=>change({tone:e.target.value as SiteGenerationOptions["tone"]})}><option value="welcoming">Welcoming</option><option value="professional">Professional</option><option value="community">Community-centered</option><option value="inspiring">Inspiring</option></Select>
        </Field>
       <Field label="Language">
          <Select value={options.language} disabled={!canUse} onChange={e=>change({language:e.target.value as SiteGenerationOptions["language"]})}><option value="en">English</option><option value="es">Spanish</option></Select>
        </Field>
     </div>
     <Field label="Additional editorial guidance (optional)"><Textarea rows={2} maxLength={600} value={options.guidance??""} disabled={!canUse} onChange={e=>change({guidance:e.target.value})} placeholder="Public-facing context only. Do not enter confidential information."/></Field>
     <fieldset className="space-y-2"><legend className="text-sm font-medium">Optional sources</legend>
       {optionalSources.map(source=><label key={source.key} className="flex items-start gap-2 text-sm"><Checkbox checked={options[source.key]} disabled={!canUse} onChange={e=>change({[source.key]:e.target.checked})}/>{source.label}</label>)}
     </fieldset>
     <Button type="button" variant="outline" disabled={!canUse} onClick={()=>void prepare()}>{pending&&!preview?"Preparing…":"Review processing input"}</Button>
     {preview&&<div className="space-y-3">
       <WorkspaceNotice tone="attention">Review the exact data to be sent to Gloo. Only approve information you are authorized to share. Public references are not automatically fetched.</WorkspaceNotice>
       <details className="border p-3"><summary className="cursor-pointer text-sm font-medium">Exact JSON input sent to Gloo</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(preview.input,null,2)}</pre></details>
       <label className="flex items-start gap-2 text-sm"><Checkbox checked={approved} disabled={!canUse} onChange={e=>setApproved(e.target.checked)}/>I have permission to send this exact input to Gloo AI Studio for editorial processing.</label>
       <SiteGenerationStatus eligibility={preview.eligibility} pending={pending} disabled={disabled} onReload={()=>void prepare()}/>
       <Button type="button" disabled={!canUse||!approved||!preview.eligibility.allowed} loading={pending} loadingLabel="Processing…" onClick={()=>void process()}>Process and store content package</Button>
     </div>}
   </details>}
   {feedback&&<AsyncOperationStatus title="Last processing request" state={feedback.kind==="refresh-required"?{kind:"partial",detail:feedback.message}:feedback.kind==="processing"?{kind:"running"}:feedback.kind==="ready"?{kind:"succeeded"}:feedback.kind==="blocked"?{kind:"unavailable",detail:feedback.message}:{kind:"failed",detail:feedback.message}} recovery={<Button type="button" variant="outline" disabled={pending} onClick={()=>{setError("");setRefresh(n=>n+1);}}>Reload stored content</Button>}/>}
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   {notice&&<p role="status" className="text-sm">{notice}</p>}
 </section>;
}
