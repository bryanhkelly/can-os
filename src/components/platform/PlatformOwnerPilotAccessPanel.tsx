import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import { normalizeClientError } from "@/lib/client-error";
import { searchPlatformOwnerTargets } from "@/modules/identity/platform-owner-delegation.functions";
import { getPlatformOwnerPilotLocations, grantPlatformOwnerPilotRole, revokePlatformOwnerPilotRole } from "@/modules/identity/platform-owner-pilot-access.functions";
import { ownerGrantRequiresSite, ownerPilotRoles } from "@/domain/platform-owner-pilot-roles";

type Target = Awaited<ReturnType<typeof searchPlatformOwnerTargets>>["targets"][number];

/** Pilot roles are explicitly scoped to verified accounts and active Organizations.
 * Issuing a role does not appoint a professional reviewer to a Course.
 */
export function PlatformOwnerPilotAccessPanel() {
  const locations=useQuery({queryKey:["platform-owner-pilot-locations"],
    queryFn:()=>getPlatformOwnerPilotLocations(),retry:false});
  const [query,setQuery]=useState("");
  const [targets,setTargets]=useState<Target[]>([]);
  const [targetAccount,setTargetAccount]=useState("");
  const [orgId,setOrgId]=useState("");
  const [siteId,setSiteId]=useState("");
  const [role,setRole]=useState<(typeof ownerPilotRoles)[number]>("academic_content_creator");
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [searched,setSearched]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const accounts=useMemo(()=>targets.filter((target,i,arr)=>
    arr.findIndex(row=>row.accountId===target.accountId)===i),[targets]);
  const orgs=locations.data?.organizations.filter(org=>org.lifecycleStatus==="active")??[];
  const locationSites=locations.data?.sites.filter(site=>site.organizationId===orgId)??[];
  const needsSite=ownerGrantRequiresSite(role);
  const existingGrant=targets.find(item=>item.accountId===targetAccount&&
    item.role===role&&item.organizationId===orgId&&
    item.siteId===(needsSite?siteId:null));
  async function search() {
    if(busy||query.trim().length<2)return;
    setBusy(true);setError("");setNotice("");setSearched(true);setTargetAccount("");
    try{
      const data=await searchPlatformOwnerTargets({data:{search:query.trim()}});
      setTargets(data.targets);
    }catch(cause){setError(normalizeClientError(cause,"Unable to search pilot members.").message);}
    finally{setBusy(false);}
  }
  async function grant(){
    if(!targetAccount||!orgId||(needsSite&&!siteId)||reason.trim().length<12||busy)return;
    setBusy(true);setNotice("");setError("");
    try{
      const out=await grantPlatformOwnerPilotRole({data:{
        accountId:targetAccount,organizationId:orgId,
        siteId:needsSite?siteId:null,role,reason:reason.trim(),
      }});
      if(out.created){
        const person=accounts.find(item=>item.accountId===targetAccount);
        if(person)setTargets(previous=>[...previous,{
          ...person,grantId:out.grantId,role,organizationId:orgId,siteId:needsSite?siteId:null,
        }]);
      }
      setNotice(out.created
        ?"Verified scoped pilot membership created and audited. Course appointments and approvals still require their own workflow."
        :"The same active scoped membership already exists. No duplicate was created.");
    }catch(cause){setError(normalizeClientError(cause,"Pilot role was not authorized.").message);}
    finally{setBusy(false);}
  }
  async function revoke(){
    if(!existingGrant||reason.trim().length<12||busy)return;
    if(!window.confirm("Revoke this person's selected pilot role? Their active session may immediately lose access."))return;
    setBusy(true);setNotice("");setError("");
    try{
      await revokePlatformOwnerPilotRole({data:{
        grantId:existingGrant.grantId,reason:reason.trim(),
      }});
      setTargets(previous=>previous.filter(item=>item.grantId!==existingGrant.grantId));
      setNotice("Scoped pilot membership revoked and audited.");
    }catch(cause){setError(normalizeClientError(cause,"Pilot role could not be revoked.").message);}
    finally{setBusy(false);}
  }
  return <WorkspacePanel title="Pilot access setup" className="mt-6"
    description="Assign a small set of verified staff roles now, without waiting for full-scale identity administration. Each grant is scoped, audited and separate from professional Course appointments.">
    <WorkspaceNotice tone="attention">
      A creator and an independent reviewer must be two different real people with their own verified accounts.
      This step never approves content, verifies training rights, issues a Course appointment or activates a public program.
    </WorkspaceNotice>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <div className="min-w-52 flex-1">
        <Label htmlFor="pilot-member-lookup" className="mb-2 block">Find an existing verified account</Label>
        <Input id="pilot-member-lookup" type="search" value={query} maxLength={100}
          onChange={e=>setQuery(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void search();}}}
          placeholder="Name or verified email"/>
      </div>
      <Button type="button" variant="outline" disabled={busy||query.trim().length<2}
        onClick={()=>void search()}>Find person</Button>
    </div>
    {searched&&<div className="mt-4">
      <Label htmlFor="pilot-person-select" className="mb-2 block">Person</Label>
      <Select id="pilot-person-select" value={targetAccount} onChange={e=>setTargetAccount(e.target.value)}>
        <option value="">Choose a verified person</option>
        {accounts.map(person=><option value={person.accountId} key={person.accountId}>
          {person.firstName} {person.lastName} ({person.email})
        </option>)}
      </Select>
      {!accounts.length&&<p className="mt-2 text-xs text-muted-foreground">
        No eligible matching account. A separate verified Person must exist before granting a real publisher role.
      </p>}
    </div>}
    {locations.isPending&&<p role="status" className="mt-3 text-sm">Reading authorized Organizations and Sites…</p>}
    {locations.isError&&<WorkspaceNotice tone="danger" className="mt-3">
      Organization and Site inventory is unavailable. No role can be provisioned.
    </WorkspaceNotice>}
    {locations.isSuccess&&<div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="pilot-role" className="mb-2 block">Pilot role</Label>
        <Select id="pilot-role" value={role} onChange={e=>{
          setRole(e.target.value as (typeof ownerPilotRoles)[number]);setSiteId("");
        }}>
          {ownerPilotRoles.map(option=><option key={option} value={option}>
            {option.replaceAll("_"," ")}
          </option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="pilot-organization" className="mb-2 block">Responsible Organization</Label>
        <Select id="pilot-organization" value={orgId} onChange={e=>{setOrgId(e.target.value);setSiteId("");}}>
          <option value="">Choose an active Organization</option>
          {orgs.map(org=><option key={org.id} value={org.id}>{org.name} ({org.type})</option>)}
        </Select>
      </div>
      {needsSite&&<div className="sm:col-span-2">
        <Label htmlFor="pilot-site" className="mb-2 block">Exact Site</Label>
        <Select id="pilot-site" value={siteId} onChange={e=>setSiteId(e.target.value)}>
          <option value="">Choose a Site in the Organization</option>
          {locationSites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}
        </Select>
      </div>}
      <div className="sm:col-span-2">
        <Label htmlFor="pilot-grant-reason" className="mb-2 block">Pilot authorization reason</Label>
        <Input id="pilot-grant-reason" value={reason} onChange={e=>setReason(e.target.value)}
          placeholder="e.g., Prepare the approved COGIC pilot review team" maxLength={500}/>
      </div>
      {(locations.data.organizationsLimited||locations.data.sitesLimited)&&
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Inventory is truncated. If the correct Site is missing, use the existing governed identity tools instead.
        </p>}
      <div className="sm:col-span-2">
        <Button type="button" disabled={busy||!targetAccount||!orgId||(needsSite&&!siteId)||reason.trim().length<12}
          onClick={()=>void grant()}>{busy?"Verifying and saving…":"Grant scoped pilot role"}</Button>
        {existingGrant&&<Button type="button" variant="outline" className="ml-2"
          disabled={busy||reason.trim().length<12}
          onClick={()=>void revoke()}>Revoke selected pilot role</Button>}
      </div>
    </div>}
    {notice&&<WorkspaceNotice className="mt-3">{notice}</WorkspaceNotice>}
    {error&&<WorkspaceNotice tone="danger" className="mt-3">{error}</WorkspaceNotice>}
  </WorkspacePanel>;
}
