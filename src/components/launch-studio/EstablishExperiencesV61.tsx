import { useState, type Dispatch, type SetStateAction } from "react";
import { ArrowLeft, ArrowRight, Check, Pencil, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceNotice } from "@/components/workspace";
import type { SiteExperienceDetail, SiteProgramsAudiencesV61 } from "@/domain/site-launch-preferences";
import {
  siteExperienceGroups,siteExperienceCatalog,siteExperienceById,
  siteExperienceOutcomes,siteExperienceLimit,siteExperienceActivityLimit,
  siteExperienceOutcomeLimit,siteExperienceAudienceNames,siteExperienceProgramNames,
  suggestedSiteExperiences,describeSiteExperience,
  type SiteExperienceGroupId,type SiteExperienceId,type SiteExperienceOutcomeId,
  type SiteExperienceAudienceId,type SiteExperienceProgramId,
} from "@/domain/site-experience-interests";

type Stage="choose"|"personalize"|"review";
type Props={
  draft:SiteProgramsAudiencesV61;
  setDraft:Dispatch<SetStateAction<SiteProgramsAudiencesV61>>;
  disabled:boolean;
};

/** A guided V6.1 Site-vision surface, not another Program/Solution editor.
 * Catalog discovery, structured chip selection and website-ready review all
 * update the one canonical Site planning draft. */
export function EstablishExperiencesV61({draft,setDraft,disabled}:Props){
  const [stage,setStage]=useState<Stage>("choose");
  const [group,setGroup]=useState<SiteExperienceGroupId>("academic");
  const [query,setQuery]=useState("");
  const [activeId,setActiveId]=useState<SiteExperienceId|null>(null);
  const selectedIds=draft.experienceIds??[];
  const customNames=draft.customExperiences??[];
  const count=selectedIds.length+customNames.length;
  const selectedTopics=selectedIds.flatMap(id=>{
    const topic=siteExperienceById.get(id);return topic?[topic]:[];
  });
  const suggested=new Set(suggestedSiteExperiences(draft).map(topic=>topic.id));
  const topics=siteExperienceCatalog.filter(topic=>
    (topic.groupIds.includes(group)||!!query.trim()) &&
    (!query.trim()||[topic.title,...topic.groupIds].join(" ").toLowerCase()
      .includes(query.trim().toLowerCase())));
  const selectedDetail=activeId===null?null:
    draft.experienceDetails?.find(detail=>detail.id===activeId)??null;
  const activeTopic=activeId?siteExperienceById.get(activeId):null;

  function newDetail(id:SiteExperienceId,current:SiteProgramsAudiencesV61):SiteExperienceDetail{
    const topic=siteExperienceById.get(id)!;
    return {
      id,activityIds:[],outcomeIds:[],
      audienceIds:topic.audiences.filter(a=>current.audienceIds.includes(a)),
      programIds:topic.programs.filter(p=>current.interestIds.includes(p)),
      priority:"planned",
    };
  }
  function toggleTopic(id:SiteExperienceId){
    setDraft(current=>{
      const old=current.experienceIds??[];
      if(old.includes(id))return {...current,
        experienceIds:old.filter(item=>item!==id),
        experienceDetails:(current.experienceDetails??[]).filter(item=>item.id!==id)};
      if(old.length+(current.customExperiences?.length??0)>=siteExperienceLimit)return current;
      return {...current,experienceIds:[...old,id],
        experienceDetails:[...(current.experienceDetails??[]),newDetail(id,current)]};
    });
    if(selectedIds.includes(id)&&activeId===id)setActiveId(null);
  }
  function patchDetail(id:SiteExperienceId,change:Partial<SiteExperienceDetail>){
    setDraft(current=>{
      if(!(current.experienceIds??[]).includes(id))return current;
      const list=current.experienceDetails??[];
      const original=list.find(detail=>detail.id===id)??newDetail(id,current);
      return {...current,experienceDetails:[
        ...list.filter(detail=>detail.id!==id),{...original,...change,id}]};
    });
  }
  function selectStage(next:Stage){
    if(disabled)return;
    if(next==="personalize"&&!selectedTopics.length)return;
    setStage(next);
    if(next==="personalize"&&(!activeId||!selectedIds.includes(activeId)))
      setActiveId(selectedIds[0]??null);
  }
  function toggleChip<T extends string>(values:readonly T[],id:T,max:number):T[]{
    return values.includes(id)?values.filter(value=>value!==id):
      values.length<max?[...values,id]:[...values];
  }
  function editTopic(id:SiteExperienceId){
    setActiveId(id);setStage("personalize");
  }
  const previewDetail=(id:SiteExperienceId):SiteExperienceDetail=>
    draft.experienceDetails?.find(detail=>detail.id===id)??newDetail(id,draft);
  const selectedLabel=(value:string)=>value==="featured"?"Featured":
    value==="exploring"?"Exploring":"Planned";

  return <section aria-label="Choose Experiences" className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
      <div className="space-y-1">
        <h3 className="font-serif text-xl">Shape your community experiences</h3>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Select up to five Experience topics. Then choose what people could do
          and what you hope they'll gain. No writing or operational details required.
        </p>
      </div>
      <div className="min-w-24 border border-border bg-card px-4 py-3 text-center"
        role="status" aria-live="polite" aria-label={count+" of five Experiences selected"}>
        <span className="block text-xl font-semibold tabular-nums">{count}/{siteExperienceLimit}</span>
        <span className="block text-xs text-muted-foreground">selected</span>
      </div>
    </div>

    <div className="grid grid-cols-3 gap-2" aria-label="Experience setup screens">
      {([
        ["choose","1. Explore topics"],
        ["personalize","2. Make them yours"],
        ["review","3. Review vision"],
      ] as const).map(([key,label])=>
        <Button key={key} type="button" size="sm" className="min-w-0 whitespace-normal"
          variant={stage===key?"default":"outline"}
          disabled={disabled||(key==="personalize"&&!selectedTopics.length)}
          aria-current={stage===key?"step":undefined}
          onClick={()=>selectStage(key)}>{label}</Button>)}
    </div>

    {stage==="choose"&&<div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Experience groups</h4>
          <p className="text-xs text-muted-foreground">Browse all 12 groups. Your five choices can come from any combination.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {siteExperienceGroups.map(item=><button key={item.id}
              type="button" disabled={disabled} aria-pressed={group===item.id}
              onClick={()=>{setGroup(item.id);setQuery("");}}
              className={"min-h-12 border px-3 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary "+
                (group===item.id?"border-primary bg-primary/10 text-foreground":"border-border bg-card hover:bg-muted")}>
              {item.title}
            </button>)}
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h4 className="font-serif text-lg">{siteExperienceGroups.find(item=>item.id===group)?.title}</h4>
              <p className="text-xs text-muted-foreground">
                {siteExperienceGroups.find(item=>item.id===group)?.description}
              </p>
            </div>
            <label className="flex min-h-10 items-center gap-2 border border-input bg-background px-3 text-sm">
              <Search size={16} aria-hidden="true"/>
              <span className="sr-only">Search Experience topics</span>
              <input type="search" value={query} disabled={disabled} placeholder="Find a topic"
                onChange={event=>setQuery(event.target.value)} className="w-40 min-w-0 bg-transparent outline-none"/>
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {topics.map(topic=>{
              const checked=selectedIds.includes(topic.id);
              const blocked=!checked&&count>=siteExperienceLimit;
              return <button key={topic.id} type="button" aria-pressed={checked}
                disabled={disabled||blocked} onClick={()=>toggleTopic(topic.id)}
                className={"flex min-h-24 min-w-0 flex-col gap-2 border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 "+
                  (checked?"border-primary bg-primary/10":"border-border bg-card hover:bg-muted")}>
                <span className="flex w-full items-start justify-between gap-2">
                  <span className="text-sm font-semibold">{topic.title}</span>
                  <span className="flex size-5 shrink-0 items-center justify-center border border-current"
                    aria-hidden="true">{checked&&<Check className="size-4"/>}</span>
                </span>
                <span className="text-xs leading-5 text-muted-foreground">{topic.description}</span>
                {suggested.has(topic.id)&&<span className="text-xs font-semibold text-primary">Suggested for your audiences and Programs</span>}
              </button>;
            })}
          </div>
          {!topics.length&&<WorkspaceNotice tone="attention">
            No matching topics. Search another term or choose another Experience group.
          </WorkspaceNotice>}
        </div>
      </div>
      {!!customNames.length&&<div className="space-y-2 border-t pt-4">
        <h4 className="text-sm font-semibold">Previously saved local Experiences</h4>
        <p className="text-xs text-muted-foreground">These count toward your five. Existing custom names remain until you remove them.</p>
        {customNames.map(name=><div key={name} className="flex items-center justify-between gap-3 border p-3">
          <span className="text-sm">{name}</span>
          <Button size="sm" variant="outline" disabled={disabled}
            onClick={()=>setDraft(current=>({...current,
              customExperiences:(current.customExperiences??[]).filter(item=>item!==name)}))}>
            Remove
          </Button>
        </div>)}
      </div>}
      {count>siteExperienceLimit&&<WorkspaceNotice tone="attention">
        This older Site plan contains more than five Experiences. Remove extras before saving.
        No existing selection is removed automatically.
      </WorkspaceNotice>}
      {count>=siteExperienceLimit&&<p role="status" className="text-sm text-muted-foreground">
        All five slots are filled. Deselect an Experience before choosing another.
      </p>}
      <div className="flex justify-end">
        <Button disabled={disabled||selectedTopics.length===0||count>siteExperienceLimit}
          onClick={()=>selectStage("personalize")}>
          Make these Experiences yours <ArrowRight aria-hidden="true"/>
        </Button>
      </div>
    </div>}

    {stage==="personalize"&&<div className="space-y-5">
      {!selectedTopics.length?<WorkspaceNotice tone="attention">
        Choose an Experience topic first.
      </WorkspaceNotice>:<div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Your selected Experiences</h4>
          {selectedTopics.map(topic=><button key={topic.id} type="button" disabled={disabled}
            aria-pressed={activeId===topic.id}
            onClick={()=>setActiveId(topic.id)}
            className={"flex w-full items-center justify-between gap-2 border px-3 py-3 text-left text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary "+
              (activeId===topic.id?"border-primary bg-primary/10":"border-border bg-card hover:bg-muted")}>
            {topic.title}{activeId===topic.id&&<Check size={16} aria-hidden="true"/>}
          </button>)}
          <Button variant="outline" className="w-full" onClick={()=>selectStage("choose")}
            disabled={disabled}><ArrowLeft aria-hidden="true"/> Change topics</Button>
        </div>
        {activeTopic&&<div className="min-w-0 space-y-5 border border-border p-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personalize an Experience</p>
            <h4 className="font-serif text-xl">{activeTopic.title}</h4>
            <p className="text-sm text-muted-foreground">{activeTopic.description}</p>
          </div>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">What might people do?
              <span className="ml-2 font-normal text-muted-foreground">
                {(selectedDetail?.activityIds.length??0)}/{siteExperienceActivityLimit}
              </span>
            </legend>
            <p className="text-xs text-muted-foreground">Choose up to four activities.</p>
            <div className="flex flex-wrap gap-2">
              {activeTopic.activities.map(chip=>{
                const active=selectedDetail?.activityIds.includes(chip.id)??false;
                return <Button key={chip.id} size="sm" variant={active?"default":"outline"}
                  aria-pressed={active} disabled={disabled||(!active&&(selectedDetail?.activityIds.length??0)>=siteExperienceActivityLimit)}
                  onClick={()=>patchDetail(activeTopic.id,{
                    activityIds:toggleChip(selectedDetail?.activityIds??[],chip.id,siteExperienceActivityLimit)})}>
                  {active&&<Check aria-hidden="true"/>}{chip.label}</Button>;
              })}
            </div>
          </fieldset>
          <fieldset className="space-y-3 border-t pt-4">
            <legend className="text-sm font-semibold">What do you hope they gain?
              <span className="ml-2 font-normal text-muted-foreground">
                {(selectedDetail?.outcomeIds.length??0)}/{siteExperienceOutcomeLimit}
              </span>
            </legend>
            <p className="text-xs text-muted-foreground">Choose up to three outcomes.</p>
            <div className="flex flex-wrap gap-2">
              {[...siteExperienceOutcomes].sort((a,b)=>
                Number(activeTopic.recommendedOutcomeIds.includes(b.id))-
                Number(activeTopic.recommendedOutcomeIds.includes(a.id))).map(chip=>{
                const active=selectedDetail?.outcomeIds.includes(chip.id)??false;
                return <Button key={chip.id} size="sm" variant={active?"default":"outline"}
                  aria-pressed={active} disabled={disabled||(!active&&(selectedDetail?.outcomeIds.length??0)>=siteExperienceOutcomeLimit)}
                  onClick={()=>patchDetail(activeTopic.id,{
                    outcomeIds:toggleChip<SiteExperienceOutcomeId>(
                      selectedDetail?.outcomeIds??[],chip.id,siteExperienceOutcomeLimit)})}>
                  {active&&<Check aria-hidden="true"/>}{chip.label}</Button>;
              })}
            </div>
          </fieldset>
          <fieldset className="space-y-3 border-t pt-4">
            <legend className="text-sm font-semibold">Who is this for?</legend>
            <p className="text-xs text-muted-foreground">Choose from the audiences you selected in Establish. You can update them later.</p>
            <div className="flex flex-wrap gap-2">
              {draft.audienceIds.map(id=>{
                const active=selectedDetail?.audienceIds.includes(id)??false;
                return <Button key={id} size="sm" variant={active?"default":"outline"}
                  aria-pressed={active} disabled={disabled}
                  onClick={()=>patchDetail(activeTopic.id,{
                    audienceIds:toggleChip<SiteExperienceAudienceId>(
                      selectedDetail?.audienceIds??[],id,4)})}>
                  {active&&<Check aria-hidden="true"/>}{siteExperienceAudienceNames[id]}</Button>;
              })}
            </div>
            {!draft.audienceIds.length&&<p className="text-xs text-muted-foreground">
              No audiences selected. Return to the Audiences step to add some.
            </p>}
          </fieldset>
          <fieldset className="space-y-3 border-t pt-4">
            <legend className="text-sm font-semibold">Which Program interests might include this Experience?</legend>
            <div className="flex flex-wrap gap-2">
              {draft.interestIds.map(id=>{
                const active=selectedDetail?.programIds.includes(id)??false;
                return <Button key={id} size="sm" variant={active?"default":"outline"}
                  aria-pressed={active} disabled={disabled}
                  onClick={()=>patchDetail(activeTopic.id,{
                    programIds:toggleChip<SiteExperienceProgramId>(
                      selectedDetail?.programIds??[],id,6)})}>
                  {active&&<Check aria-hidden="true"/>}{siteExperienceProgramNames[id]}</Button>;
              })}
            </div>
            {!draft.interestIds.length&&<p className="text-xs text-muted-foreground">
              Program associations are optional; you can select Program interests on the first step.
            </p>}
          </fieldset>
          <fieldset className="space-y-3 border-t pt-4">
            <legend className="text-sm font-semibold">How important is this to your plans?</legend>
            <div className="flex flex-wrap gap-2">
              {(["featured","planned","exploring"] as const).map(priority=>
                <Button key={priority} size="sm" variant={(selectedDetail?.priority??"planned")===priority?"default":"outline"}
                  aria-pressed={(selectedDetail?.priority??"planned")===priority} disabled={disabled}
                  onClick={()=>patchDetail(activeTopic.id,{priority})}>
                  {selectedLabel(priority)}</Button>)}
            </div>
          </fieldset>
          <div className="space-y-2 border-t pt-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles aria-hidden="true" size={16}/>
              Preview generated website copy</p>
            <p className="bg-muted p-3 text-sm leading-6">
              {describeSiteExperience(activeTopic,selectedDetail??newDetail(activeTopic.id,draft))}
            </p>
            <p className="text-xs text-muted-foreground">
              This describes an idea only. Website & Brand controls public wording and publication.
            </p>
          </div>
        </div>}
      </div>}
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" disabled={disabled} onClick={()=>selectStage("choose")}>
          <ArrowLeft aria-hidden="true"/> Back to topics
        </Button>
        <Button disabled={disabled||!selectedTopics.length} onClick={()=>selectStage("review")}>
          Review your vision <ArrowRight aria-hidden="true"/>
        </Button>
      </div>
    </div>}

    {stage==="review"&&<div className="space-y-4">
      <div className="space-y-1">
        <h4 className="font-serif text-xl">Your community's Experience vision</h4>
        <p className="text-sm leading-6 text-muted-foreground">
          These are up to five priorities you hope to explore, not approved programs
          or confirmed activities. Website & Brand can use the selected ideas to
          suggest content for your public-facing Site.
        </p>
      </div>
      {!selectedTopics.length&&!customNames.length&&<WorkspaceNotice tone="attention">
        No Experiences selected yet. You may continue without any, or return to explore topics.
      </WorkspaceNotice>}
      <div className="grid gap-3 sm:grid-cols-2">
        {selectedTopics.map(topic=>{
          const detail=previewDetail(topic.id);
          const scope=[...detail.programIds.map(id=>siteExperienceProgramNames[id]),
            ...detail.audienceIds.map(id=>siteExperienceAudienceNames[id])];
          return <article key={topic.id} className="min-w-0 space-y-3 border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h5 className="font-serif text-lg">{topic.title}</h5>
              <span className="border px-2 py-1 text-xs font-semibold">{selectedLabel(detail.priority)}</span>
            </div>
            <p className="text-sm leading-6">{describeSiteExperience(topic,detail)}</p>
            {!!scope.length&&<p className="text-xs text-muted-foreground">{scope.join(" · ")}</p>}
            <Button size="sm" variant="outline" disabled={disabled}
              onClick={()=>editTopic(topic.id)}><Pencil aria-hidden="true"/> Edit choices</Button>
          </article>;
        })}
        {customNames.map(name=><article key={name} className="space-y-2 border border-border p-4">
          <h5 className="font-serif text-lg">{name}</h5>
          <p className="text-sm text-muted-foreground">Previously saved local Experience. Further details can be defined in Prepare.</p>
        </article>)}
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" disabled={disabled} onClick={()=>selectStage("personalize")}>
          <ArrowLeft aria-hidden="true"/> Personalize
        </Button>
        <Button variant="outline" disabled={disabled} onClick={()=>selectStage("choose")}>
          Explore more topics
        </Button>
      </div>
      <WorkspaceNotice tone="neutral">
        Save & Continue below to carry this vision into Website & Brand.
        Choosing an Experience does not approve a Solution, publish a program
        or open enrollment.
      </WorkspaceNotice>
    </div>}
  </section>;
}
