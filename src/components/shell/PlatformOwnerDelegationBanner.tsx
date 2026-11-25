import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceNotice } from "@/components/workspace";
import { endPlatformOwnerDelegation } from "@/modules/identity/platform-owner-delegation.functions";

/** Never dismiss this disclosure: users and screenshots must make
 * delegated actions distinguishable from a user's real login.
 */
export function PlatformOwnerDelegationBanner({ mode, expiresAt, targetLabel }: {
  mode: "view"|"act";
  expiresAt: string;
  targetLabel: string;
}) {
  const [leaving,setLeaving]=useState(false);
  const [error,setError]=useState("");
  async function exit(){
    if(leaving)return;
    setLeaving(true);setError("");
    try{
      await endPlatformOwnerDelegation({data:{confirm:true}});
      // Reload to clear any target Person, Site and query cache.
      window.location.replace("/platform");
    }catch{
      setError("Could not return to the Platform Owner. Sign out to end this session.");
      setLeaving(false);
    }
  }
  const expired=Date.parse(expiresAt)<=Date.now();
  return <WorkspaceNotice tone="attention" className="w-full">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm">
        <strong>Platform Owner delegation · {expired?"EXPIRED · RETURN REQUIRED":mode==="view"?"VIEW ONLY":"ACTING AS"}</strong>
        <p className="mt-1">
          {expired?"Delegation expired. Return to Platform Owner to resume writes.":`${targetLabel}. This is an owner-operated session, not a login by the selected user.`}
          All actions are attributed to the original Platform Owner.
          Expires {new Date(expiresAt).toLocaleTimeString()}.
        </p>
        {error&&<p role="alert" className="mt-2">{error}</p>}
      </div>
      <Button type="button" variant="outline" size="sm" disabled={leaving}
        onClick={()=>void exit()}>{leaving?"Returning…":"Return to Platform Owner"}</Button>
    </div>
  </WorkspaceNotice>;
}
