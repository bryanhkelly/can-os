import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpenText, ShieldCheck } from "lucide-react";

export function EngagementChrome({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Link to="/landing" className="flex min-h-11 items-center gap-3 text-foreground">
          <span className="flex size-11 items-center justify-center bg-primary text-primary-foreground"><BookOpenText className="size-5"/></span>
          <span className="leading-tight">
            <strong className="block font-semibold">CAN Academy</strong>
            <span className="block text-xs text-muted-foreground">Explore what is possible</span>
          </span>
        </Link>
        <nav aria-label="Engagement navigation" className="flex items-center gap-4 text-xs sm:text-sm">
          <Link to="/landing" className="min-h-11 content-center font-semibold hover:underline">All pathways</Link>
          <a href="https://can-academy.netlify.app/" className="inline-flex min-h-11 items-center gap-1 font-semibold hover:underline">
            About CAN <ArrowRight className="size-3" aria-hidden="true"/>
          </a>
        </nav>
      </div>
    </header>
    {children}
    <footer className="mt-10 border-t border-border">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-start justify-between gap-6 px-5 py-8 text-xs leading-6 text-muted-foreground sm:px-8">
        <p>CAN Academy · Explore → Launch → Next Steps</p>
        <p className="flex max-w-xl items-start gap-2"><ShieldCheck className="mt-1 size-4 shrink-0"/>
          Exploration does not authorize a school, approve an application, hire staff, or create a partnership.</p>
      </div>
    </footer>
  </div>;
}
