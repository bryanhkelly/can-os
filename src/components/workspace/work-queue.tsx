import type {ReactNode} from "react";
import {EmptyState} from "./empty-state";
import {StatusBadge} from "./workspace-panel";
import {QueryState} from "./query-state";

export interface WorkQueueItem {
  id:string; category:string; title:string; detail?:ReactNode;
  priority:"critical"|"high"|"normal";
  responsibility?:ReactNode; actions?:ReactNode; context?:ReactNode;
}
/** Ordered, authorized records supplied by the owner. No inferred urgency,
 * approval authority, cross-tenant aggregation or workflow writes. */
export function WorkQueue({items,title="What needs my attention",description,
  empty="No work items in this view.",loading,error,onRetry,toolbar,limited=false}:{
  items:readonly WorkQueueItem[];title?:string;description?:string;empty?:string;
  loading?:string;error?:string;onRetry?:()=>void;toolbar?:ReactNode;limited?:boolean;
}){
  return <section aria-label={title} className="mt-8 min-w-0">
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div className="min-w-0"><h2 className="font-serif text-2xl">{title}</h2>
        {description&&<p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>
      {!loading&&!error&&items.length>0&&<StatusBadge>{items.length} {limited?"shown":"open"}</StatusBadge>}
    </div>
    {toolbar&&<div className="mt-4">{toolbar}</div>}
    <QueryState loading={loading} error={error} onRetry={onRetry} isEmpty={!items.length}
      empty={<EmptyState className="mt-4" title={empty}/>}>
      <ul className="mt-4 space-y-3">{items.map(item=><li key={item.id} className="border bg-card p-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.category}</p>
            <h3 className="mt-1 font-semibold [overflow-wrap:anywhere]">{item.title}</h3></div>
          {item.priority!=="normal"&&<StatusBadge tone={item.priority==="critical"?"danger":"attention"}>{item.priority}</StatusBadge>}
        </div>
        {item.detail&&<div className="mt-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">{item.detail}</div>}
        {item.context&&<div className="mt-3">{item.context}</div>}
        {(item.responsibility||item.actions)&&<div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          {item.responsibility&&<div className="min-w-0 [overflow-wrap:anywhere]">{item.responsibility}</div>}
          {item.actions&&<div className="flex min-w-0 flex-wrap gap-3 font-semibold text-foreground">{item.actions}</div>}
        </div>}
      </li>)}</ul>
    </QueryState>
  </section>;
}
