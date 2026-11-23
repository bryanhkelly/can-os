import { useState } from "react";
import { Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { CopyLinkButton } from "@/components/links/CopyLinkButton";
import { buildUrlDestination, type UrlDestination } from "@/domain/url-destinations";
import type { FriendlySiteIdentity } from "@/domain/friendly-site-urls";

/** Copying private navigation never publishes a Site or creates a bearer token.
 * Public website URLs are offered ONLY when the server read says published. */
export function SiteLinkSharing({ siteId, identity, publishedHost }: {
  siteId: string; identity?: FriendlySiteIdentity; publishedHost?: string;
}) {
  const [open, setOpen] = useState(false);
  const workspace: UrlDestination = {kind:"site-workspace",siteId,identity};
  const website: UrlDestination | null = publishedHost
    ? {kind:"published-site",host:publishedHost} : null;
  const shareJourney = buildUrlDestination({kind:"site-launch",siteId,identity,module:"create-outreach"});
  return <>
    <Button type="button" variant="ghost" size="sm" className="min-h-11 gap-2"
      onClick={() => setOpen(true)}>
      <Share2 aria-hidden="true" /> Copy &amp; share
    </Button>
    <Modal open={open} onClose={() => setOpen(false)} label="Copy and share Site links">
      <div className="flex items-center justify-between border-b p-5">
        <h2 className="font-serif text-xl">Copy &amp; share</h2>
        <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)}
          aria-label="Close sharing"><X aria-hidden="true" /></Button>
      </div>
      <div className="space-y-4 p-5">
        <section className="border p-4">
          <h3 className="font-semibold">Private Site workspace</h3>
          <p className="mt-1 text-sm text-muted-foreground">Only authorized team members can open this link. Sign-in is required.</p>
          <p className="mt-2 break-all font-mono text-xs">{buildUrlDestination(workspace).href}</p>
          <CopyLinkButton className="mt-3" destination={workspace}/>
        </section>
        <section className="border p-4">
          <h3 className="font-semibold">Published Site website</h3>
          {website ? <>
            <p className="mt-1 text-sm text-muted-foreground">Public website visitors do not need an account.</p>
            <p className="mt-2 break-all font-mono text-xs">{buildUrlDestination(website).href}</p>
            <CopyLinkButton className="mt-3" destination={website}/>
          </> : <p className="mt-1 text-sm text-muted-foreground">
            Not available until this Site website is officially published.
          </p>}
        </section>
        <section className="border p-4">
          <h3 className="font-semibold">Revocable outreach / Go link</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Use a saved outreach plan to create a short, revocable /go/ link for families,
            participants or partners. It grants navigation only, not enrollment or membership.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <a href={shareJourney.href}>Manage Go links in Introduce</a>
          </Button>
        </section>
        <p className="text-xs text-muted-foreground">
          Sharing a private website preview uses the separate Share preview control.
          A private editor URL is never a public preview link.
        </p>
      </div>
    </Modal>
  </>;
}
