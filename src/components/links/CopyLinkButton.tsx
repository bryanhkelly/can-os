import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { absoluteDestinationUrl, buildUrlDestination, type UrlDestination } from "@/domain/url-destinations";
import { getCanonicalGoLinkShareOrigin } from "@/modules/engagement/go-link-share-origin.functions";

type CopyState = "idle" | "copied" | "unavailable" | "blocked";

let sharedApprovedOrigin:Promise<string>|null=null;
function loadApprovedOrigin(){
  // One validated public origin for all copied Go Links on this page.
  if(!sharedApprovedOrigin)
    sharedApprovedOrigin=getCanonicalGoLinkShareOrigin().catch(error=>{
      sharedApprovedOrigin=null;
      throw error;
    });
  return sharedApprovedOrigin;
}

/** One accessible copy interaction for governed, typed URL destinations.
 * No generic input that could inadvertently share private preview tokens. */
export function CopyLinkButton({ destination, label = "Copy link", className }: {
  destination: UrlDestination; label?: string; className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const resolved = buildUrlDestination(destination);
  const [fallback, setFallback] = useState("");
  const [goOrigin,setGoOrigin]=useState<string|null>(null);
  useEffect(()=>{
    if(destination.kind!=="go")return;
    let live=true;
    loadApprovedOrigin().then(value=>{if(live)setGoOrigin(value);})
      .catch(()=>{if(live)setState("blocked");});
    return ()=>{live=false;};
  },[destination.kind]);
  async function copy() {
    let url: string;
    try {
      // Do not await a network request between the user's click and the
      // Clipboard API: browsers may expire the user-activation gesture.
      const origin=destination.kind==="go"?goOrigin:window.location.origin;
      if(!origin)throw new Error("Approved public origin is not available");
      url=absoluteDestinationUrl(resolved,origin);
    }catch{
      setFallback("");
      setState("blocked");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setFallback("");
      setState("copied");
    } catch {
      setFallback(url);
      setState("unavailable");
    }
  }
  return <div className={className}>
    <Button type="button" size="sm" variant="outline"
      disabled={destination.kind==="go"&&!goOrigin} onClick={() => void copy()}>
      {state === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {state === "copied" ? "Copied" : label}
    </Button>
    {state === "copied" && <span className="ml-2 text-xs text-muted-foreground" role="status">
      {resolved.requiresSignIn ? "Private link copied. Sign-in required." : "Link copied."}
    </span>}
    {state === "blocked" && <p role="alert" className="mt-2 text-xs text-destructive">
      Cannot copy a public Go Link until the approved application origin is configured.
    </p>}
    {state === "unavailable" && <div className="mt-2 max-w-sm">
      <p role="alert" className="text-xs text-muted-foreground">Select and copy this URL manually.</p>
      <Input aria-label="Link to copy manually" readOnly value={fallback}
        onFocus={event => event.currentTarget.select()} className="mt-1 w-full" />
    </div>}
  </div>;
}
