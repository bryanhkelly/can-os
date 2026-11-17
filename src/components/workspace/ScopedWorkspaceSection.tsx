import type {ReactNode} from "react";

/**
 * Shared, scope-aware workspace structure. The calling server-backed route
 * chooses the authorized records and permitted actions; this component
 * deliberately cannot infer grants, Site memberships, or cross-network access.
 */
export function ScopedWorkspaceSection({
  id,title,scopeDescription,actions,children,
}:{
  id?:string;
  title:string;
  scopeDescription:string;
  actions?:ReactNode;
  children:ReactNode;
}){
  return <section id={id} aria-label={title} className="border border-border bg-card p-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-serif text-2xl">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{scopeDescription}</p>
      </div>
      {actions&&<div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
    <div className="mt-4">{children}</div>
  </section>;
}
