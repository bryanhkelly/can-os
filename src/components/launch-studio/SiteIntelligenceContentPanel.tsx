import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import {Textarea} from "@/components/ui/textarea";
import {WorkspaceNotice} from "@/components/workspace";
import {previewSiteGeneration,generateSiteContent} from "@/modules/sites/site-content-generation.functions";
import type {GeneratedContent,SiteGenerationOptions,SiteGenerationTask} from "@/domain/site-content-generation";
import type {OutreachPlanV61} from "@/domain/marketing-package-v61";
type Preview=Awaited<ReturnType<typeof previewSiteGeneration>>;
type Result=Awaited<ReturnType<typeof generateSiteContent>>;
type DraftPatch={website:Partial<NonNullable<GeneratedContent["website"]>>|null;outreach:Partial<NonNullable<GeneratedContent["outreach"]>>|null};
const defaults:SiteGenerationOptions={tone:"welcoming",language:"en",includeStory:false,includeLeadership:false,includeExistingCopy:false,includePublicReferences:false};
const optionalSources=[{key:"includeStory",label:"Saved Site Story"},{key:"includeLeadership",label:"Consented leadership biographies"},{key:"includeExistingCopy",label:"Existing saved website copy"},{key:"includePublicReferences",label:"Saved public website and consented profile references"}] as const;
const fields:Record<string,string>={heroHeadline:"Homepage headline",welcomeMessage:"Welcome",localDescription:"Site story",schoolVision:"Vision",communityOutreach:"Community",headline:"Headline",message:"Message",callToAction:"Requested action"};
/** Single review-and-apply component. All results are unsaved editor proposals. */
export function SiteIntelligenceContentPanel({siteId,target,plan,disabled,onApply}:{
  siteId:string;target:SiteGenerationTask["target"];plan?:OutreachPlanV61;disabled:boolean;onApply:(draft:DraftPatch)=>void;
}){
  const [options,setOptions]=useState<SiteGenerationOptions>(defaults);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [result,setResult]=useState<Result|null>(null);
  const [approved,setApproved]=useState(false);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [selected,setSelected]=useState<string[]>([]);
  const task:SiteGenerationTask|null=target==="website"?{target,options}:plan?{target,options,plan}:null;
  const taskKey=JSON.stringify(task);
  const [reviewedKey,setReviewedKey]=useState("");
  const current=reviewedKey===taskKey;
  const canUse=!disabled&&!pending&&!!task;
  function change(patch:Partial<SiteGenerationOptions>){setOptions(old=>({...old,...patch}));setPreview(null);setResult(null);setApproved(false);setNotice("");setError("");}
  async function prepare(){
    if(!task||!canUse)return;setPending(true);setPreview(null);setResult(null);setApproved(false);setError("");setNotice("");
    try{setPreview(await previewSiteGeneration({data:{siteId,task}}));setReviewedKey(taskKey);}
    catch{setError("Could not prepare saved Site information. Verify your editing permissions and save content reuse permission first.");}
    finally{setPending(false);}
  }
  async function generate(){
    if(!task||!preview||!approved||!current||!canUse)return;setPending(true);setError("");setResult(null);setNotice("");
    try{const value=await generateSiteContent({data:{siteId,task,digest:preview.digest,externalProcessingConfirmed:true}});setResult(value);setSelected(Object.keys(value.content.website??value.content.outreach??{}));}
    catch{setError("No valid draft was returned. Check Gloo configuration, saved Site revisions and content permissions; then prepare again.");setPreview(null);setApproved(false);}
    finally{setPending(false);}
  }
  const draft=result?.content;
  const values=draft?.website??draft?.outreach;
  return <section className="space-y-3 border border-border p-4" aria-label="AI content generation">
    <div><h3 className="text-sm font-semibold">Write with Site Intelligence</h3><p className="mt-1 text-xs text-muted-foreground">Generate editable wording from the same saved Site information using Gloo AI Studio. Planned learning opportunities remain proposals. Nothing is saved or published automatically.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium">Tone<Select value={options.tone} disabled={disabled||pending} onChange={e=>change({tone:e.target.value as SiteGenerationOptions["tone"]})}><option value="welcoming">Welcoming</option><option value="professional">Professional</option><option value="community">Community-centered</option><option value="inspiring">Inspiring</option></Select></label>
      <label className="grid gap-1 text-sm font-medium">Language<Select value={options.language} disabled={disabled||pending} onChange={e=>change({language:e.target.value as SiteGenerationOptions["language"]})}><option value="en">English</option><option value="es">Spanish</option></Select></label>
    </div>
    <label className="grid gap-1 text-sm font-medium">Additional editorial guidance (optional)<Textarea rows={2} maxLength={600} value={options.guidance??""} disabled={disabled||pending} onChange={e=>change({guidance:e.target.value})} placeholder="Public-facing context only. Do not enter personal or confidential information."/></label>
    <fieldset className="space-y-2"><legend className="text-sm font-medium">Optional sources</legend>
      {optionalSources.map(source=><label key={source.key} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={options[source.key]} disabled={disabled||pending} onChange={e=>change({[source.key]:e.target.checked})}/>{source.label}</label>)}
    </fieldset>
    <Button type="button" variant="outline" disabled={!canUse} onClick={()=>void prepare()}>{pending&&!preview?"Preparing…":"Review AI input"}</Button>
    {preview&&current&&<div className="space-y-3">
      <WorkspaceNotice tone="attention">Only approve the exact information below if you are authorized to share it with Gloo AI. Remove optional sources or edit saved Site information if it contains private or confidential details. Public references are not automatically fetched.</WorkspaceNotice>
      <details className="border p-3" open><summary className="cursor-pointer text-sm font-medium">Exact JSON input sent to Gloo</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(preview.input,null,2)}</pre></details>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} disabled={pending||disabled} onChange={e=>setApproved(e.target.checked)}/>I have permission to send this exact input to Gloo AI Studio for editorial generation.</label>
      <Button type="button" disabled={!canUse||!approved} onClick={()=>void generate()}>{pending?"Generating…":"Generate draft"}</Button>
    </div>}
    {result&&current&&values&&<div className="space-y-3 border p-3">
      <p className="text-sm font-semibold">Generated draft · Review each field</p>
      <p className="text-xs text-muted-foreground">Gloo · {result.model} · Contract v{result.content.schemaVersion}. Review accuracy and suitability before applying.</p>
      {Object.entries(values).map(([key,value])=><label key={key} className="flex items-start gap-2 border p-3 text-sm"><input type="checkbox" checked={selected.includes(key)} disabled={disabled||pending} onChange={e=>setSelected(old=>e.target.checked?[...old,key]:old.filter(x=>x!==key))}/><span><strong>{fields[key]??key}</strong><span className="mt-1 block whitespace-pre-wrap">{value}</span></span></label>)}
      {result.content.reviewNotes.length>0&&<div className="text-xs text-muted-foreground"><strong>Review notes</strong><ul className="list-disc pl-5">{result.content.reviewNotes.map((note,i)=><li key={i}>{note}</li>)}</ul></div>}
      <Button type="button" disabled={disabled||pending||!selected.length} onClick={()=>{
        if(!draft||!values)return;
        const patch=Object.fromEntries(Object.entries(values).filter(([key])=>selected.includes(key)));
        // Selected field patch is deliberately separate from full provider contract.
        onApply({website:draft.website?patch:null,outreach:draft.outreach?patch:null});
        setNotice("Selected wording applied to your working editor. Review and save using the existing workflow.");setResult(null);
      }}>Apply selected wording</Button>
    </div>}
    {preview&&!current&&<p className="text-sm text-muted-foreground">Your outreach plan changed. Review the updated input before using a draft.</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-sm">{notice}</p>}
  </section>;
}
