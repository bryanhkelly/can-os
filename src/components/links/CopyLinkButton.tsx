import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { absoluteDestinationUrl, buildUrlDestination, type UrlDestination } from "@/domain/url-destinations";

type CopyState = "idle" | "copied" | "unavailable";

/** One accessible copy interaction for governed, typed URL destinations.
 * No generic input that could inadvertently share private preview tokens. */
export function CopyLinkButton({ destination, label = "Copy link", className }: {
  destination: UrlDestination; label?: string; className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const resolved = buildUrlDestination(destination);
  const [fallback, setFallback] = useState("");
  async function copy() {
    const url = absoluteDestinationUrl(resolved, window.location.origin);
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
    {state === "unavailable" && <div className="mt-2 max-w-sm">
      <p role="alert" className="text-xs text-muted-foreground">Select and copy this URL manually.</p>
      <Input aria-label="Link to copy manually" readOnly value={fallback}
        onFocus={event => event.currentTarget.select()} className="mt-1 w-full" />
    </div>}
  </div>;
}
