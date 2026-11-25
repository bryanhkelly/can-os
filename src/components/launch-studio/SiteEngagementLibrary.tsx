import { Field } from "@/components/ui/field";
import { SiteCampaignEvidencePanel } from "@/components/reports/SiteCampaignEvidencePanel";
import { EngagementEmailDistribution } from "./EngagementEmailDistribution";
import { GoLinkActions } from "@/components/links/GoLinkActions";
import { engagementOwnerScopeKey } from "@/domain/engagement-owner-scope";
import { engagementChannels, engagementChannelLabels, type EngagementChannel } from "@/domain/engagement-definition";
import type { OwnerEngagementSurface } from "@/components/links/OwnerEngagementDestinationPicker";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ActionDialog, EmptyState, QueryState, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import {
  createEngagementGoLink, listEngagementGoLinks,
  listSiteEngagementDefinitions, listOwnerEngagementDefinitions, retireEngagementDefinition,
  revokeEngagementGoLink,
} from "@/modules/engagement/engagement-registry.functions";

type Entry=Awaited<ReturnType<typeof listSiteEngagementDefinitions>>[number];
type Link=Awaited<ReturnType<typeof listEngagementGoLinks>>[number];
const problem=(error:unknown)=>error instanceof Error?error.message:"Action unavailable.";

/**
 * Recover published experiences and their actual persisted Go Links. In-memory
 * authoring state must never be the only way to manage a distributed link.
 */
type LibraryProps={siteId?:string;packageId?:string;ownerSurface?:OwnerEngagementSurface;emailOnly?:boolean};
export function SiteEngagementLibrary(props:LibraryProps){
  const scope=engagementOwnerScopeKey(props.siteId,props.packageId,props.ownerSurface?.owner);
  return <SiteEngagementLibrarySession key={props.emailOnly?scope+":email":scope} {...props}/>;
}
function SiteEngagementLibrarySession({siteId,packageId,ownerSurface,emailOnly=false}:LibraryProps){
  const [records,setRecords]=useState<Entry[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [links,setLinks]=useState<Link[]>([]);
  const [linksFor,setLinksFor]=useState<string|null>(null);
  const [distribution,setDistribution]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [linksLoading,setLinksLoading]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [channel,setChannel]=useState<EngagementChannel>(emailOnly?"email":"web");
  const [busy,setBusy]=useState(false);
  const pending=useRef(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [confirmation,setConfirmation]=useState<{engagementId:string;link?:Link}|null>(null);

  useEffect(()=>{
    let active=true;
    setLoading(true);
    (ownerSurface?listOwnerEngagementDefinitions({data:{owner:ownerSurface.owner}}):listSiteEngagementDefinitions({data:{siteId:siteId!,packageId:packageId!}}))
      .then(rows=>{
        if(!active)return;
        const available=emailOnly?rows.filter(row=>row.status==="active"):rows;
        setRecords(available);
        setSelected(previous=>previous&&available.some(row=>row.engagementId===previous)
          ?previous:available[0]?.engagementId??null);
        setLoading(false);
      })
      .catch(()=>{
        if(active){setRecords([]);setSelected(null);setError("Unable to load published engagements.");setLoading(false);}
      });
    return ()=>{active=false;};
  },[siteId,packageId,ownerSurface?.owner.kind,ownerSurface?.owner.kind==="organization"?ownerSurface.owner.organizationId:null,refresh,emailOnly]);

  useEffect(()=>{
    let active=true;
    setDistribution(null);setLinks([]);setLinksFor(null);
    if(!selected){setLinksLoading(false);return;}
    setLinksLoading(true);
    listEngagementGoLinks({data:{engagementId:selected}})
      .then(rows=>{if(active){const available=emailOnly?rows.filter(row=>row.channel==="email"&&row.status==="active"):rows;setLinks(available);setLinksFor(selected);setLinksLoading(false);}})
      .catch(()=>{if(active){setLinks([]);setError("Unable to load saved Go Links.");setLinksLoading(false);}});
    return ()=>{active=false;};
  },[selected,refresh,emailOnly]);

  const record=records.find(row=>row.engagementId===selected);
  // State alone cannot fence two actions before React commits a busy render.
  function beginMutation(){
    if(pending.current||loading||linksLoading)return false;
    pending.current=true;setBusy(true);setError("");setMessage("");
    return true;
  }
  function endMutation(){pending.current=false;setBusy(false);}
  function refreshLibrary(){
    if(pending.current)return;
    setError("");setMessage("");setConfirmation(null);
    setRefresh(n=>n+1);
  }
  async function createLink(){
    if(!record||record.status!=="active"||!beginMutation())return;
    try{
      const created=await createEngagementGoLink({
        data:{engagementId:record.engagementId,versionId:record.versionId,channel},
      });
      setMessage("Go Link created and saved.");
      // Reload saved links as the authoritative persisted representation.
      if(created.linkId)setRefresh(n=>n+1);
    }catch(error){setError(problem(error));}
    finally{endMutation();}
  }
  async function revoke(link:Link){
    if(!record||linksFor!==record.engagementId||link.status==="revoked"||!beginMutation())return;
    try{
      await revokeEngagementGoLink({
        data:{engagementId:record.engagementId,linkId:link.id},
      });
      setLinks(current=>current.map(row=>row.id===link.id
        ? {...row,status:"revoked" as const}:row));
      setMessage("Go Link revoked.");setConfirmation(null);
    }catch(error){setError(problem(error));}
    finally{endMutation();}
  }
  async function retire(){
    if(!record||record.status==="retired"||!beginMutation())return;
    try{
      await retireEngagementDefinition({data:{engagementId:record.engagementId}});
      setRecords(rows=>rows.map(row=>row.engagementId===record.engagementId
        ? {...row,status:"retired" as const}:row));
      setMessage("Engagement retired. Existing links cannot be used.");setConfirmation(null);
    }catch(error){setError(problem(error));}
    finally{endMutation();}
  }
  return <WorkspacePanel
    title={emailOnly?"Saved email invitations":"Published engagement library"}
    description={emailOnly?"Select a previously prepared invitation to resume recipient management. Review its saved wording before sending.":"Saved invitations and links remain manageable after you leave this page. Each published engagement is an immutable version."}>
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy}
        onClick={refreshLibrary}>Refresh</Button>
    </div>
    {loading&&<QueryState loading="Loading published engagements…"/>}
    {!loading&&!records.length&&!error&&
      <EmptyState className="mt-4" title={emailOnly?"No saved invitations yet. Prepare a new email invitation below.":"No published experiences in this workspace yet."}/>}
    {!loading&&records.length>0&&<>
      <Field className="mt-4" label="Published experience">
        <Select id="saved-go-engagement" disabled={busy} value={selected??""} onChange={event=>{
          if(pending.current)return;
          setSelected(event.target.value);setLinks([]);setLinksFor(null);setLinksLoading(true);setDistribution(null);setConfirmation(null);setError("");setMessage("");
        }}>
          {records.map(row=><option key={row.engagementId} value={row.engagementId}>
            {row.headline} (v{row.version}, {row.status})
          </option>)}
        </Select>
      </Field>
      {record&&<>
        <div className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium">{record.domain}</span> · {record.mode==="page"?"Rendered experience":"Direct destination"} · {record.status}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {!emailOnly&&<Field label="Channel">
          <Select value={channel} disabled={busy} onChange={event=>{if(!pending.current)setChannel(event.target.value as EngagementChannel);}}>
              {engagementChannels.map(id=><option value={id} key={id}>{engagementChannelLabels[id]}</option>)}
            </Select>
        </Field>}
          <Button type="button" disabled={busy||linksLoading||record.status!=="active"} onClick={()=>void createLink()}>
            {busy?"Working…":emailOnly?"Prepare email link":"Create another Go Link"}
          </Button>
          {!emailOnly&&<Button type="button" variant="outline" disabled={busy||linksLoading||record.status==="retired"}
            onClick={()=>setConfirmation({engagementId:record.engagementId})}>Retire engagement</Button>}
        </div>
      </>}
      {linksLoading&&<QueryState loading="Loading saved links…"/>}
      {!linksLoading&&selected!==null&&linksFor===selected&&<div className="mt-4 grid gap-2">
        {!links.length&&<EmptyState title="No Go Links issued for this engagement."/>}
        {links.map(link=><div key={link.id} className="flex flex-wrap justify-between gap-2 border p-3">
          <div className="min-w-0">
            <p className="font-mono text-sm select-all">/go/{link.code}</p>
            <p className="text-xs text-muted-foreground">
              {link.channel??"Unspecified channel"} · {record?.status==="retired"?"Engagement retired":link.status}
            </p>
            {link.evidence?<p className="mt-1 text-xs text-muted-foreground">{link.evidence.redirects30d} observed requests · {link.evidence.registrationEvidence==="referenced_noncredit_claim"?`${link.evidence.referralRegistrations30d??0} matching registration claims`:"Outcome not connected"} (30 days; not unique people or causal conversions)</p>:<p className="mt-1 text-xs text-muted-foreground">Outcome evidence unavailable.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {!emailOnly&&link.status==="active"&&record?.status==="active"&&<GoLinkActions code={link.code} status="active"
              busy={busy} allowPause={false} onChange={action=>{if(action==="revoke")setConfirmation({engagementId:record.engagementId,link});}}/>}
            {link.channel==="email"&&link.status==="active"&&record?.status==="active"&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>setDistribution(link.id)}>{emailOnly?"Add recipients / manage campaign":"Prepare email"}</Button>}
          </div>
        </div>)}
      </div>}
      {distribution&&!linksLoading&&linksFor===selected&&record?.status==="active"&&links.some(link=>link.id===distribution&&link.status==="active")&&<EngagementEmailDistribution key={distribution} engagementId={record.engagementId} linkId={distribution} onClose={()=>setDistribution(null)}/>}
    </>}
    {!emailOnly&&siteId&&!ownerSurface&&<SiteCampaignEvidencePanel key={siteId} siteId={siteId}/>}
    {error&&<WorkspaceNotice tone="danger" className="mt-4">{error}</WorkspaceNotice>}
    {message&&<WorkspaceNotice tone="success" className="mt-4">{message}</WorkspaceNotice>}
    <ActionDialog open={!!confirmation&&confirmation.engagementId===selected}
      title={confirmation?.link?"Revoke Go Link":"Retire engagement"}
      description={confirmation?.link?"Existing distributed copies of this Go Link will stop working.":"All Go Links for this engagement will stop resolving."}
      confirmLabel={confirmation?.link?"Revoke link":"Retire engagement"}
      pending={busy} destructive confirmDisabled={linksLoading||!record||record.status!=="active"||!!confirmation?.link&&(linksFor!==selected||!links.some(link=>link.id===confirmation.link?.id&&link.status==="active"))}
      onClose={()=>setConfirmation(null)} onConfirm={()=>{
        if(!confirmation||confirmation.engagementId!==selected)return;
        if(confirmation.link)void revoke(confirmation.link);else void retire();
      }}>
      {error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
    </ActionDialog>
  </WorkspacePanel>;
}
