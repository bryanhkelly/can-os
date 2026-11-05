import { PageFrame, PageTitle } from "@/components/workspace";
import { Link, useLocation } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Building2, GraduationCap, Handshake, ShieldCheck, Users } from "lucide-react";
import { useWorkspaceSession } from "@/components/shell/WorkspaceSession";
import { engagementJourneyList, mayTryIsolatedSchoolDemo, type EngagementJourney } from "@/domain/engagement-journeys";
import { engagementLocalHref, engagementVerifiedRoute, publicMarketingOrigin } from "@/domain/engagement-context";

const accents = { church: Building2, teacher: BookOpen, family: Users, school: GraduationCap, network: Handshake } as const;

function VerifiedLaunchAction({ journey }: { journey: EngagementJourney }) {
  const { session } = useWorkspaceSession();
  const allowed = engagementVerifiedRoute(journey, session?.authenticated ? session.role : undefined);
  return <section className="border border-border bg-card p-6 sm:p-8" aria-label="Existing CAN workspace">
    <p className="text-xs font-semibold uppercase tracking-wider text-primary">For current CAN members</p>
    <h2 className="mt-3 font-serif text-3xl">Your existing Launch Studio</h2>
    <p className="mt-3 text-sm leading-7 text-muted-foreground">
      {journey.launch?.description ?? "This pathway begins with a conversation, not a new institution record."}
    </p>
    {allowed ? <a href={allowed} className="mt-5 inline-flex min-h-11 items-center gap-2 bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">
      {journey.launch?.label} <ArrowRight className="size-4"/>
    </a> : <p className="mt-4 border-l-2 border-border pl-4 text-sm text-muted-foreground">
      {session?.authenticated
        ? "Your current account does not have this journey's verified role. An authorized school or CAN administrator can provide the correct access."
        : "The real Launch Studio requires an invitation or verified school role. Browsing this page never grants access."}
    </p>}
    {!session?.authenticated && <Link to="/access" search={{returnTo:"/launch"}}
      className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline">
      Have an invitation? Sign in <ArrowRight className="size-4"/>
    </Link>}
  </section>;
}

export function EngagementLandingIndex() {
  const search = useLocation({ select: loc => loc.searchStr });
  return <PageFrame width="wide" className="mx-auto max-w-screen-2xl px-5 pb-20 pt-14 sm:px-8 lg:pt-20">
    <p className="text-xs font-semibold uppercase tracking-wider text-primary">A clearer beginning with CAN</p>
    <PageTitle className="mt-5 max-w-4xl font-serif text-5xl leading-tight sm:text-7xl">Every meaningful beginning starts with a possibility.</PageTitle>
    <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
      Explore what CAN could make possible for your church, school, teaching career, or family.
      No commitment is needed to learn about the model.
    </p>
    <div className="mt-12 grid gap-4 md:grid-cols-2">
      {engagementJourneyList.map((journey, i) => {
        const Icon = accents[journey.category];
        return <a key={journey.id} href={engagementLocalHref(`/landing/${journey.id}`,search)}
          className="group flex min-h-60 flex-col justify-between border border-border bg-card p-7 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
          <div className="flex justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{String(i+1).padStart(2,"0")} · {journey.audience}</span>
            <Icon className="size-6 text-primary" aria-hidden="true"/>
          </div>
          <div className="mt-9 flex items-end gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-3xl leading-tight">{journey.headline}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{journey.promise}</p>
            </div>
            <ArrowRight className="size-6 shrink-0 text-primary transition-transform group-hover:translate-x-1" aria-hidden="true"/>
          </div>
        </a>;
      })}
    </div>
  </PageFrame>;
}

export function EngagementLandingDetail({ journey }: { journey: EngagementJourney }) {
  const search = useLocation({ select: loc => loc.searchStr });
  const { session } = useWorkspaceSession();
  const verified = engagementVerifiedRoute(journey, session?.authenticated ? session.role : undefined);
  const sample = mayTryIsolatedSchoolDemo(journey.id);
  const primaryTarget = verified ?? (sample ? "/schools/new" :
    new URL(journey.editorialLinks[0].href, publicMarketingOrigin).toString());
  const primaryLabel = verified ? journey.launch!.label :
    sample ? "Try an isolated demo school" : "Explore the CAN model";
  const Icon = accents[journey.category];
  return <PageFrame width="wide">
    <section className="bg-foreground text-background">
      <div className="mx-auto grid max-w-screen-2xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(15rem,.65fr)] lg:py-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/80">{journey.eyebrow}</p>
          <PageTitle className="mt-6 max-w-4xl font-serif text-5xl leading-tight sm:text-7xl">{journey.headline}</PageTitle>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-background/85">{journey.introduction}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href={primaryTarget}
              className="inline-flex min-h-12 items-center gap-2 bg-background px-6 py-3 text-sm font-semibold text-foreground hover:opacity-90">
              {primaryLabel} <ArrowRight className="size-4" aria-hidden="true"/>
            </a>
            <a href={engagementLocalHref(`/next/${journey.id}`,search)}
              className="inline-flex min-h-12 items-center gap-2 border border-background/70 px-6 py-3 text-sm font-semibold text-background hover:bg-background/10">
              Choose a next step <ArrowRight className="size-4" aria-hidden="true"/>
            </a>
          </div>
          <p className="mt-5 max-w-2xl text-xs leading-6 text-background/75">{journey.promise}</p>
        </div>
        <div className="flex items-end">
          <div className="w-full border border-background/30 bg-background/10 p-7">
            <Icon className="size-9" aria-hidden="true"/>
            <p className="mt-8 text-xs font-semibold uppercase tracking-wider">Learn · Experience · Continue</p>
            <h2 className="mt-4 font-serif text-3xl">A better way to explore.</h2>
            <p className="mt-3 text-sm leading-7 text-background/80">Your questions matter. Discover the model, consider possibilities, and decide what conversation would help you next.</p>
          </div>
        </div>
      </div>
    </section>
    <section className="mx-auto max-w-screen-2xl px-5 py-14 sm:px-8 lg:py-20">
      <div className="grid gap-9 lg:grid-cols-[.75fr_1.25fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">How to begin</p>
          <h2 className="mt-4 font-serif text-4xl">{journey.overviewTitle}</h2>
          <p className="mt-5 border-l-2 border-primary pl-4 text-sm leading-7 text-muted-foreground">{journey.reality}</p>
        </div>
        <ol className="grid gap-3">
          {journey.overview.map((item,index)=><li key={item.title} className="flex gap-5 border bg-card p-6">
            <span className="font-serif text-3xl text-primary">{String(index+1).padStart(2,"0")}</span>
            <div><h3 className="font-serif text-2xl">{item.title}</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">{item.description}</p></div>
          </li>)}
        </ol>
      </div>
    </section>
    <section className="border-y bg-muted/40">
      <div className="mx-auto grid max-w-screen-2xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-2">
        <div><h2 className="font-serif text-4xl">Understand before you decide.</h2>
          <p className="mt-4 max-w-lg text-sm leading-7 text-muted-foreground">Explore the model, responsibilities, and the questions worth answering before taking action.</p></div>
        <nav aria-label="Further CAN information" className="grid gap-2">
          {journey.editorialLinks.map(link=><a key={link.href} href={new URL(link.href,publicMarketingOrigin).toString()}
            className="flex min-h-14 items-center justify-between gap-4 border-b border-border py-3 text-sm font-semibold hover:text-primary">{link.title}<ArrowRight className="size-4"/></a>)}
        </nav>
      </div>
    </section>
    <div className="mx-auto grid max-w-screen-2xl gap-5 px-5 py-14 sm:px-8 lg:grid-cols-2">
      <VerifiedLaunchAction journey={journey}/>
      <section className="border border-border bg-card p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">No commitment</p>
        <h2 className="mt-3 font-serif text-3xl">Would a sample experience help?</h2>
        {mayTryIsolatedSchoolDemo(journey.id) ? <>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">CAN OS offers an isolated, synthetic .demo school setup. It does not create an authorized partner school, enroll students, or grant a real operating approval.</p>
          <Link to="/schools/new" className="mt-5 inline-flex min-h-11 items-center gap-2 border border-primary px-5 py-3 text-sm font-semibold text-primary">
            Try an isolated demo school <ArrowRight className="size-4"/>
          </Link>
        </> : <>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">Learn about this opportunity first, without creating a staff, student, or partnership record.</p>
          <a href={engagementLocalHref(`/next/${journey.id}`,search)} className="mt-5 inline-flex min-h-11 items-center gap-2 border border-primary px-5 py-3 text-sm font-semibold text-primary">
            Choose what comes next <ArrowRight className="size-4"/>
          </a>
        </>}
        <p className="mt-5 flex gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="size-4 shrink-0"/> Verified CAN OS records are created only by separately authorized actions.</p>
      </section>
    </div>
  </PageFrame>;
}
