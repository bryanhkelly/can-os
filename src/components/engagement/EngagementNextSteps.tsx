import { PageFrame, PageTitle } from "@/components/workspace";
import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, MessageCircle, ShieldCheck } from "lucide-react";
import { engagementLocalHref, engagementContactHref, engagementInformationHref } from "@/domain/engagement-context";
import { type EngagementJourney } from "@/domain/engagement-journeys";

/** This is a public response selector. It is NOT an application receipt.
 * The canonical Launch Studio continues showing verified, state-based next
 * actions and never trusts this choice as admission or staff clearance. */
export function EngagementNextSteps({ journey }: { journey: EngagementJourney }) {
  const search = useLocation({ select: loc => loc.searchStr });
  const [selection, setSelection] = useState("");
  const choice = journey.next.choices.find(item => item.id === selection);
  const destination = choice?.action === "information"
    ? engagementInformationHref(journey, choice)
    : choice ? engagementContactHref(journey, choice, search) : "";
  return <PageFrame width="wide" className="mx-auto max-w-screen-xl px-5 py-12 sm:px-8 lg:py-20">
    <a href={engagementLocalHref(`/landing/${journey.id}`, search)}
      className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline">
      <ArrowLeft className="size-4"/> Back to {journey.audience.toLowerCase()}
    </a>
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(15rem,.7fr)]">
      <section className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">CAN Academy · Next Steps</p>
        <PageTitle className="mt-4 font-serif text-5xl leading-tight sm:text-6xl">{journey.next.title}</PageTitle>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{journey.next.description}</p>
        <p className="mt-5 border-l-2 border-primary pl-4 text-sm leading-7 text-muted-foreground">
          This page helps you decide what to explore. Arriving here does not confirm a submitted application,
          approved school, hired teacher, enrollment, or partnership.
        </p>
        <fieldset className="mt-8">
          <legend className="font-serif text-2xl">What would be most helpful?</legend>
          <div className="mt-5 grid gap-3">
            {journey.next.choices.map(item=><label key={item.id}
              className={`flex cursor-pointer items-start gap-4 border p-5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary ${selection === item.id ? "border-primary bg-accent/40" : "border-border bg-card hover:border-primary"}`}>
              <input type="radio" name="next-step" value={item.id} checked={selection===item.id}
                onChange={() => setSelection(item.id)} className="mt-1 size-5 shrink-0 accent-primary"/>
              <span><strong className="block text-sm font-semibold">{item.title}</strong>
                <span className="mt-1 block text-xs leading-6 text-muted-foreground">{item.description}</span></span>
            </label>)}
          </div>
        </fieldset>
        {choice && <div className="mt-6 border-t pt-6">
          <a href={destination} className="inline-flex min-h-12 items-center gap-2 bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
            {choice.action === "information" ? "Explore this topic"
              : choice.action === "feedback" ? "Share feedback with CAN" : "Start a conversation"}
            <ArrowRight className="size-4" aria-hidden="true"/>
          </a>
          {choice.action === "feedback" && <p className="mt-3 text-xs leading-6 text-muted-foreground">
            The current public contact form asks for your name and email. Anonymous feedback intake is a separate future enhancement.
            Please do not submit student information or other sensitive records.
          </p>}
        </div>}
      </section>
      <aside className="space-y-4 lg:pt-10">
        <div className="bg-foreground p-6 text-background">
          <MessageCircle className="size-7"/>
          <h2 className="mt-6 font-serif text-3xl">A conversation can be a next step.</h2>
          <p className="mt-4 text-sm leading-7 text-background/80">
            You can ask about the model, share concerns, or take additional time before deciding.
          </p>
          <a href={engagementContactHref(journey, undefined, search)}
            className="mt-5 inline-flex min-h-11 items-center gap-2 border border-background/60 px-4 py-2 text-sm font-semibold text-background">
            Contact CAN <ArrowRight className="size-4"/>
          </a>
        </div>
        <div className="border bg-card p-6">
          <ShieldCheck className="size-6 text-primary"/>
          <h2 className="mt-4 font-serif text-2xl">No pressure to decide.</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">{journey.reality}</p>
        </div>
        <Link to="/launch" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline">
          Return to the Launch Studio entry <ArrowRight className="size-4"/>
        </Link>
      </aside>
    </div>
  </PageFrame>;
}
