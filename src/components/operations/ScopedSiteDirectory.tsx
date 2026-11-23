import type {ReactNode} from "react";
import {Link} from "@tanstack/react-router";
import { validFriendlySlug } from "@/domain/friendly-site-urls";
import { CopyLinkButton } from "@/components/links/CopyLinkButton";

/**
 * Scope-neutral Site directory presentation. Its callers supply only Sites
 * returned by their own authorized readers. A network affiliation is NOT a
 * Site management grant, so links are opt-in rather than inferred from role.
 */
export type DirectorySite = {
  id:string;name:string;timezone:string;
  organizationName?:string|null;slug?:string|null;organizationSlug?:string|null;
};
export function ScopedSiteDirectory({sites,emptyMessage,profileLinks=false}:{
  sites:readonly DirectorySite[];
  emptyMessage:string;
  /** Only enable after the caller's source has verified Site profile access. */
  profileLinks?:boolean;
}):ReactNode {
  return <div className="grid gap-3 sm:grid-cols-2">
    {sites.map(site=><article key={site.id} className="min-w-0 border border-border bg-card p-5">
      <h3 className="font-semibold">
        {profileLinks
          ?(site.organizationSlug && site.slug && validFriendlySlug(site.organizationSlug) && validFriendlySlug(site.slug)
            ? <Link className="text-primary underline underline-offset-4" to="/o/$organizationSlug/$siteSlug/profile"
                params={{organizationSlug:site.organizationSlug, siteSlug:site.slug}}>{site.name}</Link>
            : <Link className="text-primary underline underline-offset-4" to="/sites/$siteId/profile"
                params={{siteId:site.id}}>{site.name}</Link>)
          :site.name}
      </h3>
      {site.organizationName&&<p className="mt-2 text-sm text-muted-foreground">{site.organizationName}</p>}
      {site.slug&&<p className="mt-2 text-xs text-muted-foreground">{site.slug}</p>}
      <p className="mt-2 text-xs text-muted-foreground">Time zone: {site.timezone}</p>
      {profileLinks && <CopyLinkButton className="mt-3" label="Copy profile link"
        destination={{kind:"site-profile",siteId:site.id,
          identity: site.organizationSlug && site.slug && validFriendlySlug(site.organizationSlug) &&
            validFriendlySlug(site.slug) ? {
              organizationSlug:site.organizationSlug,siteSlug:site.slug,
            } : undefined,
        }} />}
    </article>)}
    {!sites.length&&<p className="border border-border bg-card p-5 text-sm text-muted-foreground">{emptyMessage}</p>}
  </div>;
}
