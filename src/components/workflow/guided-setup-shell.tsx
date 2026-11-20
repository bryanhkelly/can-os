import { useId, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface GuidedSetupStep {
  id: string;
  title: string;
  description?: string;
  status: "complete" | "current" | "upcoming";
}

/** Shared V6.1 internal-step presentation. A passive progress list does not
 * imply steps are saved or let callers bypass their validation. */
export function GuidedSetupProgress({ steps, onStepChange, navigationDisabled = false, label = "Setup progress" }: {
  steps: readonly GuidedSetupStep[];
  onStepChange?: (id: string) => void;
  navigationDisabled?: boolean;
  label?: string;
}) {
  return <ol aria-label={label} className={cn("grid gap-2 border-b bg-muted/25 p-4",
      steps.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
      steps.length === 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" :
      steps.length === 4 ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" :
      "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5")}>
      {steps.map((step, index) => {
        const item = <>
          <span aria-hidden="true" className={cn("flex size-7 shrink-0 items-center justify-center border text-xs font-semibold",
            step.status === "complete" && "border-success/50 bg-success/10",
            step.status === "current" && "border-primary bg-primary text-primary-foreground",
            step.status === "upcoming" && "bg-card text-muted-foreground")}>
            {step.status === "complete" ? <Check className="size-4" /> : index + 1}
          </span>
          <span className="min-w-0">
            <span className="block break-words text-sm font-medium">{step.title}</span>
            {step.description && <span className="mt-0.5 hidden text-xs leading-5 text-muted-foreground sm:block">{step.description}</span>}
            <span className="sr-only">{step.status === "complete" ? "Complete" : step.status === "current" ? "Current step" : "Not started"}</span>
          </span>
        </>;
        const itemClass = cn("flex h-full min-h-11 min-w-0 items-start gap-2 border p-3 text-left",
          step.status === "current" ? "border-primary/40 bg-accent" : "border-transparent");
        return <li key={step.id} className="min-w-0">
          {onStepChange ? <Button type="button" variant="ghost"
            className={cn(itemClass, "h-full w-full shrink justify-start whitespace-normal hover:border-primary/40")}
            aria-current={step.status === "current" ? "step" : undefined}
            disabled={navigationDisabled}
            onClick={() => onStepChange(step.id)}>{item}</Button> :
            <div className={itemClass} aria-current={step.status === "current" ? "step" : undefined}>{item}</div>}
        </li>;
      })}
    </ol>;
}

export function GuidedSetupShell({ title, description, steps, aside, children, onStepChange, navigationDisabled = false, progressLabel }: {
  title: string;
  description?: string;
  steps: readonly GuidedSetupStep[];
  aside?: ReactNode;
  /** Optional local step navigation; does not imply saved or complete. */
  onStepChange?: (id: string) => void;
  /** Lock internal navigation while an owning workflow commits or reconciles a save. */
  navigationDisabled?: boolean;
  progressLabel?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return <section aria-labelledby={titleId} className="border border-border bg-card shadow-sm">
    <header className="border-b px-5 py-5 sm:px-6">
      <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
    </header>
    <GuidedSetupProgress steps={steps} onStepChange={onStepChange} navigationDisabled={navigationDisabled} label={progressLabel} />
    <div className={cn("grid gap-6 p-5 sm:p-6", aside && "lg:grid-cols-[minmax(0,1fr)_18rem]")}>
      <div className="min-w-0">{children}</div>
      {aside && <aside aria-label="Setup guidance" className="min-w-0 lg:border-l lg:pl-6">{aside}</aside>}
    </div>
  </section>;
}
