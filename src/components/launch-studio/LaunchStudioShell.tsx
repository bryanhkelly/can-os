import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, CircleHelp, Landmark, ShieldCheck } from "lucide-react";
import { PageFrame, PageHeader } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LaunchStudioStep = { id: string; title: string; complete?: boolean };
export type LaunchStudioProgress = { complete: number; total: number };

export function LaunchStudioChrome({ children }: { children: ReactNode }) {
  return <div className="launch-studio min-h-screen bg-background">
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Link to="/launch" className="flex min-h-11 items-center gap-3 text-foreground">
          <span className="flex size-10 items-center justify-center bg-foreground text-background"><Landmark className="size-6" /></span>
          <span className="border-r pr-4 text-xs font-bold">CAN OS<span className="block text-3xs font-medium uppercase tracking-eyebrow">Launch Studio</span></span>
          <span className="font-serif text-2xl">Launch Studio</span>
        </Link>
        <Button asChild variant="ghost" size="sm"><a href="#launch-help"><CircleHelp className="size-4" /> Help</a></Button>
      </div>
    </header>
    {children}
    <footer className="mx-auto flex max-w-screen-2xl flex-wrap justify-between gap-3 px-4 py-8 text-xs text-muted-foreground sm:px-8">
      <span>Launch Studio</span><span>School records stay private. Access and approvals remain server-verified.</span>
    </footer>
  </div>;
}

export function LaunchStudioShell({ role, subject, title, description, steps, currentId, onStepChange,
  progress, progressLabel = "Recorded requirements", help, children, actions, exit, notice }: {
  role: string; subject: string; title: ReactNode; description?: ReactNode;
  steps: readonly LaunchStudioStep[]; currentId: string; onStepChange: (id: string) => void;
  progress?: LaunchStudioProgress; progressLabel?: string; help?: ReactNode;
  children: ReactNode; actions?: ReactNode; exit?: ReactNode; notice?: ReactNode;
}) {
  const index = steps.findIndex(step => step.id === currentId);
  const percent = progress && progress.total > 0 ? Math.floor(progress.complete / progress.total * 100) : null;
  return <PageFrame width="wide" className="launch-studio-page">
    <div className="grid items-start gap-6 xl:grid-cols-[14rem_minmax(0,1fr)_16rem]">
      <aside className="border bg-card p-5 xl:sticky xl:top-6" aria-label="Journey navigation">
        <h2 className="font-serif text-2xl">{subject}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{role}</p>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">Return to the same school records. Visiting a step does not complete it.</p>
        <nav className="mt-5 border-t pt-4" aria-label="Launch steps">
          <ol className="grid gap-1 sm:grid-cols-2 xl:grid-cols-1">
            {steps.map((step, position) => <li key={step.id}>
              <button type="button" onClick={() => onStepChange(step.id)}
                aria-current={step.id === currentId ? "step" : undefined}
                className={cn("flex min-h-11 w-full items-center gap-3 border-l-2 border-transparent px-2 py-3 text-left text-xs",
                  step.id === currentId && "border-primary bg-accent font-semibold")}>
                <span className={cn("flex size-7 shrink-0 items-center justify-center border text-xs",
                  step.complete && "border-success/30 bg-success/10 text-success",
                  step.id === currentId && !step.complete && "border-primary bg-primary text-primary-foreground")}>
                  {step.complete ? <Check className="size-4" aria-label="Recorded complete" /> : position + 1}
                </span>
                <span>{step.title}</span>
              </button>
            </li>)}
          </ol>
        </nav>
        <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0" /> Private, secure school setup</p>
      </aside>
      <div className="min-w-0">
        <PageHeader eyebrow={`Step ${index + 1} of ${steps.length} · ${role}`} title={title} subtitle={description} />
        {notice}
        <div className="mt-6 min-w-0 space-y-5">{children}</div>
        {actions && <nav aria-label="Step actions" className="mt-6 flex flex-wrap items-center justify-between gap-3">{actions}</nav>}
        {exit && <div className="mt-8 border-t pt-5 text-center text-sm">{exit}</div>}
      </div>
      <aside className="grid min-w-0 gap-4 sm:grid-cols-2 xl:sticky xl:top-6 xl:grid-cols-1" aria-label="Journey progress and help">
        <section className="bg-foreground p-5 text-background" aria-label={progressLabel}>
          <p className="text-xs">{subject}</p>
          {percent === null ? <p className="mt-3 font-serif text-2xl">Your next beginning</p> : <>
            <p className="mt-2 text-4xl font-semibold">{percent}%</p>
            <progress className="mt-4 h-2 w-full accent-primary" value={progress!.complete} max={progress!.total}
              aria-label={progressLabel} />
            <p className="mt-3 text-xs">{progress!.complete} of {progress!.total} {progressLabel.toLowerCase()} complete</p>
          </>}
          <p className="mt-3 text-xs leading-5">Only saved, source-verified progress is shown. Completion is not approval.</p>
        </section>
        <section className="border bg-card p-5">
          <h2 className="font-serif text-2xl">Your journey</h2>
          <ul className="mt-4 divide-y">{steps.filter(step => step.id !== "welcome").map(step => <li key={step.id} className="flex justify-between gap-3 py-3 text-xs">
            <span className="text-muted-foreground">{step.title}</span>
            <span className="shrink-0 font-semibold">{step.complete ? "Recorded" : step.id === currentId ? "Current" : "Not confirmed"}</span>
          </li>)}</ul>
        </section>
        <section id="launch-help" tabIndex={-1} className="scroll-mt-6 border bg-card p-5 sm:col-span-2 xl:col-span-1">
          <h2 className="font-serif text-2xl">Need a hand?</h2>
          <div className="mt-3 text-sm leading-6 text-muted-foreground">{help ?? "Contact your school administrator about required information or access. Keep this page open to preserve unsaved input."}</div>
        </section>
      </aside>
    </div>
  </PageFrame>;
}

export function JourneyWelcome({ summary, requirements, outcome, children }: {
  summary: string; requirements: readonly string[]; outcome: string; children?: ReactNode;
}) {
  return <section className="border bg-card p-6 sm:p-8">
    <p className="text-base leading-7">{summary}</p>
    <h2 className="mt-6 font-serif text-2xl">Before you begin</h2>
    <ul className="mt-4 space-y-3">{requirements.map(item => <li key={item} className="flex gap-3 text-sm leading-6">
      <ArrowRight className="mt-1 size-4 shrink-0 text-primary" /><span>{item}</span>
    </li>)}</ul>
    <div className="mt-6 border-t pt-5"><h3 className="font-semibold">What happens next</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{outcome}</p></div>
    {children}
  </section>;
}
