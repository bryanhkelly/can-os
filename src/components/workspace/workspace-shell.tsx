import * as React from "react";

import { PageFrame, PageHeader, type PageWidth } from "./page-frame";

export interface WorkspaceShellProps {
  embedded?: boolean;
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  width?: PageWidth;
  rail?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

function WorkspaceShell({ embedded=false, title, eyebrow, subtitle, actions, breadcrumbs, width = "standard", rail, className, children }: WorkspaceShellProps) {
  const content = (
    <>
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} breadcrumbs={breadcrumbs} />
      {rail ? <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">{children}</div>
        <aside aria-label="Related context" className="space-y-4 pt-8 lg:sticky lg:top-6 lg:self-start">{rail}</aside>
      </div> : children}
    </>
  );
  return embedded ? <section className={className}>{content}</section> : <PageFrame width={width} className={className}>{content}</PageFrame>;
}

export { WorkspaceShell };
