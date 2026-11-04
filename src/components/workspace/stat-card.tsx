import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

type StatCardContent = {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
};

export type StatCardProps = StatCardContent & (
  | { asChild: true; children: React.ReactElement<{ children?: React.ReactNode }> }
  | { asChild?: false; children?: never }
);

function StatCard({ label, value, hint, asChild = false, children, className }: StatCardProps) {
  const Comp = asChild ? Slot : "div";
  const content = <>
    <span className="block font-sans text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
    <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
    {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
  </>;
  return (
    <Comp className={cn(
      "block border border-border bg-card p-5",
      asChild && "transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      className,
    )}>
      {asChild && children ? React.cloneElement(children, {}, content) : content}
    </Comp>
  );
}

export { StatCard };
