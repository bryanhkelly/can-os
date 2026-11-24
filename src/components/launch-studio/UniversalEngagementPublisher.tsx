import { Field } from "@/components/ui/field";
import { GoLinkActions } from "@/components/links/GoLinkActions";
import { engagementOwnerScopeKey } from "@/domain/engagement-owner-scope";
import { OwnerEngagementDestinationPicker, type OwnerEngagementSurface } from "@/components/links/OwnerEngagementDestinationPicker";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkspacePanel } from "@/components/workspace";
import {
  engagementDomains, engagementAudienceKinds, engagementInteractions,
  engagementSubjectKinds, engagementDefinitionSchema,
  type EngagementDefinition, type EngagementOwner,
} from "@/domain/engagement-definition";
import type {GoDestination} from "@/domain/site-go-links";
import {GovernedGoDestinationPicker} from "@/components/links/GovernedGoDestinationPicker";
import { engagementActionAvailable } from "@/domain/engagement-action-policy";
import {
  createEngagementDefinition, createEngagementGoLink,
  revokeEngagementGoLink,
} from "@/modules/engagement/engagement-registry.functions";

type Published={engagementId:string;versionId:string;version:number};
type CreatedLink={linkId:string;code:string};
const labels=(id:string)=>id.replaceAll("_"," ").replaceAll("-"," ").replace(/\b\w/g,letter=>letter.toUpperCase());
const errorMessage=(error:unknown)=>error instanceof Error?error.message:"Unable to publish this engagement.";

/**
 * Site-specific consumer of the platform registry. It does not own registry
 * data and does not create a separate outreach/contact/admissions service.
 */
type PublisherProps={siteId?:string;packageId?:string;ownerSurface?:OwnerEngagementSurface};
export function UniversalEngagementPublisher(props:PublisherProps){
  return <UniversalEngagementPublisherSession key={engagementOwnerScopeKey(props.siteId,props.packageId,props.ownerSurface?.owner)} {...props}/>;
}
function UniversalEngagementPublisherSession({siteId,packageId,ownerSurface}:PublisherProps){
  const owner:EngagementOwner=ownerSurface?.owner??{kind:"site",siteId:siteId!};
  const [domain,setDomain]=useState<EngagementDefinition["domain"]>("outreach");
  const [subjectKind,setSubjectKind]=useState<EngagementDefinition["subject"]["kind"]>("initiative");
  const [subjectLabel,setSubjectLabel]=useState("");
  const [audience,setAudience]=useState<EngagementDefinition["audience"][number]>("public");
  const [interaction,setInteraction]=useState<EngagementDefinition["interaction"]>("discover");
  const [headline,setHeadline]=useState("");
  const [summary,setSummary]=useState("");
  const [detail,setDetail]=useState("");
  const [template,setTemplate]=useState<"information"|"invitation"|"opportunity">("invitation");
  const [actionLabel,setActionLabel]=useState("Learn more");
  const [execution,setExecution]=useState<"page"|"redirect">("page");
  const [target,setTarget]=useState<GoDestination|null>(null);
  const [channel,setChannel]=useState<"email"|"sms"|"qr"|"social"|"partner"|"web"|"other">("web");
  const [published,setPublished]=useState<Published|null>(null);
  const [links,setLinks]=useState<CreatedLink[]>([]);
  const [revoked,setRevoked]=useState<Set<string>>(()=>new Set());
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  // A placeholder is never publishable; the real destination must be chosen
  // from the server's current publication-aware catalog.
  const destination=():GoDestination=>target??{kind:"information",journeyId:"start-a-school"};
  const draft:EngagementDefinition={
    domain,subject:{kind:subjectKind,id:null,label:subjectLabel.trim()},
    audience:[audience],interaction,
    expectedOutcome:interaction==="discover"?"viewed":interaction==="apply"?"application":
      interaction==="register"?"registration":interaction==="schedule"?"appointment":
      interaction==="contribute"?"contribution":interaction==="accept"?"agreement":
      interaction==="continue"?"participation":"inquiry",
    presentation:{headline:headline.trim(),summary:summary.trim(),
      ...(detail.trim()?{detail:detail.trim()}:{})},
    execution:execution==="page"
      ? {mode:"page",template,action:destination(),actionLabel:actionLabel.trim()}
      : {mode:"redirect",destination:destination()},
    ...(packageId?{source:{marketingPackageId:packageId}}:{}),
  };
  const actionSupported=target!==null && engagementActionAvailable(interaction,target);
  const ready=actionSupported && engagementDefinitionSchema.safeParse(draft).success;
  async function publish(){
    if(!ready || busy || published)return;
    setError("");setNotice("");setBusy(true);
    try{
      const saved=await createEngagementDefinition({
        data:{owner,definition:draft},
      });
      setPublished(saved);
      setNotice("Published immutable engagement v1. You can create independent links for each channel.");
    }catch(error){setError(errorMessage(error));}
    finally{setBusy(false);}
  }
  async function createLink(){
    if(!published||busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      const link=await createEngagementGoLink({
        data:{engagementId:published.engagementId,versionId:published.versionId,channel},
      });
      setLinks(current=>[link,...current]);
      setNotice("Go Link created. Copy its URL to distribute.");
    }catch(error){setError(errorMessage(error));}
    finally{setBusy(false);}
  }
  async function revoke(link:CreatedLink){
    if(!published||busy||revoked.has(link.linkId))return;
    if(!window.confirm("Revoke this link? Previously distributed copies will stop working."))return;
    setBusy(true);setError("");setNotice("");
    try{
      await revokeEngagementGoLink({
        data:{engagementId:published.engagementId,linkId:link.linkId},
      });
      setRevoked(current=>new Set(current).add(link.linkId));
      setNotice("The link was revoked.");
    }catch(error){setError(errorMessage(error));}
    finally{setBusy(false);}
  }
  return <WorkspacePanel title="Context-aware engagement"
    description="Publish a reusable invitation or opportunity experience, then generate channel-specific Go Links. No application, employment, partnership or enrollment is created here.">
    {!published ? <>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Business domain">
          <Select value={domain} onChange={event=>setDomain(event.target.value as typeof domain)}>
            {engagementDomains.map(value=><option key={value} value={value}>{labels(value)}</option>)}
          </Select>
        </Field>
        <Field label="Intended audience">
          <Select value={audience} onChange={event=>setAudience(event.target.value as typeof audience)}>
            {engagementAudienceKinds.map(value=><option key={value} value={value}>{labels(value)}</option>)}
          </Select>
        </Field>
        <Field label="Subject type">
          <Select value={subjectKind} onChange={event=>setSubjectKind(event.target.value as typeof subjectKind)}>
            {engagementSubjectKinds.map(value=><option key={value} value={value}>{labels(value)}</option>)}
          </Select>
        </Field>
        <Field label="Requested interaction">
          <Select value={interaction} onChange={event=>setInteraction(event.target.value as typeof interaction)}>
            {engagementInteractions.map(value=><option key={value} value={value}>{labels(value)}</option>)}
          </Select>
        </Field>
      </div>
      <div className="mt-4 grid gap-3">
        <Field label="Subject name">
          <Input value={subjectLabel} maxLength={160} placeholder="Digital Skills Community Program"
            onChange={event=>setSubjectLabel(event.target.value)}/>
        </Field>
        <Field label="Headline">
          <Input value={headline} maxLength={160} placeholder="You're invited to explore digital learning"
            onChange={event=>setHeadline(event.target.value)}/>
        </Field>
        <Field label="Short introduction">
          <Textarea rows={3} value={summary} maxLength={1200} onChange={event=>setSummary(event.target.value)}/>
        </Field>
        <Field label="Optional detail">
          <Textarea rows={3} value={detail} maxLength={3000} onChange={event=>setDetail(event.target.value)}/>
        </Field>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Visitor experience">
          <Select value={execution} onChange={event=>setExecution(event.target.value as typeof execution)}>
            <option value="page">Render a branded invitation page</option>
            <option value="redirect">Go directly to an existing destination</option>
          </Select>
        </Field>
        {execution==="page"&&<Field label="Page template">
          <Select value={template} onChange={event=>setTemplate(event.target.value as typeof template)}>
            <option value="information">Information</option>
            <option value="invitation">Invitation</option>
            <option value="opportunity">Opportunity</option>
          </Select>
        </Field>}
        <div className="sm:col-span-2">
          {ownerSurface?<OwnerEngagementDestinationPicker surface={ownerSurface} value={target} onChange={setTarget} disabled={busy}/>:siteId?<GovernedGoDestinationPicker siteId={siteId} packageId={packageId}
            value={target} onChange={setTarget} disabled={busy}/>:null}
        </div>
        {execution==="page"&&<Field label="Button label">
          <Input maxLength={80} value={actionLabel} onChange={event=>setActionLabel(event.target.value)}/>
        </Field>}
      </div>
      {!actionSupported&&<p role="status" className="mt-3 text-sm text-muted-foreground">
        This destination cannot complete the selected interaction. Use Discover or Respond for informational journeys; Register requires an eligible training release or enrichment Season. Application, payment, agreement and verified resume integrations are not yet available.
      </p>}
      <p className="mt-3 text-xs text-muted-foreground">Publishing creates an immutable, publicly accessible definition. Review content before continuing. This is not a formal program approval or registration.</p>
      <Button type="button" className="mt-4" disabled={busy||!ready} onClick={()=>void publish()}>
        {busy?"Publishing…":"Publish engagement"}
      </Button>
    </> : <>
      <p className="mt-4 text-sm font-medium">Published engagement version {published.version}</p>
      <p className="mt-1 text-xs text-muted-foreground">The public experience content cannot be changed in this version. New Go Links can be issued or revoked.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Distribution channel">
          <Select value={channel} onChange={event=>setChannel(event.target.value as typeof channel)}>
            {(["web","email","sms","qr","social","partner","other"] as const).map(c=>
              <option key={c} value={c}>{labels(c)}</option>)}
          </Select>
        </Field>
        <Button disabled={busy} type="button" onClick={()=>void createLink()}>
          {busy?"Working…":"Create Go Link"}
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        {!links.length&&<p className="text-sm text-muted-foreground">Create a link for distribution.</p>}
        {links.map(link=><div key={link.linkId} className="flex flex-wrap items-center justify-between gap-2 border p-3">
          <div>
            <p className="font-mono text-sm select-all">/go/{link.code}</p>
            {revoked.has(link.linkId)&&<p className="text-xs text-muted-foreground">Revoked</p>}
          </div>
          <div className="flex gap-2">
            <GoLinkActions code={link.code} status={revoked.has(link.linkId)?"revoked":"active"}
              busy={busy} allowPause={false} onChange={action=>{if(action==="revoke")void revoke(link);}}/>
          </div>
        </div>)}
      </div>
    </>}
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
  </WorkspacePanel>;
}
