import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, CircleHelp, Landmark, ShieldCheck } from "lucide-react";
import { PageFrame, PageHeader } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LaunchStudioStep = { id: string; title: string; complete?: boolean; disabled?: boolean };
export type LaunchStudioProgress = { complete: number; total: number };

export function LaunchStudioStepContent({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return <div hidden={!active}>{visited || active ? children : null}</div>;
}

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
  progress, progressLabel = "School requirements", help, children, actions, exit, notice, saveAction, status }: {
  role: string; subject: string; title: ReactNode; description?: ReactNode;
  steps: readonly LaunchStudioStep[]; currentId: string; onStepChange: (id: string) => void;
  progress?: LaunchStudioProgress; progressLabel?: string; help?: ReactNode;
  children: ReactNode; actions?: ReactNode; exit?: ReactNode; notice?: ReactNode; saveAction?: ReactNode; status?: ReactNode;
}) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const index = steps.findIndex(step => step.id === currentId);
  const percent = progress && progress.total > 0 ? Math.floor(progress.complete / progress.total * 100) : null;
  return <PageFrame width="wide" className="launch-studio-page launch-journey-form">
    <div className="grid items-start gap-6 xl:grid-cols-[14rem_minmax(0,1fr)_16rem]">
      <aside className="border bg-card p-5 xl:sticky xl:top-6" aria-label="Journey navigation">
        <h2 className="hidden font-serif text-2xl xl:block">{subject}</h2>
        <p className="mt-2 hidden text-sm text-muted-foreground xl:block">{role}</p>
        <p className="mt-4 hidden text-xs leading-5 text-muted-foreground xl:block">Your saved information stays with this journey. Visiting a step does not complete it.</p>
        <Button variant="outline" className="w-full justify-between xl:hidden" aria-expanded={navigationOpen}
          aria-controls="launch-step-navigation" onClick={() => setNavigationOpen(value => !value)}>
          Step {index + 1} of {steps.length}: {steps[index]?.title} <span>{navigationOpen ? "Close" : "View steps"}</span>
        </Button>
        <nav id="launch-step-navigation" className={cn("mt-5 border-t pt-4 xl:block", !navigationOpen && "hidden")} aria-label="Launch steps">
          <ol className="grid gap-1 sm:grid-cols-2 xl:grid-cols-1">
            {steps.map((step, position) => <li key={step.id}>
              <button type="button" disabled={step.disabled} onClick={() => { onStepChange(step.id); setNavigationOpen(false); }}
                aria-current={step.id === currentId ? "step" : undefined}
                className={cn("flex min-h-11 w-full items-center gap-3 border-l-2 border-transparent px-2 py-3 text-left text-xs",
                  step.id === currentId && "border-primary bg-accent font-semibold",
                  step.disabled && "cursor-not-allowed opacity-50")}>
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
        <p className="mt-8 hidden items-center gap-2 text-xs text-muted-foreground xl:flex"><ShieldCheck className="size-4 shrink-0" /> Private, secure setup</p>
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
          <p className="mt-3 text-xs leading-5">Progress reflects saved school requirements, not pages visited. Completion is not approval.</p>
        </section>
        <section className="border bg-card p-5">
          <h2 className="font-serif text-2xl">Saved work &amp; next steps</h2>
          <div className="mt-4 space-y-3 text-sm">{status ?? <p className="text-muted-foreground">Save draft keeps your entries for later. Continue only moves to the next page; submit actions send information for review.</p>}</div>
          {saveAction && <div className="mt-4">{saveAction}</div>}
        </section>
        <section id="launch-help" tabIndex={-1} className="scroll-mt-6 border bg-card p-5 sm:col-span-2 xl:col-span-1">
          <h2 className="font-serif text-2xl">Need a hand?</h2>
          <div className="mt-3 text-sm leading-6 text-muted-foreground">{help ?? "Ask your school administrator about access or requested information. Save your work before leaving setup."}</div>
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
