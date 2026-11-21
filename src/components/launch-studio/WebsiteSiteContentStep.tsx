import { Link } from "@tanstack/react-router";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceNotice } from "@/components/workspace";
import { ChurchSourceSuggestionReview } from "@/components/operations/ChurchSourceSuggestionReview";
import { WebsiteCopyField, type WebsiteCopyFieldSpec } from "./WebsiteCopyField";
import { SiteContentChannelEditor } from "./SiteContentChannelEditor";
import { WebsiteTemplateSourceGuide } from "./WebsiteTemplateSourceGuide";
import { WebsiteLeadershipEditor } from "./WebsiteLeadershipEditor";
import {
  restoreOriginalWebsiteField, websiteStarterFieldIds,
  createSiteWebsiteEditorialBaseline, refreshSiteWebsiteSuggestedCopy,
  type SiteLocalContent, type SiteLocalTextField,
} from "@/domain/site-local-content";
import { prepareWebsiteCopyFromSiteInformation } from "@/domain/site-website-story-suggestions";
import type { getPartnerWebsitePreviewView } from "@/modules/sites/site-website-preview.functions";

const contentFields:ReadonlyArray<WebsiteCopyFieldSpec>=[
  {key:"heroHeadline",label:"Homepage headline",help:"The first words families see. Your Site name still appears in the website header.",shownOn:"Homepage hero H1, replacing the default Site-name heading. The saved Brand name remains in the masthead.",multi:true},
  {key:"welcomeMessage",label:"Welcome to families",help:"Introduce the kind of community you hope to build.",shownOn:"Homepage hero subheading below the H1, only when supplied.",multi:true},
  {key:"churchHistory",label:"Tell us about your church",help:"When did your church begin? Share its history and important milestones.",shownOn:"About → Our story; may supply the homepage community-story paragraph if the main Site story and vision are blank.",multi:true},
  {key:"communityOutreach",label:"Your community",help:"What relationships, partnerships or hopes connect your Site with the people around it? Avoid describing unconfirmed activities.",shownOn:"About → Serving our community (if supplied).",multi:true},
  {key:"schoolVision",label:"Your vision",help:"What do you hope students will become? You can personalize the prepared wording.",shownOn:"Homepage Vision body and About → Why we started a school; can also be the community-story fallback.",multi:true},
  {key:"leadershipWelcome",label:"A welcome from your host or Site leader",help:"Optional words approved by your church leader for families.",shownOn:"About → A welcome from our leadership; final homepage community-story fallback.",multi:true},
  {key:"localTraditions",label:"Local traditions and experiences",help:"Share real local traditions, service projects and community experiences.",shownOn:"About → Local traditions (if supplied).",multi:true},
  {key:"localDescription",label:"Your Site story",help:"What makes your Site's purpose and community special? Avoid promises about unapproved academic services.",shownOn:"Homepage Community Story and About → Our community (when supplied).",multi:true},
  {key:"denomination",label:"Denominational affiliation",help:"Describe your church's identity. Do not claim an endorsement that has not been granted.",shownOn:"About → Denominational identity. This editable description is not evidence of verified network affiliation.",multi:false},
  {key:"statementOfFaith",label:"Statement of faith",help:"Your church's own theological statement, not CAN's academic policies.",shownOn:"About → Statement of faith (if supplied).",multi:true},
  {key:"spiritualFormation",label:"Spiritual formation",help:"Prayer, worship, discipleship, chapel or religious observances provided locally.",shownOn:"About → Spiritual formation (if supplied).",multi:true},
];

/** All copy controls consume the one saved Site Story and the one Website
 * document. No second editor, source field store or Brand implementation. */
export function WebsiteSiteContentStep({
  data,content,setContent,busy,allowPublication,onContentBlocksSaved,
  onContentBlocksDirty,
}:{
  data:Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>;
  content:SiteLocalContent;
  setContent:Dispatch<SetStateAction<SiteLocalContent>>;
  busy:boolean;allowPublication:boolean;
  onContentBlocksSaved:()=>void;onContentBlocksDirty:(dirty:boolean)=>void;
}){
  const canReuse=content.contentReuseConsent === "granted";
  const schoolExperience=data.siteExperienceProfile==="school";
  const fields=contentFields.map(field=>{
    if(schoolExperience)return field;
    if(field.key==="heroHeadline")return {...field,
      help:"The first words visitors see. Your saved Site name remains in the header."};
    if(field.key==="welcomeMessage")return {...field,
      label:"Welcome to learners",help:"Introduce the people and community you hope to serve."};
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
    ["churchHistory","leadershipWelcome","localTraditions","denomination",
      "statementOfFaith","spiritualFormation"].includes(field.key));
  const renderField=(field:WebsiteCopyFieldSpec)=>
    <WebsiteCopyField key={field.key} field={field} content={content}
      candidate={canReuse?data.siteStoryCopyCandidates.find(item=>item.field===field.key):undefined}
      disabled={busy||!data.canEdit}
      onChange={value=>setContent(old=>({...old,[field.key]:value}))}
      onRestore={()=>setContent(old=>restoreOriginalWebsiteField(old,field.key))}/>;

  return <div className="space-y-5">
    <div>
      <h3 className="font-serif text-2xl">Your Content</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {canReuse
          ? "Edit suggested text or write your own."
          : "Add the text you want on your website."}
      </p>

    </div>

    <details className="border border-border p-3" aria-label="Website section source reference">
      <summary className="cursor-pointer text-sm font-semibold">
        Where website content comes from
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        See which sections use your text, template content, or Site information.
      </p>
      <WebsiteTemplateSourceGuide template={content.branding.templateId ?? "heritage"} page="/" />
    </details>
    {refreshable.length>0&&<div className="flex flex-wrap items-center justify-between gap-3 border border-border p-4" role="status">
      <div>
        <p className="text-sm font-semibold">Program and audience suggestions have changed</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {refreshable.length} untouched suggested fields can be updated for the current Site plan.
          Your own wording, approved offerings and saved website versions stay unchanged.
        </p>
      </div>
      <Button type="button" variant="outline" disabled={busy||!data.canEdit}
        onClick={()=>setContent(old=>refreshSiteWebsiteSuggestedCopy(
          old,data.siteName,data.siteExperienceProfile))}>
        Refresh suggested wording
      </Button>
    </div>}
    {canReuse&&data.siteStoryCopyCandidates.length>0&&
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
    {canReuse&&data.siteStorySourceChoices&&<div className="border bg-muted/20 p-4 text-sm" role="note">
      <p className="font-semibold">Suggestions from Site Information</p>
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
    {primaryFields.map(renderField)}
    {canReuse&&<details className="border p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Suggested text (optional)
      </summary>
      <div className="mt-4">
        <ChurchSourceSuggestionReview currentRevision={data.currentRevision}/>
      </div>
    </details>}
    <details className="border p-4">
      <summary className="cursor-pointer text-sm font-semibold">More details (optional)</summary>
      <div className="mt-4 space-y-5">{additionalFields.map(renderField)}</div>
    </details>
    <WebsiteLeadershipEditor content={content} setContent={setContent} disabled={busy||!data.canEdit}/>
    <details className="border p-4" id="website-content-layout">
      <summary className="cursor-pointer text-sm font-semibold">
        Arrange website sections
      </summary>

      {data.canPublish
        ? <div className="mt-4">
            <SiteContentChannelEditor
              key={data.siteId+":"+data.contentChannelConfig.revision}
              siteId={data.siteId}
              initialConfig={data.contentChannelConfig}
              canPublish={allowPublication&&data.canPublish}
              onSaved={onContentBlocksSaved}
              onDirtyChange={onContentBlocksDirty}/>
          </div>
        : <WorkspaceNotice tone="attention" className="mt-4">
            Your current Site assignment does not permit editing website sections.
            Ask a Site Administrator for the appropriate authorization.
          </WorkspaceNotice>}
    </details>
  </div>;
}
