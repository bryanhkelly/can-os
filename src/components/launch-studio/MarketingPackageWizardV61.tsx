import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GuidedSetupProgress } from "@/components/workflow/guided-setup-shell";
import { ActionFooter, SelectionCard, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import {
  composeOutreachDraftV61, initialOutreachPlanV61, marketingAudienceOptions,
  outreachFormatsV61, outreachStepIdsV61,
  type MarketingFormat, type MarketingPackageContent, type OutreachPlanV61,
} from "@/domain/marketing-package-v61";
import type { SiteProgramsAudiencesV61 } from "@/domain/site-launch-preferences";
import { siteExperienceById } from "@/domain/site-experience-interests";
import type { readSiteMarketingSuggestionsV61 } from "@/modules/programs/site-marketing-packages-v61.functions";
import { MarketingMaterialPreviewV61 } from "./MarketingMaterialPreviewV61";

type Suggestions = Awaited<ReturnType<typeof readSiteMarketingSuggestionsV61>>;
type Suggestion = Suggestions[MarketingPackageContent["purpose"]];
const stepTitles=["Who","Message","Highlight","Action","Channels","Review"] as const;
const relationshipOptions=[
  {id:"known",label:"People I know"},{id:"new",label:"People I don't know"},{id:"both",label:"Both"},
] as const;
const beneficiaryOptions=[
  {id:"children",label:"Children"},{id:"teens",label:"Teens"},
  {id:"adults",label:"Adults"},{id:"older_adults",label:"Older adults"},
] as const;
const messageOptions=[
  {id:"coming-soon",label:"Coming soon",description:"Build anticipation for an idea or upcoming launch."},
  {id:"feedback",label:"What do you think?",description:"Invite people to help shape the possibilities."},
  {id:"invitation",label:"You're invited",description:"Invite people into an event or conversation."},
  {id:"recruiting",label:"We're looking for...",description:"Find leaders, staff, volunteers, or partners."},
  {id:"update",label:"Progress update",description:"Share what's changing or a milestone achieved."},
] as const;
const actionOptions=[
  {id:"learn-more",label:"Learn more",detail:"See the vision and proposed opportunities."},
  {id:"express-interest",label:"Express interest",detail:"Tell us you'd like to stay connected."},
  {id:"share-feedback",label:"Share feedback",detail:"Contribute ideas or priorities."},
  {id:"attend-event",label:"Attend an event",detail:"Join an information session or gathering."},
  {id:"schedule-conversation",label:"Schedule a conversation",detail:"Request a discussion with the team."},
] as const;
const channelOptions=[
  {id:"email",label:"Email",detail:"A branded, copy-ready email."},
  {id:"social",label:"Social",detail:"An image and caption to post."},
  {id:"print",label:"Print",detail:"A printable flyer."},
  {id:"text",label:"Text",detail:"Short copy to use in an authorized messaging service."},
  {id:"share-link",label:"Share link",detail:"Use a separately authorized public destination."},
  {id:"conversation-kit",label:"Conversation Kit",detail:"Talking points and a printable overview."},
] as const;
const storyOptions=[
  {id:"impact",label:"Community Impact",description:"Show how this could benefit people and their community."},
  {id:"opportunity",label:"Opportunity",description:"Focus on skills, possibilities, and what people can explore."},
  {id:"partnership",label:"Partnership",description:"Invite organizations and leaders to collaborate."},
] as const;
const programLabels:Record<string,string>={
  "grades-6-8":"Middle School Learning","grades-9-12":"High School Learning",
  afterschool:"After-school",summer:"Summer & Breaks",
  adult:"Adult Learning",senior:"Older Adult Learning",
};
const beneficiaryLabels:Record<string,string>={
  children:"Children",teens:"Teens",adults:"Adults",older_adults:"Older adults",
};
const formatNames:Record<MarketingFormat,string>={
  email:"Email",social:"Social",flyer:"Flyer",handout:"Printable Handout","qr-card":"QR Card",
};
type Highlight=OutreachPlanV61["highlights"][number];

/** One canonical V6.1 six-step workspace; Site brand and releases remain owned
 * by the existing Marketing Package service. No separate marketing CMS. */
export function MarketingPackageWizardV61({
  siteId,siteName,siteIntent,step,title,content,busy,brandVersionId,currentSuggestion,
  activePreviewFormat,onTitleChange,onPatch,
  onBack,onSaveExit,onNext,hasSavedPackage,
}:{
  siteId:string;siteName?:string;siteIntent?:SiteProgramsAudiencesV61|null;
  step:number;title:string;content:MarketingPackageContent;busy:boolean;
  brandVersionId:string|null;currentSuggestion:Suggestion|null;
  activePreviewFormat:MarketingFormat|null;
  onTitleChange:(value:string)=>void;onPatch:(value:Partial<MarketingPackageContent>)=>void;
  onBack:()=>void;onSaveExit:()=>void;onNext:()=>void;hasSavedPackage:boolean;
}){
  const plan=content.plan??initialOutreachPlanV61(siteIntent?.audienceIds??[]);
  const updatePlan=(patch:Partial<OutreachPlanV61>)=>onPatch({
    plan:{...plan,...patch},
    audiences:patch.recipients??plan.recipients,
  });
  const toggle=(current:readonly string[],value:string)=>
    current.includes(value)?current.filter(id=>id!==value):[...current,value];
  const highlightOptions:Highlight[]=[
    {source:"vision",id:"site-vision",label:"Our learning community",role:"supporting"},
    ...(siteIntent?.interestIds??[]).map(id=>({
      source:"program" as const,id,label:programLabels[id]??id,role:"supporting" as const,
    })),
    ...(siteIntent?.audienceIds??[]).map(id=>({
      source:"audience" as const,id,label:beneficiaryLabels[id]??id,role:"supporting" as const,
    })),
    ...(siteIntent?.experienceIds??[]).map(id=>({
      source:"experience" as const,id,
      label:siteExperienceById.get(id)?.title??id,role:"supporting" as const,
    })),
    ...(siteIntent?.customExperiences??[]).map(label=>({
      source:"experience" as const,id:"custom:"+label,label,role:"supporting" as const,
    })),
  ];
  const setHighlight=(candidate:Highlight)=>{
    const existing=plan.highlights.find(item=>item.source===candidate.source&&item.id===candidate.id);
    if(existing){
      const remaining=plan.highlights.filter(item=>item!==existing);
      const primaryExists=remaining.some(item=>item.role==="primary");
      updatePlan({highlights:primaryExists?remaining:
        remaining.map((item,index)=>({...item,role:index===0?"primary" as const:"supporting" as const}))});
    }else if(plan.highlights.length<3){
      updatePlan({highlights:[...plan.highlights,{
        ...candidate,role:plan.highlights.length?"supporting" as const:"primary" as const,
      }]});
    }
  };
  const makePrimary=(item:Highlight)=>updatePlan({highlights:plan.highlights.map(value=>({
    ...value,role:value.source===item.source&&value.id===item.id?"primary" as const:"supporting" as const,
  }))});
  const setFocus=(focus:OutreachPlanV61["messageFocus"])=>{
    const purpose:MarketingPackageContent["purpose"]=
      focus==="feedback"?"program-interest":
      focus==="invitation"?"event-invitation":
      focus==="recruiting"?"interest-invitation":"site-announcement";
    // Focus is a planning choice. Existing edited copy must remain intact
    // until the user explicitly chooses "Use suggestion" in Review.
    onPatch({purpose,plan:{...plan,messageFocus:focus}});
  };
  const setChannels=(channel:OutreachPlanV61["channels"][number])=>{
    const channels=toggle(plan.channels,channel) as OutreachPlanV61["channels"];
    onPatch({plan:{...plan,channels},formats:outreachFormatsV61(channels)});
  };
  const suggested=composeOutreachDraftV61(siteName||"our learning community",plan,siteIntent);
  const setStory=(storyAngle:OutreachPlanV61["storyAngle"])=>
    updatePlan({storyAngle});
  const chosenMaterial=activePreviewFormat&&content.formats.includes(activePreviewFormat)
    ?activePreviewFormat:content.formats[0]??null;

  return <>
    <GuidedSetupProgress label="Introduce outreach steps"
      steps={outreachStepIdsV61.map((id,index)=>({
        id,title:stepTitles[index]??id,
        status:index<step?"complete" as const:index===step?"current" as const:"upcoming" as const,
      }))}/>
    {step===0&&<WorkspacePanel title="Who do you want to tell?"
      description="Choose the people receiving your outreach, then the people who will benefit from your work.">
      <div className="mt-5 space-y-5">
        <section className="space-y-3" aria-label="Primary Who">
          <div><h3 className="text-sm font-semibold">Primary Who · Who are you reaching?</h3>
            <p className="text-xs text-muted-foreground">Recipients. This does not add contacts or authorize sending.</p></div>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="text-sm font-medium">Relationship</legend>
            {relationshipOptions.map(item=><SelectionCard key={item.id} kind="radio"
              name="outreach-relationship" value={item.id} title={item.label} compact
              checked={plan.relationship===item.id} disabled={busy}
              onChange={()=>updatePlan({relationship:item.id})}/>)}
          </fieldset>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">Recipients</legend>
            {marketingAudienceOptions.map(item=><SelectionCard key={item.id}
              kind="checkbox" compact title={item.label} value={item.id}
              checked={plan.recipients.includes(item.id)} disabled={busy||(!plan.recipients.includes(item.id)&&plan.recipients.length>=8)}
              onChange={()=>updatePlan({recipients:toggle(plan.recipients,item.id) as OutreachPlanV61["recipients"]})}/>)}
          </fieldset>
        </section>
        <section className="space-y-3 border-t pt-5" aria-label="Secondary Who">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Secondary Who · Who will benefit?</h3>
            <span className="text-xs text-muted-foreground">Suggested from Establish</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Beneficiaries help explain the intended impact, even when they aren't the recipients.
          </p>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Beneficiary audiences</legend>
            {beneficiaryOptions.map(item=><SelectionCard key={item.id}
              kind="checkbox" compact title={item.label} value={item.id}
              checked={plan.beneficiaries.includes(item.id)} disabled={busy}
              onChange={()=>updatePlan({beneficiaries:toggle(plan.beneficiaries,item.id) as OutreachPlanV61["beneficiaries"]})}/>)}
          </fieldset>
        </section>
      </div>
    </WorkspacePanel>}
    {step===1&&<WorkspacePanel title="What do you want to say?"
      description="Choose your message objective. CAN will help draft a starting point using the information you've selected.">
      <fieldset className="mt-4 grid gap-3">
        <legend className="sr-only">Message focus</legend>
        {messageOptions.map(item=><SelectionCard key={item.id} kind="radio"
          value={item.id} name="message-focus" title={item.label} detail={item.description}
          checked={plan.messageFocus===item.id} disabled={busy}
          onChange={()=>setFocus(item.id)}/>)}
      </fieldset>
    </WorkspacePanel>}
    {step===2&&<WorkspacePanel title="What do you want to highlight?"
      description="Choose one primary highlight and up to two supporting highlights from your saved planning information.">
      {highlightOptions.length===0?<WorkspaceNotice tone="attention">
        No saved Programs, audiences, or Experiences are available. Add them under Establish →
        Programs &amp; Audiences before selecting a highlight.
      </WorkspaceNotice>:<div className="mt-5 space-y-5">
        {(["program","audience","experience"] as const).map(kind=>{
          const options=highlightOptions.filter(item=>item.source===kind);
          if(!options.length)return null;
          return <section key={kind} className="space-y-3">
            <h3 className="text-sm font-semibold">{kind==="program"?"Programs":kind==="audience"?"Audiences":"Experiences"}
              <span className="ml-2 text-xs font-normal text-muted-foreground">From Establish</span>
            </h3>
            <div className="flex flex-wrap gap-2">{options.map(item=>{
              const selected=plan.highlights.find(value=>value.source===item.source&&value.id===item.id);
              return <Button key={item.source+":"+item.id} type="button" size="sm"
                variant={selected?"default":"outline"} disabled={busy||(!selected&&plan.highlights.length>=3)}
                aria-pressed={Boolean(selected)} onClick={()=>setHighlight(item)}>
                {selected&&<Check className="mr-1 size-4"/>}{item.label}
                {selected?.role==="primary"?" · Primary":""}
              </Button>;
            })}</div>
          </section>;
        })}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold">Your selected highlights ({plan.highlights.length}/3)</h3>
          <div className="mt-3 space-y-2">{plan.highlights.map(item=>
            <div key={item.source+":"+item.id} className="flex flex-wrap items-center justify-between gap-2 border p-3">
              <span className="text-sm">{item.label} · <strong>{item.role==="primary"?"Primary":"Supporting"}</strong></span>
              {item.role!=="primary"&&<Button type="button" size="sm" variant="outline"
                disabled={busy} onClick={()=>makePrimary(item)}>Make primary</Button>}
            </div>)}</div>
        </div>
      </div>}
    </WorkspacePanel>}
    {step===3&&<WorkspacePanel title="What do you want them to do?"
      description="Choose one primary action. Actual forms, events, and sending remain separately authorized.">
      <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Primary next action</legend>
        {actionOptions.map(item=><SelectionCard key={item.id} kind="radio"
          name="outreach-action" value={item.id} title={item.label} detail={item.detail}
          checked={plan.action===item.id} disabled={busy}
          onChange={()=>updatePlan({action:item.id})}/>)}
      </fieldset>
    </WorkspacePanel>}
    {step===4&&<WorkspacePanel title="How do you want to reach them?"
      description="Choose formats for your materials. Selecting a channel does not send a message or publish a page.">
      <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Channels and materials</legend>
        {channelOptions.map(item=><SelectionCard key={item.id} kind="checkbox"
          value={item.id} title={item.label} detail={item.detail}
          checked={plan.channels.includes(item.id)} disabled={busy}
          onChange={()=>setChannels(item.id)}/>)}
      </fieldset>
      <div className="mt-4"><WorkspaceNotice tone="info">
        Email and social materials are downloadable, not automatically sent. Text and share links
        require an authorized destination. Conversation Kit includes a printable overview.
      </WorkspaceNotice></div>
    </WorkspacePanel>}
    {step===5&&<WorkspacePanel title="Review & create"
      description="Choose your story angle, review the draft message, and create coordinated materials. Nothing is sent or published.">
      <div className="mt-4 space-y-5">
        <div className="grid gap-3 border bg-muted/20 p-3 text-sm sm:grid-cols-2">
          <p><strong>Recipients:</strong> {plan.recipients.join(", ")||"None selected"}</p>
          <p><strong>Beneficiaries:</strong> {plan.beneficiaries.join(", ")||"All audiences"}</p>
          <p><strong>Highlights:</strong> {plan.highlights.map(x=>x.label).join(", ")||"Not selected"}</p>
          <p><strong>Channels:</strong> {plan.channels.join(", ")||"Not selected"}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {storyOptions.map(item=><SelectionCard key={item.id} kind="radio"
            name="outreach-story-angle" value={item.id} title={item.label}
            detail={item.description} checked={plan.storyAngle===item.id}
            disabled={busy} onChange={()=>setStory(item.id)}/>)}
        </div>
        <WorkspaceNotice tone="info">
          <Sparkles className="mr-1 inline size-4" aria-hidden="true"/>
          Your suggested copy comes from the choices you reviewed. Planned Programs and Experiences
          are not approved offerings. You control what you share.
        </WorkspaceNotice>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Suggested message</h3>
          <Button type="button" variant="outline" size="sm" disabled={busy}
            onClick={()=>onPatch(suggested)}>Use suggestion for this plan</Button>
        </div>
        <Field label="Outreach name" required><Input value={title} maxLength={120}
          onChange={event=>onTitleChange(event.target.value)}/></Field>
        <Field label="Headline" required><Input value={content.headline} maxLength={160}
          onChange={event=>onPatch({headline:event.target.value})}/></Field>
        <Field label="Your message" required><Textarea value={content.message} rows={6}
          maxLength={1600} onChange={event=>onPatch({message:event.target.value})}/></Field>
        <Field label="What should they do next?"><Input value={content.callToAction}
          maxLength={100} onChange={event=>onPatch({callToAction:event.target.value})}/></Field>
        {currentSuggestion?.websiteAlternative&&
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>{
            const alternative=currentSuggestion.websiteAlternative;
            if(alternative)onPatch({
              headline:alternative.headline||content.headline,message:alternative.message,
            });
          }}>Use saved Website &amp; Brand wording</Button>}
        <div className="border p-4">
          <h3 className="text-sm font-semibold">Included materials</h3>
          <p className="mt-1 text-xs text-muted-foreground">{content.formats.map(id=>formatNames[id]).join(", ")||"Text or share-link copy only. No rendered material selected"}</p>
          {chosenMaterial&&<div className="mt-4">
            <MarketingMaterialPreviewV61 siteId={siteId} title={title} content={content}
              brandVersionId={brandVersionId} format={chosenMaterial}/></div>}
        </div>
      </div>
    </WorkspacePanel>}
    <ActionFooter layout="step">
      <Button type="button" variant="outline" disabled={busy} onClick={onBack}>
        <ArrowLeft aria-hidden="true"/>{step===0?"Cancel":"Back"}
      </Button>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy||!hasSavedPackage}
          onClick={onSaveExit}>Save &amp; Exit</Button>
        <Button type="button" disabled={busy} onClick={onNext}>
          {step===5?"Save Outreach Plan":"Save & Continue"}
          {step===5?<Check aria-hidden="true"/>:<ArrowRight aria-hidden="true"/>}
        </Button>
      </div>
    </ActionFooter>
  </>;
}
