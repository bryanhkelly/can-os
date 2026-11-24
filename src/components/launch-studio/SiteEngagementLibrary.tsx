import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { SiteCampaignEvidencePanel } from "@/components/reports/SiteCampaignEvidencePanel";
import { EngagementEmailDistribution } from "./EngagementEmailDistribution";
import { GoLinkActions } from "@/components/links/GoLinkActions";
import { engagementOwnerScopeKey } from "@/domain/engagement-owner-scope";
import { engagementChannels, engagementChannelLabels, type EngagementChannel } from "@/domain/engagement-definition";
import type { OwnerEngagementSurface } from "@/components/links/OwnerEngagementDestinationPicker";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { WorkspacePanel } from "@/components/workspace";
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
type LibraryProps={siteId?:string;packageId?:string;ownerSurface?:OwnerEngagementSurface};
export function SiteEngagementLibrary(props:LibraryProps){
  const scope=engagementOwnerScopeKey(props.siteId,props.packageId,props.ownerSurface?.owner);
  return <SiteEngagementLibrarySession key={scope} {...props}/>;
}
function SiteEngagementLibrarySession({siteId,packageId,ownerSurface}:LibraryProps){
  const [records,setRecords]=useState<Entry[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [links,setLinks]=useState<Link[]>([]);
  const [linksFor,setLinksFor]=useState<string|null>(null);
  const [distribution,setDistribution]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [linksLoading,setLinksLoading]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [channel,setChannel]=useState<EngagementChannel>("web");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  useEffect(()=>{
    let active=true;
    setLoading(true);
    (ownerSurface?listOwnerEngagementDefinitions({data:{owner:ownerSurface.owner}}):listSiteEngagementDefinitions({data:{siteId:siteId!,packageId:packageId!}}))
      .then(rows=>{
        if(!active)return;
        setRecords(rows);
        setSelected(previous=>previous&&rows.some(row=>row.engagementId===previous)
          ?previous:rows[0]?.engagementId??null);
        setLoading(false);
      })
      .catch(()=>{
        if(active){setRecords([]);setSelected(null);setError("Unable to load published engagements.");setLoading(false);}
      });
    return ()=>{active=false;};
  },[siteId,packageId,ownerSurface?.owner.kind,ownerSurface?.owner.kind==="organization"?ownerSurface.owner.organizationId:null,refresh]);

  useEffect(()=>{
    let active=true;
    setDistribution(null);setLinks([]);setLinksFor(null);
    if(!selected){setLinksLoading(false);return;}
    setLinksLoading(true);
    listEngagementGoLinks({data:{engagementId:selected}})
      .then(rows=>{if(active){setLinks(rows);setLinksFor(selected);setLinksLoading(false);}})
      .catch(()=>{if(active){setLinks([]);setError("Unable to load saved Go Links.");setLinksLoading(false);}});
    return ()=>{active=false;};
  },[selected,refresh]);

  const record=records.find(row=>row.engagementId===selected);
  async function createLink(){
    if(!record||record.status!=="active"||busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      const created=await createEngagementGoLink({
        data:{engagementId:record.engagementId,versionId:record.versionId,channel},
      });
      setMessage("Go Link created and saved.");
      // Reload saved links as the authoritative persisted representation.
      if(created.linkId)setRefresh(n=>n+1);
    }catch(error){setError(problem(error));}
    finally{setBusy(false);}
  }
  async function revoke(link:Link){
    if(!record||busy||linksFor!==record.engagementId||link.status==="revoked")return;
    if(!window.confirm("Revoke this Go Link? Existing distributed copies will stop working."))return;
    setBusy(true);setError("");setMessage("");
    try{
      await revokeEngagementGoLink({
        data:{engagementId:record.engagementId,linkId:link.id},
      });
      setLinks(current=>current.map(row=>row.id===link.id
        ? {...row,status:"revoked" as const}:row));
      setMessage("Go Link revoked.");
    }catch(error){setError(problem(error));}
    finally{setBusy(false);}
  }
  async function retire(){
    if(!record||busy||record.status==="retired")return;
    if(!window.confirm("Retire this engagement? All of its Go Links will stop resolving."))return;
    setBusy(true);setError("");setMessage("");
    try{
      await retireEngagementDefinition({data:{engagementId:record.engagementId}});
      setRecords(rows=>rows.map(row=>row.engagementId===record.engagementId
        ? {...row,status:"retired" as const}:row));
      setMessage("Engagement retired. Existing links cannot be used.");
    }catch(error){setError(problem(error));}
    finally{setBusy(false);}
  }
  return <WorkspacePanel
    title="Published engagement library"
    description="Saved invitations and links remain manageable after you leave this page. Each published engagement is an immutable version.">
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy}
        onClick={()=>setRefresh(n=>n+1)}>Refresh</Button>
    </div>
    {loading&&<p role="status" className="mt-4 text-sm">Loading published engagements…</p>}
    {!loading&&!records.length&&
      <p className="mt-4 text-sm text-muted-foreground">No published experiences in this workspace yet.</p>}
    {!loading&&records.length>0&&<>
      <div className="mt-4 grid gap-1">
        <Label htmlFor="saved-go-engagement">Published experience</Label>
        <Select id="saved-go-engagement" disabled={busy} value={selected??""} onChange={event=>{
          setSelected(event.target.value);setLinks([]);setLinksFor(null);setLinksLoading(true);setDistribution(null);setError("");setMessage("");
        }}>
          {records.map(row=><option key={row.engagementId} value={row.engagementId}>
            {row.headline} (v{row.version}, {row.status})
          </option>)}
        </Select>
      </div>
      {record&&<>
        <div className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium">{record.domain}</span> · {record.mode==="page"?"Rendered experience":"Direct destination"} · {record.status}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Channel">
          <Select value={channel} onChange={event=>setChannel(event.target.value as EngagementChannel)}>
              {engagementChannels.map(id=><option value={id} key={id}>{engagementChannelLabels[id]}</option>)}
            </Select>
        </Field>
          <Button type="button" disabled={busy||record.status!=="active"} onClick={()=>void createLink()}>
            {busy?"Working…":"Create another Go Link"}
          </Button>
          <Button type="button" variant="outline" disabled={busy||record.status==="retired"}
            onClick={()=>void retire()}>Retire engagement</Button>
        </div>
      </>}
      {linksLoading&&<p className="mt-4 text-sm" role="status">Loading saved links…</p>}
      {!linksLoading&&selected!==null&&linksFor===selected&&<div className="mt-4 grid gap-2">
        {!links.length&&<p className="text-sm text-muted-foreground">No Go Links issued for this engagement.</p>}
        {links.map(link=><div key={link.id} className="flex flex-wrap justify-between gap-2 border p-3">
          <div className="min-w-0">
            <p className="font-mono text-sm select-all">/go/{link.code}</p>
            <p className="text-xs text-muted-foreground">
              {link.channel??"Unspecified channel"} · {record?.status==="retired"?"Engagement retired":link.status}
            </p>
            {link.evidence?<p className="mt-1 text-xs text-muted-foreground">{link.evidence.redirects30d} observed requests · {link.evidence.registrationEvidence==="referenced_noncredit_claim"?`${link.evidence.referralRegistrations30d??0} matching registration claims`:"Outcome not connected"} (30 days; not unique people or causal conversions)</p>:<p className="mt-1 text-xs text-muted-foreground">Outcome evidence unavailable.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {link.status==="active"&&record?.status==="active"&&<GoLinkActions code={link.code} status="active"
              busy={busy} allowPause={false} onChange={action=>{if(action==="revoke")void revoke(link);}}/>
            {link.channel==="email"&&link.status==="active"&&record?.status==="active"&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>setDistribution(link.id)}>Prepare email</Button>}
}
          </div>
        </div>)}
      </div>}
      {distribution&&!linksLoading&&linksFor===selected&&record?.status==="active"&&links.some(link=>link.id===distribution&&link.status==="active")&&<EngagementEmailDistribution key={distribution} engagementId={record.engagementId} linkId={distribution} onClose={()=>setDistribution(null)}/>}
    </>}
    {siteId&&!ownerSurface&&<SiteCampaignEvidencePanel key={siteId} siteId={siteId}/>}
    {error&&<p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {message&&<p role="status" className="mt-4 text-sm">{message}</p>}
  </WorkspacePanel>;
}
