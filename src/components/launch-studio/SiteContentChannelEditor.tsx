import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, LayoutGrid, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  defaultSiteContentChannelConfig, siteContentChannelConfigSchema,
  siteContentChannelIds, siteContentChannelDescriptions,
  type SiteContentBlock, type SiteContentChannelConfig, type SiteContentChannelId,
} from "@/domain/site-content-channels";
import { saveSiteContentChannels, publishSiteContentChannels } from "@/modules/sites/site-content-channels.functions";
import { mutationErrorMessage } from "@/lib/mutation-feedback";

function newBlockId(channel:SiteContentChannelId,blocks:readonly SiteContentBlock[]):string{
  const prefix=channel.replaceAll(".","-");
  for(let n=1;n<=99;n++){
    const id=prefix+"-"+n;
    if(!blocks.some(block=>block.id===id))return id;
  }
  throw new Error("No available presentation block ID");
}
/** Site-owned presentation registry. Editors never input Program data, course
 * permissions or registration URLs; every channel pulls its own approved feed. */
export function SiteContentChannelEditor({siteId,initialConfig,canPublish=false,onSaved}:{
  siteId:string;
  initialConfig?:SiteContentChannelConfig|null;
  canPublish?:boolean;
  onSaved:()=>void;
}) {
  const initial=initialConfig??defaultSiteContentChannelConfig;
  const [revision,setRevision]=useState(initial.revision);
  const [blocks,setBlocks]=useState<SiteContentBlock[]>(initial.blocks.map(b=>({...b})));
  const [addChannel,setAddChannel]=useState<SiteContentChannelId| "">("");
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(false);
  const [publishing,setPublishing]=useState(false);
  const [published,setPublished]=useState(false);
  const available=siteContentChannelIds;

  function editBlock(id:string,change:Partial<SiteContentBlock>) {
    setBlocks(old=>old.map(block=>block.id===id?{...block,...change}:block));
    setSaved(false);setPublished(false);
  }
  function addBlock(){
    if(!addChannel||blocks.length>=12)return;
    const info=siteContentChannelDescriptions[addChannel];
    setBlocks(old=>[...old,{
      id:newBlockId(addChannel,blocks),channel:addChannel,
      placement:"learning",layout:"cards",enabled:true,
      eyebrow:info.defaultEyebrow,title:info.defaultTitle,description:info.defaultDescription,
    }]);
    setAddChannel("");
    setSaved(false);setPublished(false);
  }
  function moveBlock(id:string,offset:-1|1){
    setBlocks(old=>{
      const index=old.findIndex(block=>block.id===id);
      const other=index+offset;
      if(index<0||other<0||other>=old.length)return old;
      const next=[...old];
      [next[index],next[other]]=[next[other]!,next[index]!];
      return next;
    });
    setSaved(false);setPublished(false);
  }
  function duplicateBlock(block:SiteContentBlock){
    if(blocks.length>=12)return;
    setBlocks(old=>[...old,{...block,id:newBlockId(block.channel,old)}]);
    setSaved(false);setPublished(false);
  }
  async function save(){
    if(!siteId||saving)return;
    const parsed=siteContentChannelConfigSchema.safeParse({version:2,revision,blocks});
    if(!parsed.success){setError(parsed.error.issues[0]?.message??"Review channel settings.");return;}
    setError("");setSaving(true);
    try{
      const next=await saveSiteContentChannels({data:{
        siteId,expectedRevision:revision,blocks:parsed.data.blocks,
      }});
      setRevision(next.revision);
      setBlocks(next.blocks.map(block=>({...block})));
      setSaved(true);
      setPublished(false);
      onSaved();
    }catch(e){setError(mutationErrorMessage(e,"Unable to save Site content channels. Reload if another editor changed them."));}
    finally{setSaving(false);}
  }
  async function publish(){
    if(!siteId||saving||publishing)return;
    setError("");setPublishing(true);
    try{
      const outcome=await publishSiteContentChannels({data:{siteId,expectedRevision:revision}});
      setPublished(true);
      setSaved(false);
      if(!outcome.changed)onSaved();
    }catch(e){setError(mutationErrorMessage(e,"Publication requires an authorized Site website publisher. No public content changed."));}
    finally{setPublishing(false);}
  }
  return <section className="border bg-card p-6 sm:p-8" aria-labelledby="site-channel-editor-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Site content channels</p>
        <h3 id="site-channel-editor-title" className="mt-2 flex items-center gap-2 font-serif text-2xl">
          <LayoutGrid className="size-5"/> Arrange your website content
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Choose which data channels appear, where they belong, and how they look.
          Content is pulled from this Site's saved plans and independently approved catalogs.
          These controls cannot create, approve, publish, or enroll in a Program.
        </p>
      </div>
      <span className="border px-3 py-2 text-xs text-muted-foreground">Configuration revision {revision}</span>
    </div>
    <div className="mt-5 space-y-4">
      {blocks.map(block=>{
        const info=siteContentChannelDescriptions[block.channel];
        return <fieldset key={block.id} className="border p-4 sm:p-5">
          <legend className="px-2 text-sm font-semibold">{info.label}</legend>
          <p className="mb-4 text-xs text-muted-foreground">{info.description}
            {info.privateOnly ? " This channel is never included on the public website." : " Only authorized catalog records appear."}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Block heading"><Input value={block.title} maxLength={120}
              onChange={e=>editBlock(block.id,{title:e.target.value})}/></Field>
            <Field label="Eyebrow"><Input value={block.eyebrow} maxLength={64}
              onChange={e=>editBlock(block.id,{eyebrow:e.target.value})}/></Field>
            <Field label="Website page"><Select value={block.page??"/"}
              onChange={e=>editBlock(block.id,{page:e.target.value as SiteContentBlock["page"]})}>
              <option value="/">Homepage</option>
              <option value="/programs">Programs page</option>
              <option value="/courses">Courses page</option>
              <option value="/classes">Classes page</option>
              <option value="/academics">Academics page</option>
              <option value="/student-life">Community experiences page</option>
            </Select></Field>
            <Field label="Placement"><Select value={block.placement}
              onChange={e=>editBlock(block.id,{placement:e.target.value as SiteContentBlock["placement"]})}>
              <option value="learning">Learning / programs</option>
              <option value="community">Community / experiences</option>
              <option value="closing">Before the footer</option>
            </Select></Field>
            <Field label="Presentation"><Select value={block.layout}
              onChange={e=>editBlock(block.id,{layout:e.target.value as SiteContentBlock["layout"]})}>
              <option value="cards">Program cards</option>
              <option value="list">Editorial list</option>
              <option value="featured">Featured content</option>
            </Select></Field>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {block.channel==="learning.opportunities"&&<Field label="Enrollment type">
              <Select value={block.targetKinds?.[0]??""}
                onChange={e=>editBlock(block.id,{targetKinds:e.target.value
                  ?[e.target.value as "school"|"program"|"course"|"class"]:[]})}>
                <option value="">All enrollment types</option>
                <option value="school">Schools</option>
                <option value="program">Programs</option>
                <option value="course">Courses</option>
                <option value="class">Classes</option>
              </Select>
            </Field>}
            <Field label="Order">
              <Select value={block.sort??"source"}
                onChange={e=>editBlock(block.id,{sort:e.target.value as SiteContentBlock["sort"]})}>
                <option value="source">Source order</option>
                <option value="title">Alphabetical</option>
                <option value="upcoming">Next scheduled</option>
              </Select>
            </Field>
            <Field label="Maximum items">
              <Select value={String(block.limit??12)}
                onChange={e=>editBlock(block.id,{limit:Number(e.target.value)})}>
                <option value="3">3</option>
                <option value="6">6</option>
                <option value="12">12</option>
                <option value="24">24</option>
                <option value="40">40</option>
              </Select>
            </Field>
          </div>
          <Field label="Section description" className="mt-4">
            <textarea value={block.description} maxLength={320} rows={3}
              onChange={e=>editBlock(block.id,{description:e.target.value})}
              className="w-full border border-input bg-card p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary"/>
          </Field>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" checked={block.enabled} className="size-4"
                onChange={e=>editBlock(block.id,{enabled:e.target.checked})}/>
              Show this block when source records are available
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={blocks[0]?.id===block.id}
                onClick={()=>moveBlock(block.id,-1)}><ArrowUp/> Up</Button>
              <Button variant="outline" disabled={blocks[blocks.length-1]?.id===block.id}
                onClick={()=>moveBlock(block.id,1)}><ArrowDown/> Down</Button>
              <Button variant="outline" disabled={blocks.length>=12}
                onClick={()=>duplicateBlock(block)}><Copy/> Duplicate</Button>
              <Button variant="outline" onClick={()=>{setBlocks(old=>old.filter(b=>b.id!==block.id));setSaved(false);setPublished(false);}}>
              <Trash2/> Remove block
              </Button>
            </div>
          </div>
        </fieldset>
      })}
    </div>
    {blocks.length<12&&<div className="mt-5 flex flex-wrap items-end gap-3 border-t pt-5">
      <Field label="Add a content channel" className="min-w-[230px] flex-1">
        <Select value={addChannel} onChange={e=>setAddChannel(e.target.value as SiteContentChannelId|"")}>
          <option value="">Choose a data channel</option>
          {available.map(id=><option key={id} value={id}>{siteContentChannelDescriptions[id].label}</option>)}
        </Select>
      </Field>
      <Button variant="outline" disabled={!addChannel} onClick={addBlock}><Plus/> Add block</Button>
    </div>}
    {error&&<p role="alert" className="mt-4 border border-destructive p-3 text-sm text-destructive">{error}</p>}
    {saved&&<p role="status" className="mt-4 text-sm text-success">Saved as a private Site configuration. The preview has been refreshed. Publish separately to update the public website.</p>}
    {published&&<p role="status" className="mt-4 text-sm text-success">Website content block settings published. This does not approve Programs or make a Site publicly reachable.</p>}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-xl text-xs leading-5 text-muted-foreground">
        Site blocks customize presentation only. Planning interests remain private;
        approved programs retain their existing content and publication reviews.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={saving||publishing||!siteId} onClick={()=>void save()}>
          <Save/>{saving?"Saving channels…":"Save private blocks"}
        </Button>
        {canPublish&&<Button variant="outline" disabled={saving||publishing||!siteId||!saved}
          onClick={()=>void publish()}>
          {publishing?"Publishing…":"Publish approved content blocks"}
        </Button>}
      </div>
    </div>
  </section>;
}
