import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkspacePanel } from "@/components/workspace";
import {
  engagementDomains, engagementAudienceKinds, engagementInteractions,
  engagementSubjectKinds, engagementDefinitionSchema,
  type EngagementDefinition,
} from "@/domain/engagement-definition";
import {
  goDestinationSchema, goPageIds, type GoDestination,
} from "@/domain/site-go-links";
import {
  createEngagementDefinition, createEngagementGoLink,
  revokeEngagementGoLink,
} from "@/modules/engagement/engagement-registry.functions";

type LinkTargetKind=GoDestination["kind"];
type Published={engagementId:string;versionId:string;version:number};
type CreatedLink={linkId:string;code:string};
const journeys=[
  ["start-a-school","Church or school exploration"],
  ["teach-with-can","Teacher recruitment interest"],
  ["family-admissions","Family admissions information"],
  ["school-expansion","School expansion"],
  ["church-networks","Network partnership"],
] as const;

const labels=(id:string)=>id.replaceAll("_"," ").replaceAll("-"," ").replace(/\b\w/g,letter=>letter.toUpperCase());
const errorMessage=(error:unknown)=>error instanceof Error?error.message:"Unable to publish this engagement.";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Site-specific consumer of the platform registry. It does not own registry
 * data and does not create a separate outreach/contact/admissions service.
 */
export function UniversalEngagementPublisher({
  siteId,packageId,
}:{siteId:string;packageId:string}){
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
  const [targetKind,setTargetKind]=useState<LinkTargetKind>("information");
  const [target,setTarget]=useState("start-a-school");
  const [page,setPage]=useState<Extract<GoDestination,{kind:"site-page"}>["page"]>("contact");
  const [channel,setChannel]=useState<"email"|"sms"|"qr"|"social"|"partner"|"web"|"other">("web");
  const [published,setPublished]=useState<Published|null>(null);
  const [links,setLinks]=useState<CreatedLink[]>([]);
  const [revoked,setRevoked]=useState<Set<string>>(()=>new Set());
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const destination=():GoDestination=>{
    if(targetKind==="site-page")return {kind:"site-page",page};
    if(targetKind==="adult-training")return {kind:"adult-training",releaseId:target};
    if(targetKind==="class")return {kind:"class",classId:target};
    if(targetKind==="enrichment")return {kind:"enrichment",seasonId:target};
    return {kind:"information",journeyId:target};
  };
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
    source:{marketingPackageId:packageId},
  };
  const ready=engagementDefinitionSchema.safeParse(draft).success &&
    (targetKind==="site-page"||targetKind==="information"||uuid.test(target));
  async function publish(){
    if(!ready || busy || published)return;
    setError("");setNotice("");setBusy(true);
    try{
      const saved=await createEngagementDefinition({
        data:{owner:{kind:"site",siteId},definition:draft},
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
  async function copy(code:string){
    try{
      await navigator.clipboard.writeText(window.location.origin+"/go/"+code);
      setError("");setNotice("Copied Go Link.");
    }catch{setError("Unable to copy. Select the link text and copy manually.");}
  }
  return <WorkspacePanel title="Context-aware engagement"
    description="Publish a reusable invitation or opportunity experience, then generate channel-specific Go Links. No application, employment, partnership or enrollment is created here.">
    {!published ? <>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">Business domain
          <Select value={domain} onChange={event=>setDomain(event.target.value as typeof domain)}>
            {engagementDomains.map(value=><option key={value} value={value}>{labels(value)}</option>)}
          </Select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Intended audience
          <Select value={audience} onChange={event=>setAudience(event.target.value as typeof audience)}>
            {engagementAudienceKinds.map(value=><option key={value} value={value}>{labels(value)}</option>)}
          </Select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Subject type
          <Select value={subjectKind} onChange={event=>setSubjectKind(event.target.value as typeof subjectKind)}>
            {engagementSubjectKinds.map(value=><option key={value} value={value}>{labels(value)}</option>)}
          </Select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Requested interaction
          <Select value={interaction} onChange={event=>setInteraction(event.target.value as typeof interaction)}>
            {engagementInteractions.map(value=><option key={value} value={value}>{labels(value)}</option>)}
          </Select>
        </label>
      </div>
      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-sm font-semibold">Subject name
          <Input value={subjectLabel} maxLength={160} placeholder="Digital Skills Community Program"
            onChange={event=>setSubjectLabel(event.target.value)}/>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Headline
          <Input value={headline} maxLength={160} placeholder="You're invited to explore digital learning"
            onChange={event=>setHeadline(event.target.value)}/>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Short introduction
          <Textarea rows={3} value={summary} maxLength={1200} onChange={event=>setSummary(event.target.value)}/>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Optional detail
          <Textarea rows={3} value={detail} maxLength={3000} onChange={event=>setDetail(event.target.value)}/>
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">Visitor experience
          <Select value={execution} onChange={event=>setExecution(event.target.value as typeof execution)}>
            <option value="page">Render a branded invitation page</option>
            <option value="redirect">Go directly to an existing destination</option>
          </Select>
        </label>
        {execution==="page"&&<label className="grid gap-1 text-sm font-semibold">Page template
          <Select value={template} onChange={event=>setTemplate(event.target.value as typeof template)}>
            <option value="information">Information</option>
            <option value="invitation">Invitation</option>
            <option value="opportunity">Opportunity</option>
          </Select>
        </label>}
        <label className="grid gap-1 text-sm font-semibold">Next-step destination
          <Select value={targetKind} onChange={event=>{
            const kind=event.target.value as LinkTargetKind;setTargetKind(kind);
            setTarget(kind==="information"?"start-a-school":"");
          }}>
            <option value="information">Curated information / inquiry journey</option>
            <option value="site-page">Published Site page</option>
            <option value="adult-training">Approved adult training release</option>
            <option value="class">Specific Class</option>
            <option value="enrichment">Enrichment Season</option>
          </Select>
        </label>
        {targetKind==="information"
          ? <label className="grid gap-1 text-sm font-semibold">Journey
              <Select value={target} onChange={event=>setTarget(event.target.value)}>
                {journeys.map(([id,label])=><option key={id} value={id}>{label}</option>)}
              </Select>
            </label>
          : targetKind==="site-page"
          ? <label className="grid gap-1 text-sm font-semibold">Published page
              <Select value={page} onChange={event=>setPage(event.target.value as typeof page)}>
                {goPageIds.map(id=><option value={id} key={id}>{labels(id)}</option>)}
              </Select>
            </label>
          : <label className="grid gap-1 text-sm font-semibold">Exact published target ID
              <Input value={target} placeholder="UUID" onChange={event=>setTarget(event.target.value.trim())}/>
            </label>}
        {execution==="page"&&<label className="grid gap-1 text-sm font-semibold">Button label
          <Input maxLength={80} value={actionLabel} onChange={event=>setActionLabel(event.target.value)}/>
        </label>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Publishing creates an immutable, publicly accessible definition. Review content before continuing. This is not a formal program approval or registration.</p>
      <Button type="button" className="mt-4" disabled={busy||!ready} onClick={()=>void publish()}>
        {busy?"Publishing…":"Publish engagement"}
      </Button>
    </> : <>
      <p className="mt-4 text-sm font-medium">Published engagement version {published.version}</p>
      <p className="mt-1 text-xs text-muted-foreground">The public experience content cannot be changed in this version. New Go Links can be issued or revoked.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-semibold">Distribution channel
          <Select value={channel} onChange={event=>setChannel(event.target.value as typeof channel)}>
            {(["web","email","sms","qr","social","partner","other"] as const).map(c=>
              <option key={c} value={c}>{labels(c)}</option>)}
          </Select>
        </label>
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
            <Button size="sm" variant="outline" disabled={revoked.has(link.linkId)}
              onClick={()=>void copy(link.code)}>Copy link</Button>
            <Button size="sm" variant="outline" disabled={busy||revoked.has(link.linkId)}
              onClick={()=>void revoke(link)}>Revoke</Button>
          </div>
        </div>)}
      </div>
    </>}
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
  </WorkspacePanel>;
}
