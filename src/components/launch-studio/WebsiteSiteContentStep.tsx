import { Link } from "@tanstack/react-router";
import { useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { DisclosureSection, SelectionCard } from "@/components/workspace";
import { ChurchSourceSuggestionReview } from "@/components/operations/ChurchSourceSuggestionReview";
import {
  isChurchSiteIdentityV61, isFaithBasedSiteIdentityV61, siteIdentityEditorialContextV61,
} from "@/domain/site-identity-v61";
import { previewLabels, Structure } from "./WebsiteTemplateGallery";
import { publicSitePagePaths, type PublicSitePath } from "@/domain/public-site-paths";
import { orderEligibleWebsitePages } from "@/domain/website-composition";
import { WebsiteCopyField, type WebsiteCopyFieldSpec } from "./WebsiteCopyField";
import { WebsiteLeadershipEditor } from "./WebsiteLeadershipEditor";
import {
  restoreOriginalWebsiteField, websiteStarterFieldIds,
  createSiteWebsiteEditorialBaseline, refreshSiteWebsiteSuggestedCopy,
  type SiteLocalContent, type SiteLocalTextField,
} from "@/domain/site-local-content";
import { prepareWebsiteCopyFromSiteInformation } from "@/domain/site-website-story-suggestions";
import type { getPartnerWebsitePreviewView } from "@/modules/sites/site-website-preview.functions";

const contentFields:ReadonlyArray<WebsiteCopyFieldSpec>=[
  {key:"heroHeadline",label:"Homepage headline",help:"The first words visitors see. Your site name still appears in the header.",shownOn:"The main headline on your homepage.",multi:true},
  {key:"welcomeMessage",label:"Welcome to your community",help:"Introduce the kind of community you hope to build.",shownOn:"The welcome below your homepage headline, when provided.",multi:true},
  {key:"churchHistory",label:"Your church's story",help:"If your organization is a church, tell visitors how it began and what shaped it.",shownOn:"About → Our story; may supply the homepage community-story paragraph if the main Site story and vision are blank.",multi:true},
  {key:"communityOutreach",label:"Your community",help:"What relationships, partnerships or hopes connect your Site with the people around it? Avoid describing unconfirmed activities.",shownOn:"About → Serving our community (if supplied).",multi:true},
  {key:"schoolVision",label:"Your vision",help:"What do you hope people will learn, experience, or achieve?",shownOn:"Your homepage vision and About page.",multi:true},
  {key:"leadershipWelcome",label:"A welcome from your host or Site leader",help:"A personal message from your host or site leader, with their permission.",shownOn:"About → A welcome from our leadership; final homepage community-story fallback.",multi:true},
  {key:"localTraditions",label:"Local traditions and experiences",help:"Share real local traditions, service projects and community experiences.",shownOn:"About → Local traditions (if supplied).",multi:true},
  {key:"localDescription",label:"Your Site story",help:"What makes this place and its purpose special? Describe what you're planning without promising services you can't yet offer.",shownOn:"Homepage Community Story and About → Our community (when supplied).",multi:true},
  {key:"denomination",label:"Denominational affiliation",help:"Describe your church's identity. Do not claim an endorsement that has not been granted.",shownOn:"About → Denominational identity. This editable description is not evidence of verified network affiliation.",multi:false},
  {key:"statementOfFaith",label:"Statement of faith",help:"Share your organization's statement of faith, if relevant.",shownOn:"About → Statement of faith (if supplied).",multi:true},
  {key:"spiritualFormation",label:"Spiritual formation",help:"Prayer, worship, discipleship, chapel or religious observances provided locally.",shownOn:"About → Spiritual formation (if supplied).",multi:true},
];

/** All copy controls consume the one saved Site Story and the one Website
 * document. No second editor, source field store or Brand implementation. */
export function WebsiteSiteContentStep({
  data,content,setContent,busy,
}:{
  data:Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>;
  content:SiteLocalContent;
  setContent:Dispatch<SetStateAction<SiteLocalContent>>;
  busy:boolean;
}){
  const [selectedPage,setSelectedPage]=useState<PublicSitePath>("/");
  const canReuse=content.contentReuseConsent === "granted";
  const canApplyExperienceWelcome=canReuse &&
    (!content.welcomeMessage.trim() ||
      (content.editorialBaseline?.fields.welcomeMessage===content.welcomeMessage));
  const schoolExperience=data.siteExperienceProfile==="school";
  const identityContext=siteIdentityEditorialContextV61(data.siteIdentity);
  const faithBased=isFaithBasedSiteIdentityV61(data.siteIdentity);
  const churchSite=isChurchSiteIdentityV61(data.siteIdentity);
  const siteKind=data.siteIdentity?.siteType;
  const fields=contentFields.map(field=>{
    if(field.key==="localDescription"&&siteKind==="church_community")return {...field,
      label:"Our church and community story",
      help:"Share the story of your congregation, its purpose, and the community you hope to serve. Describe plans as plans."};
    if(field.key==="localDescription"&&siteKind==="faith_based_org")return {...field,
      label:"Our mission and story",
      help:"Share what inspires your work, whom you serve, and how faith shapes your mission."};
    if(field.key==="localDescription"&&siteKind==="community_nonprofit")return {...field,
      label:"Our community story",
      help:"Share what matters locally, who you hope to serve, and the change you want to support."};
    if(field.key==="localDescription"&&siteKind==="training_workforce")return {...field,
      label:"Our training mission",
      help:"Explain which skills and opportunities you hope to make more accessible. Avoid promising outcomes or jobs."};
    if(field.key==="localDescription"&&siteKind==="school_education")return {...field,
      label:"Our school story",
      help:"Describe your educational vision and what makes your approach distinctive. Only mention programs that are confirmed."};
    if(field.key==="welcomeMessage"&&churchSite)return {...field,
      label:"A welcome to our faith community",help:"Introduce your congregation and what visitors might find here."};
    if(field.key==="schoolVision"&&siteKind==="church_community")return {...field,
      label:"Our hope for the community",help:"What do you hope people will learn, experience, and contribute?"};
    if(field.key==="schoolVision"&&siteKind==="training_workforce")return {...field,
      label:"Our vision for learners",help:"What skills or opportunities do you hope participants can explore?"};
    if(field.key==="churchHistory"&&!churchSite)return {...field,
      label:faithBased?"Your organization\u0027s faith story":"Previously saved church history",
      help:faithBased?"How did your community or mission begin? Include only facts you want visitors to read."
        :"Review this previously saved answer. You can edit or clear it."};
    if(field.key==="denomination"&&!churchSite)return {...field,
      label:faithBased?"Faith tradition or affiliation":"Previously saved religious affiliation",
      help:faithBased?"Describe your Site\u0027s tradition. Only claim formal membership or endorsement when verified."
        :"Review this previously saved answer. You can edit or clear it."};
    if(schoolExperience)return field;
    if(field.key==="heroHeadline")return {...field,
      help:"The first words visitors see. Your saved Site name remains in the header."};
    if(field.key==="welcomeMessage")return {...field,
      label:"Welcome to your community",help:"Introduce the people and community you hope to serve."};
    if(field.key==="schoolVision")return {...field,
      help:"What might participants learn or experience here?",
      shownOn:"Homepage Vision and About → Our learning vision; may supply the community-story fallback."};
    if(field.key==="leadershipWelcome")return {...field,
      help:"Optional words approved by your host or Site leader for visitors."};
    return field;
  });
  const expectedCopy=createSiteWebsiteEditorialBaseline(data.siteName,data.siteExperienceProfile).fields;
  const originalCopy=content.editorialBaseline?.fields;
  const refreshable=canReuse&&originalCopy
    ? websiteStarterFieldIds.filter(field=>content[field]===originalCopy[field] &&
        content[field]!==expectedCopy[field]) : [];
  const primaryFields=websiteStarterFieldIds.map(key=>
    fields.find(field=>field.key===key)!);
  const additionalFields=fields.filter(field=>
    ["leadershipWelcome","localTraditions"].includes(field.key));
  const faithFields=fields.filter(field=>
    ["churchHistory","denomination","statementOfFaith","spiritualFormation"].includes(field.key));
  // Existing authored faith content remains editable if the Site changes identity.
  // A non-faith Site does not see empty church-specific forms or fetch church sources.
  const hasSavedFaithContent=faithFields.some(field=>Boolean(content[field.key as SiteLocalTextField]?.trim()));
  const showFaithFields=faithBased||hasSavedFaithContent;
  const renderField=(field:WebsiteCopyFieldSpec)=>
    <WebsiteCopyField key={field.key} field={field} content={content}
      candidate={canReuse?data.siteStoryCopyCandidates.find(item=>item.field===field.key):undefined}
      disabled={busy||!data.canEdit}
      onChange={value=>setContent(old=>({...old,[field.key]:value}))}
      onRestore={()=>setContent(old=>restoreOriginalWebsiteField(old,field.key))}/>;

  const available=orderEligibleWebsitePages(publicSitePagePaths.filter(path=>path==="/"||path==="/about"||path==="/leadership"||Object.prototype.hasOwnProperty.call(data.previewPages,path)),content.websiteComposition);
  const page=available.includes(selectedPage)?selectedPage:"/";
  return <div className="space-y-5">
    <div>
      <h3 className="font-serif text-2xl">Tell your story</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {identityContext.storyPrompt} {canReuse
          ? "Review suggested text or write your own."
          : "Add the text you want on your website."}
      </p>
      {data.siteIdentity&&<p className="mt-2 text-xs text-muted-foreground">
        Based on your Site identity: {identityContext.label}.{" "}
        <Link to="/launch/site" search={{siteId:data.siteId,module:"site-information"}}
          className="font-semibold text-primary underline">Edit Site Information</Link>
      </p>}

    </div>

    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(16rem,21rem)_minmax(0,1fr)]">
      <div role="group" aria-label="Website content pages" className="space-y-2">
        {available.map(path=><SelectionCard key={path} kind="radio" name="website-content-page" value={path} checked={page===path} onChange={checked=>{if(checked)setSelectedPage(path);}} title={previewLabels[path]} detail={path==="/"? "Headline, welcome, story and vision":path==="/about"?"Mission, community and values":path==="/leadership"?"Leadership profiles and welcome":"Managed Site information"} icon={<span className="block w-16 shrink-0"><Structure id={content.branding.templateId??"heritage"} page={path} viewport="desktop" thumbnail/></span>} className="w-full"/>)}
      </div>
      <section className="min-w-0 space-y-5 border border-border bg-card p-4" aria-label={previewLabels[page]+" content"}>
        <h3 className="font-serif text-xl font-semibold">{previewLabels[page]}</h3>
    {page==="/"&&data.plannedExperienceNames.length>0&&<div className="space-y-3 border p-4">
      <h4 className="text-sm font-semibold">Experiences from your Site plan</h4>
      <p className="text-xs text-muted-foreground">
        These are ideas you're exploring. Your website draws on the saved Site plan; launch and enrollment approval remain separate.
      </p>
      <p className="text-sm">{data.plannedExperienceNames.join(" · ")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/launch/site" search={{siteId:data.siteId,module:"programs-audiences"}}
          className="text-sm font-semibold text-primary underline">
          Edit planned Experiences
        </Link>
        {data.suggestedExperienceWelcome&&<Button type="button" variant="outline"
          disabled={busy||!data.canEdit||!canApplyExperienceWelcome}
          onClick={()=>setContent(old=>({...old,welcomeMessage:data.suggestedExperienceWelcome??old.welcomeMessage}))}>
          Use Experiences in welcome copy
        </Button>}
      </div>
      {!canReuse&&<p className="text-xs text-muted-foreground">
        Allow us to use what you've shared to suggest a welcome. You can always write your own.
      </p>}
      {!canApplyExperienceWelcome&&canReuse&&<p className="text-xs text-muted-foreground">
        Your authored welcome copy is preserved. Edit it directly if you want to mention Experiences.
      </p>}
    </div>}
    {page==="/"&&refreshable.length>0&&<div className="flex flex-wrap items-center justify-between gap-3 border border-border p-4" role="status">
      <div>
        <p className="text-sm font-semibold">Updated starter wording is available</p>
        <p className="mt-1 text-xs text-muted-foreground">
          We have {refreshable.length} updated starter suggestions for your site name and learning focus.
          Your own words and earlier saved versions won't change.
        </p>
      </div>
      <Button type="button" variant="outline" disabled={busy||!data.canEdit}
        onClick={()=>setContent(old=>refreshSiteWebsiteSuggestedCopy(
          old,data.siteName,data.siteExperienceProfile))}>
        Update suggestions
      </Button>
    </div>}
    {page==="/"&&canReuse&&data.siteStoryCopyCandidates.length>0&&
      <div className="flex flex-wrap items-center justify-between gap-3 border p-3">
        <span className="text-sm">
          {data.siteStoryCopyCandidates.length} suggestions available.
        </span>
        <Button type="button" variant="outline" disabled={busy||!data.canEdit}
          onClick={()=>setContent(old=>prepareWebsiteCopyFromSiteInformation(
            old,data.siteStoryCopyCandidates))}>
          Use suggested text
        </Button>
      </div>}
    {page==="/about"&&canReuse&&data.siteStorySourceChoices&&<div className="border bg-muted/20 p-4 text-sm" role="note">
      <p className="font-semibold">Ideas from what you've shared</p>
      <p className="mt-2 text-muted-foreground">
        Values: {data.siteStorySourceChoices.values.join(", ")||"not selected"}.
        Priorities: {data.siteStorySourceChoices.motivations.join(", ")||"not selected"}.
        Suggestions also use your written origin, community needs and vision.
        Public-facing wording is always editable.
      </p>
      <Link to="/launch/site" search={{siteId:data.siteId,module:"site-information"}}
        className="mt-3 inline-block font-semibold text-primary underline">
        Review Site Information
      </Link>
    </div>}
    {page==="/"&&primaryFields.filter(field=>field.key!=="communityOutreach").map(renderField)}
    {page==="/about"&&primaryFields.filter(field=>["localDescription","schoolVision","communityOutreach"].includes(field.key)).map(renderField)}
    {page==="/about"&&canReuse&&churchSite&&<DisclosureSection title="Suggested text (optional)">
      <ChurchSourceSuggestionReview currentRevision={data.currentRevision}/>
    </DisclosureSection>}
    {page==="/about"&&additionalFields.filter(field=>field.key==="localTraditions").map(renderField)}
    {page==="/leadership"&&additionalFields.filter(field=>field.key==="leadershipWelcome").map(renderField)}
    {page==="/about"&&showFaithFields&&<DisclosureSection title={faithBased ? (churchSite ? "Your church and faith information" : "Faith and values (optional)") : "Previously saved faith information"}>
      <p className="mt-2 text-xs text-muted-foreground">
        {faithBased ? "Use only descriptions that reflect your Site. Formal affiliations are reviewed separately."
          : "These earlier answers are preserved so you can review, edit or clear them after changing Site identity."}
      </p>
      <div className="mt-4 space-y-5">{faithFields.map(renderField)}</div>
    </DisclosureSection>}
    {page==="/leadership"&&<WebsiteLeadershipEditor content={content} setContent={setContent} disabled={busy||!data.canEdit}/>}
    {!["/","/about","/leadership"].includes(page)&&<div className="space-y-3 text-sm"><p>This page uses governed Site information and approved learning opportunities rather than independent website copy.</p><Link to="/launch/site" search={{siteId:data.siteId,module:page==="/contact"?"site-information":"programs-audiences"}} className="font-semibold text-primary underline">Manage source information</Link></div>}
    </section></div>
    <p className="text-xs text-muted-foreground">Your website pages and sections are prepared from your Site information and evolve with your approved learning opportunities.</p>
  </div>;
}
