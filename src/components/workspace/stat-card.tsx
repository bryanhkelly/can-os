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
    <span className="block font-serif text-3xl font-semibold tracking-tight">{value}</span>
    <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
    {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
  </>;
  return (
    <Comp className={cn(
      "block rounded-2xl border border-border/70 bg-card p-5 shadow-sm",
      asChild && "transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      className,
    )}>
      {asChild && children ? React.cloneElement(children, {}, content) : content}
    </Comp>
  );
}

export { StatCard };
