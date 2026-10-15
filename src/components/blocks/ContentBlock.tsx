import type { ReactNode } from "react";

interface ContentBlockProps {
  header?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

interface BlockHeaderProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  titleClassName?: string;
}

interface MetricTileProps {
  label: string;
  value: ReactNode;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
}

export function ContentBlock({
  header,
  children,
  className = "",
  bodyClassName = "p-6",
}: ContentBlockProps) {
  return (
    <section className={"bg-card rounded-xl ring-hairline shadow-sm overflow-hidden " + className}>
      {header ? <div className="px-5 py-4 border-b border-border">{header}</div> : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function BlockHeader({
  title,
  subtitle,
  right,
  titleClassName = "font-serif text-[20px] tracking-tight",
}: BlockHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className={titleClassName}>{title}</h2>
        {subtitle ? <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  className = "",
  labelClassName = "",
  valueClassName = "",
}: MetricTileProps) {
  return (
    <div className={"p-3 rounded-md bg-accent/40 " + className}>
      <p className={"text-[9px] uppercase tracking-widest text-muted-foreground " + labelClassName}>
        {label}
      </p>
      <p
        className={
          "min-h-4 text-[13px] font-medium leading-tight mt-1 break-words " + valueClassName
        }
      >
        {value}
      </p>
    </div>
  );
}
