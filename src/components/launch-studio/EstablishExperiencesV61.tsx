import { useState, type Dispatch, type SetStateAction } from "react";
import {
  BookOpen, BriefcaseBusiness, Check, ChevronDown, ChevronUp,
  Compass, FlaskConical, HandHeart, HeartPulse, House, Landmark, Monitor, Palette,
  Search, Sparkles, Users, Wallet, X, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WorkspaceNotice } from "@/components/workspace";
import type { SiteExperienceDetail, SiteProgramsAudiencesV61 } from "@/domain/site-launch-preferences";
import {
  siteExperienceGroups, siteExperienceCatalog, siteExperienceById,
  siteExperienceOutcomes, siteExperienceLimit, siteExperienceActivityLimit,
  siteExperienceOutcomeLimit, siteExperienceAudienceNames, siteExperienceProgramNames,
  recommendedSiteExperiences, discoverSiteExperienceTopics,
  describeSiteExperience, validCustomExperienceName,
  type SiteExperienceGroupId, type SiteExperienceId, type SiteExperienceOutcomeId,
  type SiteExperienceAudienceId, type SiteExperienceProgramId,
} from "@/domain/site-experience-interests";

export type ExperiencesStageV61 = "choose" | "personalize";
type Props = {
  draft: SiteProgramsAudiencesV61;
  setDraft: Dispatch<SetStateAction<SiteProgramsAudiencesV61>>;
  disabled: boolean;
  programCatalog: readonly {code:string;title:string}[];
  stage: ExperiencesStageV61;
  onStageChange: (stage:ExperiencesStageV61) => void;
};

/** Visual wayfinding only. All 12 groups appear at once; icons do not navigate. */
const groupIcons: Record<SiteExperienceGroupId, LucideIcon> = {
  academic: BookOpen,
  stem: FlaskConical,
  digital: Monitor,
  money: Wallet,
  civic: Landmark,
  careers: BriefcaseBusiness,
  health: HeartPulse,
  arts: Palette,
  recreation: Compass,
  family: Users,
  life: House,
  service: HandHeart,
};
const priorities = ["featured","planned","exploring"] as const;
const priorityLabel = (value:SiteExperienceDetail["priority"]) =>
  value==="featured"?"Featured":value==="exploring"?"Exploring":"Planned";

/** Approved V6.1 image: 12 icon-led open categories; only the five selected
 * topics have detail cards. The Featured/Planned/Exploring status chip remains
 * on the left side of each card header, never buried at the bottom.
 * Browse all 78 topics with recommendations identified, then personalize only
 * the chosen five. The parent owns Save & Continue and this stage transition.
 * Data stays in the canonical Programs & Audiences draft, not in local shadow state. */
export function EstablishExperiencesV61({
  draft,setDraft,disabled,programCatalog,stage,onStageChange,
}:Props){
  const [query,setQuery]=useState("");
  const [customName,setCustomName]=useState("");
  const [customError,setCustomError]=useState("");
  const [activeId,setActiveId]=useState<SiteExperienceId|"none"|null>(null);
  const selectedIds=draft.experienceIds??[];
  const customNames=draft.customExperiences??[];
  const count=selectedIds.length+customNames.length;
  const selectedTopics=selectedIds.flatMap(id=>{
    const topic=siteExperienceById.get(id);
    return topic?[topic]:[];
  });
  const recommendedIds=new Set(recommendedSiteExperiences(draft).map(topic=>topic.id));
  const {groups}=discoverSiteExperienceTopics(draft,query);
  const currentId=activeId==="none"?null:
    activeId&&selectedIds.includes(activeId)?activeId:selectedIds[0]??null;

  function newDetail(id:SiteExperienceId,current:SiteProgramsAudiencesV61):SiteExperienceDetail{
    const topic=siteExperienceById.get(id)!;
    return {
      id,activityIds:[],outcomeIds:[],
      audienceIds:topic.audiences.filter(value=>current.audienceIds.includes(value)),
      programIds:topic.programs.filter(value=>current.interestIds.includes(value)),
      programCodes:[...(current.programCodes??[])],
      priority:"planned",
    };
  }
  function toggleTopic(id:SiteExperienceId){
    setDraft(current=>{
      const selected=current.experienceIds??[];
      if(selected.includes(id))return {
        ...current,experienceIds:selected.filter(value=>value!==id),
        experienceDetails:(current.experienceDetails??[]).filter(detail=>detail.id!==id),
      };
      if(selected.length+(current.customExperiences?.length??0)>=siteExperienceLimit)return current;
      return {
        ...current,experienceIds:[...selected,id],
        experienceDetails:[...(current.experienceDetails??[]),newDetail(id,current)],
      };
    });
    if(activeId===id&&selectedIds.includes(id))setActiveId(null);
  }
  function removeCustom(name:string){
    setDraft(current=>({...current,
      customExperiences:(current.customExperiences??[]).filter(value=>value!==name)}));
  }
  function addCustomExperience(){
    const name=customName.trim();
    if(!validCustomExperienceName(name)){
      setCustomError("Enter a plain-text local topic name between 2 and 100 characters.");
      return;
    }
    if(count>=siteExperienceLimit){
      setCustomError("Remove an Experience before adding another.");
      return;
    }
    if(customNames.some(value=>value.toLocaleLowerCase()===name.toLocaleLowerCase())||
      siteExperienceCatalog.some(topic=>topic.title.toLocaleLowerCase()===name.toLocaleLowerCase())){
      setCustomError("This topic is already selected or available above.");
      return;
    }
    setDraft(current=>({...current,customExperiences:[...(current.customExperiences??[]),name]}));
    setCustomName("");setCustomError("");
  }
  function patchDetail(id:SiteExperienceId,changes:Partial<SiteExperienceDetail>){
    setDraft(current=>{
      if(!(current.experienceIds??[]).includes(id))return current;
      const list=current.experienceDetails??[];
      const detail=list.find(value=>value.id===id)??newDetail(id,current);
      return {...current,experienceDetails:[
        ...list.filter(value=>value.id!==id),{...detail,...changes,id},
      ]};
    });
  }
  function toggleChip<T extends string>(selected:readonly T[],id:T,max:number):T[]{
    if(selected.includes(id))return selected.filter(value=>value!==id);
    return selected.length>=max?[...selected]:[...selected,id];
  }
  const previewDetail=(id:SiteExperienceId):SiteExperienceDetail=>
    draft.experienceDetails?.find(detail=>detail.id===id)??newDetail(id,draft);

  return <section aria-label="Experiences" className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
      <div className="space-y-1">
        <h3 className="font-serif text-2xl">
          {stage==="choose"?"Explore experience topics":"Make these Experiences yours"}
        </h3>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {stage==="choose"
            ?"Every topic is visible. Choose up to five priorities, then personalize only those choices."
            :"Focus on your selected priorities. Choose activities, desired outcomes and intended audiences."}
        </p>
      </div>
      <div className="min-w-20 border border-primary/20 bg-accent px-4 py-2 text-center"
        role="status" aria-live="polite" aria-label={count+" of five Experiences selected"}>
        <span className="block text-xl font-semibold tabular-nums">{count}/{siteExperienceLimit}</span>
        <span className="block text-xs text-muted-foreground">selected</span>
      </div>
    </div>

    {stage==="choose"&&<div className="space-y-5">
      <section aria-label="Your selected Experiences" className="space-y-3 border border-primary/20 bg-accent/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Your selected Experiences</h4>
          <span className="text-xs text-muted-foreground">Remove one to make room for another.</span>
        </div>
        {count===0
          ? <p className="text-sm text-muted-foreground">Choose up to five topics below. Nothing is selected automatically.</p>
          : <div className="flex flex-wrap gap-2">
            {selectedTopics.map(topic=><Button key={topic.id} type="button"
              size="sm" variant="default" aria-label={"Remove "+topic.title}
              disabled={disabled} onClick={()=>toggleTopic(topic.id)} className="min-h-10 whitespace-normal">
              <Check aria-hidden="true"/>{topic.title}<X aria-hidden="true"/>
            </Button>)}
            {customNames.map(name=><Button key={name} type="button"
              size="sm" variant="default" aria-label={"Remove "+name}
              disabled={disabled} onClick={()=>removeCustom(name)} className="min-h-10 whitespace-normal">
              <Check aria-hidden="true"/>{name}<X aria-hidden="true"/>
            </Button>)}
          </div>}
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h4 className="font-serif text-lg">Explore all {siteExperienceCatalog.length} topics</h4>
          <p className="text-xs leading-5 text-muted-foreground">
            Twelve groups, all expanded. Suggested topics are outlined and marked with a star, not preselected.
          </p>
        </div>
        <label className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" aria-hidden="true"/>
          <span className="sr-only">Search topics and activities</span>
          <Input type="search" value={query} disabled={disabled}
            placeholder="Search topics or activities" aria-label="Search topics and activities"
            onChange={event=>setQuery(event.target.value)} className="w-56"/>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground" aria-label="Selection legend">
        <span className="flex items-center gap-2">
          <span className="size-3 bg-primary" aria-hidden="true"/>Selected
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 border border-primary bg-accent/50" aria-hidden="true"/>
          <Sparkles className="size-3 text-primary" aria-hidden="true"/>Recommended
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 border border-border bg-card" aria-hidden="true"/>Available
        </span>
      </div>
      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        {groups.map(group=>{
          const Icon=groupIcons[group.id];
          return <section key={group.id} aria-labelledby={"experience-group-"+group.id}
            className="min-w-0 border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 size-6 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true"/>
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <h5 id={"experience-group-"+group.id} className="text-sm font-semibold">{group.title}</h5>
                  <p className="text-xs leading-5 text-muted-foreground">{group.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.topics.map(topic=>{
                    const selected=selectedIds.includes(topic.id);
                    const recommended=recommendedIds.has(topic.id);
                    const blocked=disabled||(!selected&&count>=siteExperienceLimit);
                    return <Button key={topic.id} type="button" size="sm"
                      variant={selected?"default":"outline"} aria-pressed={selected}
                      aria-label={topic.title+(recommended?". Recommended.":"")+
                        (selected?" Selected.":" Not selected.")}
                      disabled={blocked} onClick={()=>toggleTopic(topic.id)}
                      className={"min-h-9 whitespace-normal text-left "+
                        (!selected&&recommended?"border-primary/60 bg-accent/50 text-primary":"")}>
                      {selected?<Check aria-hidden="true"/>:
                        recommended?<Sparkles aria-hidden="true"/>:null}
                      {topic.title}
                    </Button>;
                  })}
                </div>
              </div>
            </div>
          </section>;
        })}
      </div>
      {!groups.length&&<WorkspaceNotice tone="info">
        No topics match that search. Try another phrase or clear the search.
      </WorkspaceNotice>}
      <details className="border-t border-border pt-4" aria-label="Optional local Experience topic">
        <summary className="cursor-pointer text-sm font-semibold">Can't find your idea? Add a local topic</summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Optional. A local idea counts toward your five, and needs no narrative description.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-48 flex-1 space-y-1 text-sm font-medium">
            Local topic name
            <Input maxLength={100} value={customName} type="text"
              disabled={disabled||count>=siteExperienceLimit}
              placeholder="e.g. Neighborhood history"
              onChange={event=>{setCustomName(event.target.value);setCustomError("");}}/>
          </label>
          <Button variant="outline" disabled={disabled||count>=siteExperienceLimit||!customName.trim()}
            onClick={addCustomExperience}>Add local topic</Button>
        </div>
        {customError&&<p role="alert" className="mt-2 text-xs text-destructive">{customError}</p>}
      </details>
      {count>siteExperienceLimit&&<WorkspaceNotice tone="attention">
        This older Site plan contains more than five Experiences.
        Remove extras before saving. Nothing has been removed automatically.
      </WorkspaceNotice>}
      {count>=siteExperienceLimit&&<p className="text-xs text-muted-foreground">
        Your five slots are filled. Remove a selection above to choose another topic.
      </p>}
      <p className="text-xs text-muted-foreground">
        {siteExperienceCatalog.length} topics · {siteExperienceGroups.length} groups · {count} of five selected
      </p>
    </div>}

    {stage==="personalize"&&<div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Only your {count} selected {count===1?"Experience appears":"Experiences appear"} here.
        Open a card to select activities and outcomes. No catalog browsing or additional review step.
      </p>
      {count===0&&<WorkspaceNotice tone="info">
        No Experiences selected. Return to Explore Topics or continue to Website & Brand without selecting any.
      </WorkspaceNotice>}
      {count>siteExperienceLimit&&<WorkspaceNotice tone="attention">
        This older Site plan has more than five Experiences.
        Return to Explore Topics and remove extras before saving.
      </WorkspaceNotice>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Your five selected Experiences">
        {selectedTopics.map((topic,index)=>{
          const detail=previewDetail(topic.id);
          return <Button key={topic.id} type="button" size="sm"
            variant={currentId===topic.id?"default":"outline"}
            aria-pressed={currentId===topic.id} disabled={disabled}
            className="h-auto min-h-16 min-w-0 flex-col items-start justify-center gap-1 whitespace-normal px-3 py-2 text-left"
            onClick={()=>setActiveId(topic.id)}>
            <span className="text-3xs font-semibold uppercase tracking-eyebrow">
              {index+1} OF {count} · {priorityLabel(detail.priority)}
            </span>
            <span className="text-xs font-semibold">{topic.title}</span>
          </Button>;
        })}
        {customNames.map((name,index)=><div key={name}
          className="flex min-h-16 min-w-0 flex-col justify-center gap-1 border border-border bg-card px-3 py-2">
          <span className="text-3xs font-semibold uppercase text-muted-foreground">
            {selectedTopics.length+index+1} OF {count} · LOCAL
          </span>
          <span className="text-xs font-semibold">{name}</span>
        </div>)}
      </div>
      <div className="space-y-2">
        {selectedTopics.map((topic,index)=>{
          const detail=previewDetail(topic.id);
          const expanded=currentId===topic.id;
          return <article key={topic.id} className={"border bg-card "+
            (expanded?"border-primary":"border-border")}>
            <header className={"flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 "+
              (expanded?"border-primary/20 bg-accent/40":"border-transparent")}>
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center border border-border bg-card text-xs font-semibold" aria-hidden="true">
                  {index+1}
                </span>
                <span className="font-serif text-lg">{topic.title}</span>
                <label className="flex items-center gap-1">
                  <span className="sr-only">Priority for {topic.title}</span>
                  <Select value={detail.priority} disabled={disabled}
                    aria-label={"Priority for "+topic.title}
                    onChange={event=>patchDetail(topic.id,{
                      priority:event.currentTarget.value as SiteExperienceDetail["priority"]})}
                    className={"min-h-8 w-auto px-2 text-xs font-semibold "+
                      (detail.priority==="featured"
                        ?"border-primary/40 bg-accent text-primary"
                        :"border-border bg-card text-muted-foreground")}>
                    {priorities.map(priority=><option key={priority} value={priority}>
                      {priorityLabel(priority)}
                    </option>)}
                  </Select>
                </label>
              </div>
              <Button type="button" variant="ghost" size="sm"
                disabled={disabled} aria-expanded={expanded}
                aria-controls={"experience-choices-"+topic.id}
                onClick={()=>setActiveId(expanded?"none":topic.id)}
                className="min-w-0 shrink-0 whitespace-normal text-left">
                <span className="hidden text-xs text-muted-foreground md:inline">
                  {detail.activityIds.length} activities · {detail.outcomeIds.length} outcomes
                </span>
                {expanded?<ChevronUp aria-hidden="true"/>:<ChevronDown aria-hidden="true"/>}
                <span className="sr-only">{expanded?"Collapse":"Expand"} {topic.title}</span>
              </Button>
            </header>
            <div id={"experience-choices-"+topic.id} hidden={!expanded}
              className="space-y-5 p-4 sm:p-5">
              <p className="text-xs text-muted-foreground">
                Choose activities and desired outcomes for this planned Experience.
                None of these selections authorizes an offering or opens enrollment.
              </p>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">What might people do?
              <span className="ml-2 font-normal text-muted-foreground">
                {(detail?.activityIds.length??0)}/{siteExperienceActivityLimit}
              </span>
            </legend>
            <p className="text-xs text-muted-foreground">Choose up to four activities.</p>
            <div className="flex flex-wrap gap-2">
              {topic.activities.map(chip=>{
                const active=detail?.activityIds.includes(chip.id)??false;
                return <Button key={chip.id} size="sm" variant={active?"default":"outline"}
                  aria-pressed={active} disabled={disabled||(!active&&(detail?.activityIds.length??0)>=siteExperienceActivityLimit)}
                  onClick={()=>patchDetail(topic.id,{
                    activityIds:toggleChip(detail?.activityIds??[],chip.id,siteExperienceActivityLimit)})}>
                  {active&&<Check aria-hidden="true"/>}{chip.label}</Button>;
              })}
            </div>
          </fieldset>
          <fieldset className="space-y-3 border-t pt-4">
            <legend className="text-sm font-semibold">What do you hope they gain?
              <span className="ml-2 font-normal text-muted-foreground">
                {(detail?.outcomeIds.length??0)}/{siteExperienceOutcomeLimit}
              </span>
            </legend>
            <p className="text-xs text-muted-foreground">Choose up to three outcomes.</p>
            <div className="flex flex-wrap gap-2">
              {[...siteExperienceOutcomes].sort((a,b)=>
                Number(topic.recommendedOutcomeIds.includes(b.id))-
                Number(topic.recommendedOutcomeIds.includes(a.id))).map(chip=>{
                const active=detail?.outcomeIds.includes(chip.id)??false;
                return <Button key={chip.id} size="sm" variant={active?"default":"outline"}
                  aria-pressed={active} disabled={disabled||(!active&&(detail?.outcomeIds.length??0)>=siteExperienceOutcomeLimit)}
                  onClick={()=>patchDetail(topic.id,{
                    outcomeIds:toggleChip<SiteExperienceOutcomeId>(
                      detail?.outcomeIds??[],chip.id,siteExperienceOutcomeLimit)})}>
                  {active&&<Check aria-hidden="true"/>}{chip.label}</Button>;
              })}
            </div>
          </fieldset>
          <fieldset className="space-y-3 border-t pt-4">
            <legend className="text-sm font-semibold">Who is this for?</legend>
            <p className="text-xs text-muted-foreground">Choose from the audiences you selected in Establish. You can update them later.</p>
            <div className="flex flex-wrap gap-2">
              {draft.audienceIds.map(id=>{
                const active=detail?.audienceIds.includes(id)??false;
                return <Button key={id} size="sm" variant={active?"default":"outline"}
                  aria-pressed={active} disabled={disabled}
                  onClick={()=>patchDetail(topic.id,{
                    audienceIds:toggleChip<SiteExperienceAudienceId>(
                      detail?.audienceIds??[],id,4)})}>
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
                const active=detail?.programIds.includes(id)??false;
                return <Button key={id} size="sm" variant={active?"default":"outline"}
                  aria-pressed={active} disabled={disabled}
                  onClick={()=>patchDetail(topic.id,{
                    programIds:toggleChip<SiteExperienceProgramId>(
                      detail?.programIds??[],id,6)})}>
                  {active&&<Check aria-hidden="true"/>}{siteExperienceProgramNames[id]}</Button>;
              })}
            </div>
            {!draft.interestIds.length&&<p className="text-xs text-muted-foreground">
              Program associations are optional; you can select Program interests on the first step.
            </p>}
            {!!draft.programCodes?.length&&<div className="space-y-2 pt-2">
              <p className="text-xs font-semibold">Published Program ideas</p>
              <div className="flex flex-wrap gap-2">
                {draft.programCodes.map(code=>{
                  const active=detail?.programCodes?.includes(code)??false;
                  const title=programCatalog.find(item=>item.code===code)?.title??code;
                  return <Button key={code} size="sm" variant={active?"default":"outline"}
                    aria-pressed={active} disabled={disabled}
                    onClick={()=>patchDetail(topic.id,{
                      programCodes:toggleChip(detail?.programCodes??[],code,30)})}>
                    {active&&<Check aria-hidden="true"/>}{title}</Button>;
                })}
              </div>
            </div>}
          </fieldset>

          <div className="space-y-2 border-t pt-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles aria-hidden="true" size={16}/>
              Preview generated website copy</p>
            <p className="bg-muted p-3 text-sm leading-6">
              {describeSiteExperience(topic,detail)}
            </p>
            <p className="text-xs text-muted-foreground">
              This describes an idea only. Website & Brand controls public wording and publication.
            </p>
          </div>

            </div>
          </article>;
        })}
        {customNames.map((name,index)=><article key={name}
          className="flex flex-wrap items-center gap-3 border border-border bg-card p-3">
          <span className="flex size-6 items-center justify-center border border-border text-xs font-semibold">
            {selectedTopics.length+index+1}
          </span>
          <div className="min-w-0 flex-1">
            <h5 className="font-serif text-lg">{name}</h5>
            <p className="text-xs text-muted-foreground">
              Local planning topic. Curated activity and outcome chips are not available for custom names.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={disabled}
            onClick={()=>onStageChange("choose")}>
            Edit selection
          </Button>
        </article>)}
      </div>
      <p className="text-xs text-muted-foreground">
        Finish selecting the details you want, then use Save & Continue to Website & Brand below.
        There is no separate Review page.
      </p>
    </div>}
  </section>;
}
