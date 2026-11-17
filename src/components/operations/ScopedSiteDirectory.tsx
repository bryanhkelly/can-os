import type {ReactNode} from "react";
import {Link} from "@tanstack/react-router";

/**
 * Scope-neutral Site directory presentation. Its callers supply only Sites
 * returned by their own authorized readers. A network affiliation is NOT a
 * Site management grant, so links are opt-in rather than inferred from role.
 */
export type DirectorySite = {
  id:string;name:string;timezone:string;
  organizationName?:string|null;slug?:string|null;
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
          ?<Link className="text-primary underline underline-offset-4" to="/sites/$siteId/profile"
             params={{siteId:site.id}}>{site.name}</Link>
          :site.name}
      </h3>
      {site.organizationName&&<p className="mt-2 text-sm text-muted-foreground">{site.organizationName}</p>}
      {site.slug&&<p className="mt-2 text-xs text-muted-foreground">{site.slug}</p>}
      <p className="mt-2 text-xs text-muted-foreground">Time zone: {site.timezone}</p>
    </article>)}
    {!sites.length&&<p className="border border-border bg-card p-5 text-sm text-muted-foreground">{emptyMessage}</p>}
  </div>;
}
