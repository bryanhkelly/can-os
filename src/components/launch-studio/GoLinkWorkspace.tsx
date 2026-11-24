import { Field } from "@/components/ui/field";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoLinkEvidenceReport } from "@/components/reports/GoLinkEvidenceReport";
import { GoLinkActions } from "@/components/links/GoLinkActions";
import { GoDestinationChoiceField } from "@/components/links/GoDestinationChoiceField";
import { useGoDestinationChoices } from "@/hooks/use-go-destination-choices";
import { Select } from "@/components/ui/select";
import { ActionDialog, ActionFooter, EmptyState, QueryState, StatusBadge, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import { buildUrlDestination } from "@/domain/url-destinations";
import { goDestinationLabels, goDestinationSelectionKey, type GoDestination } from "@/domain/site-go-links";
import { resolveGoTargetInput } from "@/domain/go-target-input";
import {
  createSiteGoLink, listSiteGoLinksPage, revokeSiteGoLink,
  listAvailableGoDestinations, inspectSavedGoLink, setSiteGoLinkPaused,
} from "@/modules/engagement/site-go-links.functions";

type GoLink=Awaited<ReturnType<typeof listSiteGoLinksPage>>["items"][number];
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
  if(kind==="site-page"||kind==="website-preview")return null;
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
type GoLinkWorkspaceProps={siteId:string;packageId?:string};
export function GoLinkWorkspace(props:GoLinkWorkspaceProps){
  return <GoLinkWorkspaceSession key={JSON.stringify([props.siteId,props.packageId])} {...props}/>;
}
function GoLinkWorkspaceSession({siteId,packageId}:GoLinkWorkspaceProps){
  const [links,setLinks]=useState<GoLink[]>([]);
  const [linkTerm,setLinkTerm]=useState("");
  const [destinationTerm,setDestinationTerm]=useState("");
  const listTerm=useDeferredValue(linkTerm.trim());
  const activeListTermRef=useRef(listTerm);
  activeListTermRef.current=listTerm;
  const choiceTerm=useDeferredValue(destinationTerm.trim());
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [loadingMore,setLoadingMore]=useState(false);
  const [pageError,setPageError]=useState("");
  const pendingSubmission=useRef<{key:string;requestId:string}|null>(null);
  const [readState,setReadState]=useState<"loading"|"ready"|"error">("loading");
  const [retry,setRetry]=useState(0);
  const [kind,setKind]=useState<Kind>("site-page");
  const [selected,setSelected]=useState<GoDestination|null>(null);
  const [advanced,setAdvanced]=useState(false);
  const [target,setTarget]=useState("");
  const [name,setName]=useState("");
  const [channel,setChannel]=useState<""|typeof channelChoices[number]>("");
  const [startsAt,setStartsAt]=useState("");
  const [expiresAt,setExpiresAt]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [revokeTarget,setRevokeTarget]=useState<GoLink|null>(null);

  useEffect(()=>{
    let live=true;
    setReadState("loading");setNextCursor(null);setPageError("");
    listSiteGoLinksPage({data:{siteId,packageId,limit:20,term:listTerm}})
      .then(page=>{if(live){setLinks(page.items);setNextCursor(page.nextCursor);setReadState("ready");}})
      .catch(()=>{if(live)setReadState("error");});
    return ()=>{live=false;};
  },[siteId,packageId,retry,listTerm]);

  const catalog=useGoDestinationChoices(
    ["site",siteId,packageId??null,kind,choiceTerm],
    ()=>listAvailableGoDestinations({data:{siteId,packageId,kind,term:choiceTerm}}),
  );
  const searchPending=choiceTerm!==destinationTerm.trim();
  const choiceState=searchPending||catalog.loading?"loading":catalog.error?"error":"ready";
  const choices=choiceState==="ready"?catalog.choices:[];
  const chosen=selected?choices.find(item=>goDestinationSelectionKey(item.destination)===goDestinationSelectionKey(selected)):undefined;
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
      const submission=pendingSubmission.current?.key===key
        ?pendingSubmission.current:{key,requestId:crypto.randomUUID()};
      pendingSubmission.current=submission;
      await createSiteGoLink({data:{...payload,requestId:submission.requestId}});
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
      const queryTerm=listTerm;
      const page=await listSiteGoLinksPage({data:{siteId,packageId,limit:20,cursor:nextCursor,term:queryTerm}});
      if(queryTerm!==activeListTermRef.current)return;
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
    setBusy(true);setError("");setNotice("");
    try{
      if(action==="revoke"){
        await revokeSiteGoLink({data:{siteId,packageId,linkId:link.id}});
        setNotice("Go Link permanently revoked.");setRevokeTarget(null);
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
          ?readableState[result.availability]:"The destination is no longer available.")+
          ". Test Link does not record a visit.");
    }catch(cause){setError(errorText(cause));}
    finally{setBusy(false);}
  }
  return <WorkspacePanel title="Go Links"
    description="Create a shareable entry point. The platform verifies the destination, manages the link and reports observed activity without collecting visitor identities.">
    <section aria-label="Create Go Link" className="mt-4 space-y-4 border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What should people do?">
          <Select value={kind} onChange={event=>{
            setKind(event.target.value as Kind);setTarget("");setSelected(null);
            setDestinationTerm("");setAdvanced(false);
          }}>
            {Object.entries(labels).filter(([value])=>value!=="website-preview").map(([value,label])=>
              <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
        <GoDestinationChoiceField label="Choose an available destination" placeholder="Select a published destination"
          choices={choices} value={selected} onChange={setSelected} disabled={busy||advanced||choiceState!=="ready"}/>
      </div>
      <Field label="Search available destinations">
          <Input value={destinationTerm}
          onChange={event=>{setDestinationTerm(event.target.value);setSelected(null);}}
          placeholder="Search published titles" maxLength={80}/>
        </Field>
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
        {advanced&&<Field label="Existing internal link or ID" className="mt-2">
          <Input value={target} onChange={event=>setTarget(event.target.value.trim())}
            placeholder={kind==="information"?"Enter journey key":"Paste a same-origin link or compact ID"}/>
        </Field>}
      </div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Link name (for your team)">
          <Input value={name} maxLength={120} onChange={event=>setName(event.target.value)}
            placeholder={chosen?.title??"Example: Sunday bulletin"}/>
        </Field>
        <Field label="Sharing channel">
          <Select value={channel}
            onChange={event=>setChannel(event.target.value as typeof channel)}>
            <option value="">Not specified</option>
            {channelChoices.map(value=><option key={value} value={value}>
              {value[0]!.toUpperCase()+value.slice(1)}</option>)}
          </Select>
        </Field>
        <Field label="Activate on (optional)">
          <Input type="datetime-local" value={startsAt}
            onChange={event=>setStartsAt(event.target.value)}/>
        </Field>
        <Field label="Expire on (optional)">
          <Input type="datetime-local" value={expiresAt}
            onChange={event=>setExpiresAt(event.target.value)}/>
        </Field>
      </div>
      <ActionFooter layout="inline">
        <Button type="button" disabled={busy||!destination||readState!=="ready"}
          onClick={()=>void create()}>{busy?"Working…":"Create Go Link"}</Button>
        <Button type="button" variant="outline" disabled={busy}
          onClick={()=>{setRetry(n=>n+1);setSelected(null);catalog.retry();}}>Refresh</Button>
      </ActionFooter>
    </section>

    <Field label="Search saved links by name" className="mt-5">
          <Input value={linkTerm}
        onChange={event=>setLinkTerm(event.target.value)}
        placeholder="Search links across this Site or outreach plan" maxLength={80}/>
        </Field>
    {readState!=="ready"&&<QueryState loading={readState==="loading"?"Loading saved links…":undefined}
      error={readState==="error"?"Saved links are currently unavailable.":undefined} onRetry={()=>setRetry(n=>n+1)}/>}
    {error&&<WorkspaceNotice tone="danger" className="mt-4">{error}</WorkspaceNotice>}
    {notice&&<WorkspaceNotice className="mt-4">{notice}</WorkspaceNotice>}
    {readState==="ready"&&<section aria-label="Managed links" className="mt-5 space-y-3">
      <h3 className="font-semibold">Your links</h3>
      {!links.length&&<EmptyState kind={linkTerm?"matches":"records"} title={linkTerm?"No links match this search.":"No Go Links yet. Select an eligible destination above to create one."}/>}
      {links.map(link=><article key={link.id} className="space-y-2 border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-medium">{link.name}</h4>
            <p className="mt-1 break-all font-mono text-xs select-all">
              {buildUrlDestination({kind:"go",code:link.code}).href}</p>
          </div>
          <StatusBadge tone={link.availability==="available"?"success":link.availability==="scheduled"?"info":link.availability==="paused"?"attention":"neutral"}>{readableState[link.availability]}</StatusBadge>
        </div>
        <p className="text-xs text-muted-foreground">
          {labels[link.destination.kind]}{link.channel?" · "+link.channel:""}
          {link.startsAt?" · Opens "+new Date(link.startsAt).toLocaleString():""}
          {link.expiresAt?" · Expires "+new Date(link.expiresAt).toLocaleString():""}
        </p>
        {link.evidence?<p className="text-sm">
          <strong>{link.evidence.linkOpens30d.toLocaleString()}</strong> classified link opens, {link.evidence.pageViews30d.toLocaleString()} rendered pages and {link.evidence.redirectResponses30d.toLocaleString()} redirects in the last 30 days.
          {link.evidence.unclassifiedEntries30d>0&&<> {link.evidence.unclassifiedEntries30d.toLocaleString()} legacy entries have no response classification.</>}
          {" "}{link.evidence.registrationEvidence==="referenced_noncredit_claim"
            ?<><strong>{link.evidence.referralRegistrations30d?.toLocaleString()??"0"}</strong>
              {" "}training registration claims carrying this referral code (not verified click-through conversions).</>
            :<span className="text-muted-foreground">
              Verified outcome attribution is not connected for this destination.</span>}
        </p>:<p className="text-xs text-muted-foreground">
          Outcome evidence is temporarily unavailable. Link controls remain accessible.
        </p>}
        {link.evidence&&<GoLinkEvidenceReport evidence={link.evidence}/>}
        <GoLinkActions code={link.code} status={link.status} busy={busy}
          onTest={()=>void inspect(link)} onChange={action=>{if(action==="revoke")setRevokeTarget(link);else void change(link,action);}}/>

      </article>)}
      {nextCursor&&<div className="space-y-2">
        <Button type="button" size="sm" variant="outline" loading={loadingMore} loadingLabel="Loading…" onClick={()=>void loadMore()}>Load more links</Button>
        {pageError&&<WorkspaceNotice tone="danger">{pageError}</WorkspaceNotice>}
      </div>}
      <p className="text-xs text-muted-foreground">
        Link opens, rendered pages and redirects are unfiltered anonymous observations, which can include
        automated requests. They are not unique visitors or enrollments.
        Training registrations are counted from canonical enrollment claims,
        not from clicks. Other destination outcome types are shown as not connected,
        never as zero conversions.
      </p>
    </section>}
    <ActionDialog open={!!revokeTarget} title="Revoke Go Link permanently"
      description="Distributed copies of this Go Link will stop working."
      confirmLabel="Revoke link" pending={busy} destructive
      confirmDisabled={readState!=="ready"||!revokeTarget||!links.some(link=>link.id===revokeTarget.id&&link.status!=="revoked")}
      onClose={()=>setRevokeTarget(null)} onConfirm={()=>{if(revokeTarget)void change(revokeTarget,"revoke");}}>
      {error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
    </ActionDialog>
  </WorkspacePanel>;
}
