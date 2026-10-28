import { useId, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GuidedSetupStep {
  id: string;
  title: string;
  description?: string;
  status: "complete" | "current" | "upcoming";
}

export function GuidedSetupShell({ title, description, steps, aside, children }: {
  title: string;
  description?: string;
  steps: readonly GuidedSetupStep[];
  aside?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  return <section aria-labelledby={titleId} className="rounded-2xl border bg-card shadow-sm">
    <header className="border-b px-5 py-5 sm:px-6">
      <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
    </header>
    <ol aria-label="Setup progress" className="grid gap-2 border-b bg-muted/25 p-4 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => <li key={step.id} aria-current={step.status === "current" ? "step" : undefined}
        className={cn("flex min-w-0 items-start gap-3 rounded-xl border p-3",
          step.status === "current" ? "border-primary/40 bg-accent" : "border-transparent")}>
        <span aria-hidden="true" className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          step.status === "complete" && "border-success/50 bg-success/10",
          step.status === "current" && "border-primary bg-primary text-primary-foreground",
          step.status === "upcoming" && "bg-card text-muted-foreground")}>
          {step.status === "complete" ? <Check className="size-4" /> : index + 1}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">{step.title}</span>
          {step.description && <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{step.description}</span>}
          <span className="sr-only">{step.status === "complete" ? "Complete" : step.status === "current" ? "Current step" : "Not started"}</span>
        </span>
      </li>)}
    </ol>
    <div className={cn("grid gap-6 p-5 sm:p-6", aside && "lg:grid-cols-[minmax(0,1fr)_18rem]")}>
      <div className="min-w-0">{children}</div>
      {aside && <aside aria-label="Setup guidance" className="min-w-0 lg:border-l lg:pl-6">{aside}</aside>}
    </div>
  </section>;
}
