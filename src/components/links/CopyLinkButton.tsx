import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { absoluteDestinationUrl, buildUrlDestination, type UrlDestination } from "@/domain/url-destinations";
import { getCanonicalGoLinkShareOrigin } from "@/modules/engagement/go-link-share-origin.functions";

type CopyState = "idle" | "copied" | "unavailable" | "blocked";

/** One accessible copy interaction for governed, typed URL destinations.
 * No generic input that could inadvertently share private preview tokens. */
export function CopyLinkButton({ destination, label = "Copy link", className }: {
  destination: UrlDestination; label?: string; className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const resolved = buildUrlDestination(destination);
  const [fallback, setFallback] = useState("");
  async function copy() {
    let url: string;
    try {
      // Printed /go/ links must never accidentally capture a staging,
      // preview or transient localhost domain.
      const origin = destination.kind === "go"
        ? await getCanonicalGoLinkShareOrigin()
        : window.location.origin;
      url = absoluteDestinationUrl(resolved, origin);
    } catch {
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
    <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
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
