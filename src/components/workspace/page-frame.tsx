import * as React from "react";

import { cn } from "@/lib/utils";

export type PageWidth = "reading" | "standard" | "wide";

/**
 * The only element that may render a workspace `<main>`. It applies the shell
 * gutter and left-aligns content so every page title starts at the same x.
 */
export function PageFrame({ width = "standard", className, frameClassName, children, ...props }:
  React.ComponentProps<"main"> & { width?: PageWidth; frameClassName?: string }) {
  return <main {...props} className={cn("can-page", className)}>
    <div data-width={width} className={cn("can-page-frame", frameClassName)}>{children}</div>
  </main>;
}

/** Small uppercase section label above a page or record title. Brand lives in the shell, not here. */
export function PageEyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return <p {...props} className={cn("can-eyebrow", className)} />;
}

export function PageTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return <h1 {...props} className={cn("can-page-title", className)} />;
}

export function PageHeader({ eyebrow, title, titleId, subtitle, actions, breadcrumbs, className, children }: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  titleId?: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return <>
    {breadcrumbs && <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{breadcrumbs}</nav>}
    <header className={cn("can-workspace-header border-b border-border/60", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <PageEyebrow>{eyebrow}</PageEyebrow>}
          <PageTitle id={titleId} className="mt-2">{title}</PageTitle>
          {subtitle && <div className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{subtitle}</div>}
        </div>
        {actions}
      </div>
      {children}
    </header>
  </>;
}
