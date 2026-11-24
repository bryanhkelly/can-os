import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyLinkButton } from "@/components/links/CopyLinkButton";
import { GoLinkQrButton } from "@/components/links/GoLinkQrButton";
import { Select } from "@/components/ui/select";
import { WorkspacePanel } from "@/components/workspace";
import { buildUrlDestination } from "@/domain/url-destinations";
import { goDestinationLabels, type GoDestination } from "@/domain/site-go-links";
import { resolveGoTargetInput } from "@/domain/go-target-input";
import {
  createSiteGoLink, listSiteGoLinksPage, revokeSiteGoLink,
  listAvailableGoDestinations, inspectSavedGoLink, setSiteGoLinkPaused,
} from "@/modules/engagement/site-go-links.functions";

type GoLink=Awaited<ReturnType<typeof listSiteGoLinksPage>>["items"][number];
type Choice=Awaited<ReturnType<typeof listAvailableGoDestinations>>[number];
type Kind=GoDestination["kind"];
const labels=goDestinationLabels;
const channelChoices=["email","flyer","qr","social","partner","other"] as const;
const readableState:Record<GoLink["availability"],string>={
  available:"Active",scheduled:"Scheduled",expired:"Expired",
  paused:"Paused",revoked:"Revoked",
};
function errorText(error:unknown){
  return error instanceof Error?error.message:"This Go Link action could not be completed.";
}
function fromLocalTime(value:string){
  if(!value)return null;
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))throw new Error("Enter a valid date and time.");
  return date.toISOString();
}
function advancedDestination(kind:Kind,value:string):GoDestination|null {
  if(kind==="site-page")return null;
  if(kind==="information")
    return /^[a-z][a-z0-9-]{1,60}$/.test(value)
      ?{kind:"information",journeyId:value}:null;
  const id=resolveGoTargetInput(kind,value,
    typeof window==="undefined"?undefined:window.location.origin);
  if(!id)return null;
  if(kind==="adult-training")return {kind,releaseId:id};
  if(kind==="class")return {kind,classId:id};
  return {kind:"enrichment",seasonId:id};
}

/** Three separate responsibilities share the same canonical Site-owned link:
 * selection/management, publication-aware routing, read-only outcome evidence.
 */
export function GoLinkWorkspace({siteId,packageId}:{siteId:string;packageId?:string}){
  const [links,setLinks]=useState<GoLink[]>([]);
  const [linkTerm,setLinkTerm]=useState("");
  const [destinationTerm,setDestinationTerm]=useState("");
  const listTerm=useDeferredValue(linkTerm.trim());
  const choiceTerm=useDeferredValue(destinationTerm.trim());
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [loadingMore,setLoadingMore]=useState(false);
  const [pageError,setPageError]=useState("");
  const pendingSubmission=useRef<{key:string;requestId:string}|null>(null);
  const [readState,setReadState]=useState<"loading"|"ready"|"error">("loading");
  const [retry,setRetry]=useState(0);
  const [kind,setKind]=useState<Kind>("site-page");
  const [choices,setChoices]=useState<Choice[]>([]);
  const [choiceState,setChoiceState]=useState<"loading"|"ready"|"error">("loading");
  const [selected,setSelected]=useState("");
  const [advanced,setAdvanced]=useState(false);
  const [target,setTarget]=useState("");
  const [name,setName]=useState("");
  const [channel,setChannel]=useState<""|typeof channelChoices[number]>("");
  const [startsAt,setStartsAt]=useState("");
  const [expiresAt,setExpiresAt]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  useEffect(()=>{
    let live=true;
    setReadState("loading");setNextCursor(null);setPageError("");
    listSiteGoLinksPage({data:{siteId,packageId,limit:20,term:listTerm}})
      .then(page=>{if(live){setLinks(page.items);setNextCursor(page.nextCursor);setReadState("ready");}})
      .catch(()=>{if(live)setReadState("error");});
    return ()=>{live=false;};
  },[siteId,packageId,retry,listTerm]);

  useEffect(()=>{
    let live=true;
    setChoiceState("loading");
    setChoices([]);setSelected("");
    listAvailableGoDestinations({data:{siteId,packageId,kind,term:choiceTerm}})
      .then(data=>{if(live){setChoices(data);setChoiceState("ready");}})
      .catch(()=>{if(live)setChoiceState("error");});
    return ()=>{live=false;};
  },[siteId,packageId,kind,choiceTerm]);

  const chosen=choices.find(item=>JSON.stringify(item.destination)===selected);
  const destination=advanced?advancedDestination(kind,target):chosen?.destination??null;
  async function create(){
    if(!destination || busy || readState!=="ready")return;
    setBusy(true);setError("");setNotice("");
    try{
      const linkName=(name.trim()||chosen?.title||"Shared link").slice(0,120);
      const payload={
        siteId,packageId,destination,
        management:{
          name:linkName,channel:channel||null,
          startsAt:fromLocalTime(startsAt),expiresAt:fromLocalTime(expiresAt),
        },
      };
      const key=JSON.stringify(payload);
      if(pendingSubmission.current?.key!==key){
        pendingSubmission.current={key,requestId:crypto.randomUUID()};
      }
      await createSiteGoLink({data:{...payload,requestId:pendingSubmission.current.requestId}});
      pendingSubmission.current=null;
      setName("");setStartsAt("");setExpiresAt("");
      setNotice("Go Link created. Copy it, test it, or add it to your outreach materials.");
      setRetry(n=>n+1);
    }catch(cause){setError(errorText(cause));}
    finally{setBusy(false);}
  }
  async function loadMore(){
    if(!nextCursor||loadingMore||readState!=="ready")return;
    setLoadingMore(true);setPageError("");
    try{
      const page=await listSiteGoLinksPage({data:{siteId,packageId,limit:20,cursor:nextCursor,term:listTerm}});
      setLinks(previous=>{
        const existing=new Set(previous.map(row=>row.id));
        return [...previous,...page.items.filter(row=>!existing.has(row.id))];
      });
      setNextCursor(page.nextCursor);
    }catch(cause){setPageError(errorText(cause));}
    finally{setLoadingMore(false);}
  }

  async function change(link:GoLink,action:"pause"|"resume"|"revoke"){
    if(busy || link.status==="revoked")return;
    if(action==="revoke" && !window.confirm(
      "Revoke this Go Link permanently? Distributed copies will stop working."))return;
    setBusy(true);setError("");setNotice("");
    try{
      if(action==="revoke"){
        await revokeSiteGoLink({data:{siteId,packageId,linkId:link.id}});
        setNotice("Go Link permanently revoked.");
      }else{
        await setSiteGoLinkPaused({data:{siteId,packageId,linkId:link.id,action}});
        setNotice(action==="pause"?"Go Link paused.":"Go Link resumed.");
      }
      setRetry(n=>n+1);
    }catch(cause){setError(errorText(cause));}
    finally{setBusy(false);}
  }
  async function inspect(link:GoLink){
    if(busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      const result=await inspectSavedGoLink({data:{siteId,packageId,linkId:link.id}});
      setNotice(result.navigable
        ? "Ready: "+result.title+". The destination is currently available."
        : "Unavailable: "+(result.availability!=="available"
          ?readableState[result.availability]:"The destination is no longer open or published.")+
          ". Test Link does not record a visit.");
    }catch(cause){setError(errorText(cause));}
    finally{setBusy(false);}
  }
  return <WorkspacePanel title="Go Links"
    description="Create a shareable entry point. The platform verifies the destination, manages the link and reports observed activity without collecting visitor identities.">
    <section aria-label="Create Go Link" className="mt-4 space-y-4 border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">What should people do?
          <Select value={kind} onChange={event=>{
            setKind(event.target.value as Kind);setTarget("");setSelected("");
            setChoices([]);setDestinationTerm("");setAdvanced(false);
          }}>
            {Object.entries(labels).map(([value,label])=>
              <option key={value} value={value}>{label}</option>)}
          </Select>
        </label>
        <label className="grid gap-1 text-sm font-medium">Choose an available destination
          <Select disabled={advanced||choiceState!=="ready"||choices.length===0}
            value={selected} onChange={event=>setSelected(event.target.value)}>
            <option value="">Select a published destination</option>
            {choices.map((item,index)=><option
              key={index} value={JSON.stringify(item.destination)}>{item.title}</option>)}
          </Select>
        </label>
      </div>
      <label className="block text-sm font-medium">
        Search available destinations
        <Input className="mt-1" value={destinationTerm}
          onChange={event=>setDestinationTerm(event.target.value)}
          placeholder="Search published titles" maxLength={80}/>
      </label>
      {choiceState==="loading"&&<p role="status" className="text-xs text-muted-foreground">
        Checking available destinations…</p>}
      {choiceState==="error"&&<p role="alert" className="text-xs text-destructive">
        The destination catalog could not load. Try changing the category or refresh.</p>}
      {choiceState==="ready"&&choices.length===0&&!advanced&&
        <p className="text-xs text-muted-foreground">
          No currently published, eligible destinations are available in this category.</p>}
      {chosen&&!advanced&&<p className="text-xs text-muted-foreground">
        {chosen.description}. Availability is checked again before creating or opening the link.</p>}
      {kind!=="site-page"&&<div>
        <Button type="button" variant="ghost" size="sm"
          onClick={()=>setAdvanced(value=>!value)}>
          {advanced?"Choose from the catalog":"Have an existing link or ID?"}
        </Button>
        {advanced&&<label className="mt-2 grid gap-1 text-sm font-medium">Existing internal link or ID
          <Input value={target} onChange={event=>setTarget(event.target.value.trim())}
            placeholder={kind==="information"?"Enter journey key":"Paste a same-origin link or compact ID"}/>
        </label>}
      </div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">Link name (for your team)
          <Input value={name} maxLength={120} onChange={event=>setName(event.target.value)}
            placeholder={chosen?.title??"Example: Sunday bulletin"}/>
        </label>
        <label className="grid gap-1 text-sm font-medium">Sharing channel
          <Select value={channel}
            onChange={event=>setChannel(event.target.value as typeof channel)}>
            <option value="">Not specified</option>
            {channelChoices.map(value=><option key={value} value={value}>
              {value[0]!.toUpperCase()+value.slice(1)}</option>)}
          </Select>
        </label>
        <label className="grid gap-1 text-sm font-medium">Activate on (optional)
          <Input type="datetime-local" value={startsAt}
            onChange={event=>setStartsAt(event.target.value)}/>
        </label>
        <label className="grid gap-1 text-sm font-medium">Expire on (optional)
          <Input type="datetime-local" value={expiresAt}
            onChange={event=>setExpiresAt(event.target.value)}/>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy||!destination||readState!=="ready"}
          onClick={()=>void create()}>{busy?"Working…":"Create Go Link"}</Button>
        <Button type="button" variant="outline" disabled={busy}
          onClick={()=>{setRetry(n=>n+1);setSelected("");}}>Refresh</Button>
      </div>
    </section>

    <label className="mt-5 block text-sm font-medium">
      Search saved links by name
      <Input className="mt-1" value={linkTerm}
        onChange={event=>setLinkTerm(event.target.value)}
        placeholder="Search links across this Site or outreach plan" maxLength={80}/>
    </label>
    {readState==="loading"&&<p role="status" className="mt-4 text-sm">Loading saved links…</p>}
    {readState==="error"&&<p role="alert" className="mt-4 text-sm text-destructive">
      Saved links are currently unavailable.</p>}
    {error&&<p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="mt-4 text-sm">{notice}</p>}
    {readState==="ready"&&<section aria-label="Managed links" className="mt-5 space-y-3">
      <h3 className="font-semibold">Your links</h3>
      {!links.length&&<p className="text-sm text-muted-foreground">
        {linkTerm?"No links match this search.":"No Go Links yet. Select an eligible destination above to create one."}</p>}
      {links.map(link=><article key={link.id} className="space-y-2 border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-medium">{link.name}</h4>
            <p className="mt-1 break-all font-mono text-xs select-all">
              {buildUrlDestination({kind:"go",code:link.code}).href}</p>
          </div>
          <span className="text-xs font-semibold">{readableState[link.availability]}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {labels[link.destination.kind]}{link.channel?" · "+link.channel:""}
          {link.startsAt?" · Opens "+new Date(link.startsAt).toLocaleString():""}
          {link.expiresAt?" · Expires "+new Date(link.expiresAt).toLocaleString():""}
        </p>
        {link.evidence?<p className="text-sm">
          <strong>{link.evidence.redirects30d.toLocaleString()}</strong> redirects in the last 30 days.
          {" "}{link.evidence.registrationEvidence==="referenced_noncredit_claim"
            ?<><strong>{link.evidence.referralRegistrations30d?.toLocaleString()??"0"}</strong>
              {" "}training registration claims carrying this referral code (not verified click-through conversions).</>
            :<span className="text-muted-foreground">
              Verified outcome attribution is not connected for this destination.</span>}
        </p>:<p className="text-xs text-muted-foreground">
          Outcome evidence is temporarily unavailable. Link controls remain accessible.
        </p>}
        <div className="flex flex-wrap gap-2">
          {link.status!=="revoked"&&<>
            <CopyLinkButton destination={{kind:"go",code:link.code}}/>
            <GoLinkQrButton code={link.code}/>
          </>}
          <Button type="button" size="sm" variant="outline" disabled={busy}
            onClick={()=>void inspect(link)}>Test link</Button>
          {link.status!=="revoked"&&<>
            <Button type="button" size="sm" variant="outline" disabled={busy}
              onClick={()=>void change(link,link.status==="paused"?"resume":"pause")}>
              {link.status==="paused"?"Resume":"Pause"}</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy}
              onClick={()=>void change(link,"revoke")}>Revoke</Button>
          </>}
        </div>
      </article>)}
      {nextCursor&&<div className="space-y-2">
        <Button type="button" size="sm" variant="outline" disabled={loadingMore}
          onClick={()=>void loadMore()}>{loadingMore?"Loading…":"Load more links"}</Button>
        {pageError&&<p role="alert" className="text-xs text-destructive">{pageError}</p>}
      </div>}
      <p className="text-xs text-muted-foreground">
        Redirects are unfiltered anonymous observations, which can include
        automated requests. They are not unique visitors or enrollments.
        Training registrations are counted from canonical enrollment claims,
        not from clicks. Other destination outcome types are shown as not connected,
        never as zero conversions.
      </p>
    </section>}
  </WorkspacePanel>;
}
