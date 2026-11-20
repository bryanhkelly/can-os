import { Archive, Copy, FileText, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { marketingPurposeOptions } from "@/domain/marketing-package-v61";
import type { listSiteMarketingPackagesV61 } from "@/modules/programs/site-marketing-packages-v61.functions";

export type MarketingPackageRecord = Awaited<ReturnType<typeof listSiteMarketingPackagesV61>>[number];

/** One presentation contract for Promote, Recruit Families, and Interest Events.
 * The parent manages revisions, commands, and independently governed releases.
 */
export function MarketingPackageLibraryList({
  records, busy, onOpen, onDuplicate, onArchiveToggle, onDelete,
}: {
  records: readonly MarketingPackageRecord[];
  busy: boolean;
  onOpen: (record: MarketingPackageRecord) => void;
  onDuplicate: (record: MarketingPackageRecord) => void | Promise<void>;
  onArchiveToggle: (record: MarketingPackageRecord) => void | Promise<void>;
  onDelete: (record: MarketingPackageRecord) => void;
}) {
  return <div className="space-y-3">{records.map(item=><article key={item.id}
          className="flex flex-wrap items-center gap-4 border bg-card p-4">
          <div className="flex size-11 items-center justify-center bg-muted"><FileText className="size-5"/></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">{item.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {marketingPurposeOptions.find(option=>option.id===item.content.purpose)?.label}
              {" · "}{item.status==="archived"?"Archived":"Saved draft"}
              {" · "}{new Date(item.updatedAt).toLocaleDateString()}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={()=>onOpen(item)}>Open</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={()=>void onDuplicate(item)}
            aria-label={"Duplicate "+item.title}><Copy aria-hidden="true"/></Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={()=>void onArchiveToggle(item)}
            aria-label={(item.status==="archived"?"Restore ":"Archive ")+item.title}>
            {item.status==="archived"?<RotateCcw aria-hidden="true"/>:<Archive aria-hidden="true"/>}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={()=>onDelete(item)}
            aria-label={"Delete "+item.title}><Trash2 aria-hidden="true"/></Button>
        </article>)}</div>;
}
