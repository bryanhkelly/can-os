import { Link } from "@tanstack/react-router";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceNotice } from "@/components/workspace";
import { ChurchSourceSuggestionReview } from "@/components/operations/ChurchSourceSuggestionReview";
import { WebsiteCopyField, type WebsiteCopyFieldSpec } from "./WebsiteCopyField";
import { SiteContentChannelEditor } from "./SiteContentChannelEditor";
import { WebsiteTemplateSourceGuide } from "./WebsiteTemplateSourceGuide";
import {
  restoreOriginalWebsiteField, websiteStarterFieldIds,
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
  const primaryFields=websiteStarterFieldIds.map(key=>
    contentFields.find(field=>field.key===key)!);
  const additionalFields=contentFields.filter(field=>
    ["churchHistory","leadershipWelcome","localTraditions","denomination",
      "statementOfFaith","spiritualFormation"].includes(field.key));
  const renderField=(field:WebsiteCopyFieldSpec)=>
    <WebsiteCopyField key={field.key} field={field} content={content}
      candidate={data.siteStoryCopyCandidates.find(item=>item.field===field.key)}
      disabled={busy||!data.canEdit}
      onChange={value=>setContent(old=>({...old,[field.key]:value}))}
      onRestore={()=>setContent(old=>restoreOriginalWebsiteField(old,field.key))}/>;

  return <div className="space-y-5">
    <div>
      <h3 className="font-serif text-2xl">Build your website from what you have already shared.</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Site Information provides your origin story, community needs, values, learner
        experiences and future vision. Your words remain editable before sharing.
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Prepared text is a suggestion, not a verified promise about programs, staff
        or opening status. CAN OS remains the source of approved academic and admissions facts.
      </p>
    </div>
    <p className="text-xs italic leading-5 text-muted-foreground">
      We use your saved Purpose &amp; Story answers to prepare website copy and
      potential outreach materials. Review names, permissions, personal details
      and factual claims before sharing. Nothing goes live automatically.
    </p>
    <details className="border border-border p-3" aria-label="Website section source reference">
      <summary className="cursor-pointer text-sm font-semibold">
        See every homepage section, heading, element and source
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        The exact saved Site and Brand names are displayed. This reference distinguishes
        your editable copy from CAN's fixed template text and governed public records.
      </p>
      <WebsiteTemplateSourceGuide template={content.branding.templateId ?? "heritage"} page="/" />
    </details>
    {data.siteStoryCopyCandidates.length>0&&
      <div className="flex flex-wrap items-center justify-between gap-3 border p-3">
        <span className="text-sm">
          {data.siteStoryCopyCandidates.length} source-based drafts available from Site Information.
        </span>
        <Button type="button" variant="outline" disabled={busy||!data.canEdit}
          onClick={()=>setContent(old=>prepareWebsiteCopyFromSiteInformation(
            old,data.siteStoryCopyCandidates))}>
          Use Site Information in unchanged starter fields
        </Button>
      </div>}
    {data.siteStorySourceChoices&&<div className="border bg-muted/20 p-4 text-sm" role="note">
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
    <details className="border p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Review source-attributed church story suggestions (optional)
      </summary>
      <div className="mt-4">
        <ChurchSourceSuggestionReview currentRevision={data.currentRevision}/>
      </div>
    </details>
    <details className="border p-4">
      <summary className="cursor-pointer text-sm font-semibold">More optional church details</summary>
      <div className="mt-4 space-y-5">{additionalFields.map(renderField)}</div>
    </details>
    <details className="border p-4" id="website-content-layout">
      <summary className="cursor-pointer text-sm font-semibold">
        Arrange Programs, Courses, Classes and website sections
      </summary>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        These are Site-owned content blocks configured in Launch. Each reads
        its approved source when available. Layout changes do not approve Programs
        or open enrollment.
      </p>
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
