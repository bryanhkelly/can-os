import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import { normalizeClientError } from "@/lib/client-error";
import { getWorkspaceHome } from "@/components/shell/workspace-navigation.registry";
import {
  searchPlatformOwnerTargets, beginPlatformOwnerDelegation,
} from "@/modules/identity/platform-owner-delegation.functions";

type Target = Awaited<ReturnType<typeof searchPlatformOwnerTargets>>["targets"][number];

/** Owner-facing, explicit delegation to an existing verified Person's grant.
 * No auto-created identities and no browser-supplied roles, Person or Site IDs.
 */
export function PlatformOwnerDelegationPanel() {
  const [query,setQuery]=useState("");
  const [targets,setTargets]=useState<Target[]>([]);
  const [limited,setLimited]=useState(false);
  const [selected,setSelected]=useState("");
  const [mode,setMode]=useState<"view"|"act">("view");
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [searched,setSearched]=useState(false);
  async function search() {
    if(query.trim().length<2||busy)return;
    setBusy(true);setError("");
    try{
      const result=await searchPlatformOwnerTargets({data:{search:query.trim()}});
      setTargets(result.targets);setLimited(result.limited);setSelected("");setSearched(true);
    }catch(cause){setError(normalizeClientError(cause,"Could not verify the target accounts.").message);}
    finally{setBusy(false);}
  }
  async function start() {
    if(!selected||reason.trim().length<12||busy)return;
    setBusy(true);setError("");
    try{
      await beginPlatformOwnerDelegation({data:{grantId:selected,mode,reason:reason.trim()}});
      // Force a full document navigation to drop every previous user cache.
      window.location.replace(getWorkspaceHome(target!.role)??"/home");
    }catch(cause){setError(normalizeClientError(cause,"Delegation was not authorized.").message);setBusy(false);}
  }
  const target=targets.find(item=>item.grantId===selected);
  return <WorkspacePanel title="Platform Owner · View as / Act as"
    description="Inspect or temporarily work through an existing verified user's role and Site. The original Platform Owner remains identified in every audited action.">
    <WorkspaceNotice tone="attention">
      Delegation lasts at most 15 minutes. View as is read-only. Act as uses the selected existing permissions,
      not a bypass of independent reviews, safety decisions, consent, or publisher authorization.
      The selected user will never be told they personally performed your delegated actions.
    </WorkspaceNotice>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <div className="min-w-52 flex-1">
        <Label htmlFor="owner-target-search" className="mb-2 block">Find an existing account</Label>
        <Input id="owner-target-search" type="search" autoComplete="off" value={query}
          onChange={e=>setQuery(e.target.value)} placeholder="Name or verified email" maxLength={100}
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void search();}}}/>
      </div>
      <Button type="button" variant="outline" disabled={busy||query.trim().length<2}
        onClick={()=>void search()}>Find users</Button>
    </div>
    {searched&&<div className="mt-4 space-y-2" role="group" aria-label="Available verified user roles">
      {targets.length===0&&<p className="text-sm text-muted-foreground">No eligible verified accounts match this search.</p>}
      {targets.map(item=><Label key={item.grantId}
        className="flex cursor-pointer items-start gap-3 border border-border p-3 text-sm">
        <input type="radio" checked={selected===item.grantId}
          onChange={()=>setSelected(item.grantId)} name="owner-target-grant"
          className="mt-1 accent-primary"/>
        <span>
          <span className="block font-semibold">{item.firstName} {item.lastName} · {item.role.replaceAll("_"," ")}</span>
          <span className="block text-xs text-muted-foreground">{item.email}</span>
          <span className="block break-all text-xs text-muted-foreground">
            {item.siteId?"Site "+item.siteId:item.organizationId?"Organization "+item.organizationId:"Account-wide"}
          </span>
        </span>
      </Label>)}
      {limited&&<p className="text-xs text-muted-foreground">Showing the first 25 matches. Narrow the search for the exact user.</p>}
    </div>}
    {target&&<div className="mt-5 space-y-3 border-t border-border pt-4">
      <Label htmlFor="owner-delegation-mode" className="block">Delegation mode</Label>
      <Select id="owner-delegation-mode" value={mode}
        onChange={event=>setMode(event.target.value as "view"|"act")}>
        <option value="view">View as (read-only)</option>
        <option value="act">Act as (audited, role-scoped)</option>
      </Select>
      <Label htmlFor="owner-delegation-reason" className="block">Business reason or pilot ticket</Label>
      <Input id="owner-delegation-reason" value={reason} onChange={e=>setReason(e.target.value)}
        placeholder="Example: COGIC pilot acceptance walkthrough" minLength={12} maxLength={500}/>
      <p className="text-xs text-muted-foreground">
        Protected independent reviewer and platform-administrator roles are view-only.
        You can return to Platform Owner from the persistent banner.
      </p>
      <Button type="button" disabled={busy||reason.trim().length<12}
        onClick={()=>void start()}>{busy?"Verifying permissions…":mode==="view"?"Start View as":"Start Act as"}</Button>
    </div>}
    {error&&<WorkspaceNotice tone="danger" className="mt-4">{error}</WorkspaceNotice>}
  </WorkspacePanel>;
}
