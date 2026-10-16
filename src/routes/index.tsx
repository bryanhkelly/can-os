import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="border-b border-border pb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            CAN Academy
          </p>
          <h1 className="mt-3 font-serif text-5xl tracking-tight">CAN OS</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            One operating system for learning, families, local sites, and the CAN network.
          </p>
        </header>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6">
          <div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">Student experience · S1–S4</p>
          <h2 className="mt-2 font-serif text-3xl">A better way to learn every day.</h2>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">Explore Today, your courses, recovery, feedback, and clear submission confirmations in an interactive demonstration.</p></div>
          <Link to="/student" className="rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background">Explore Student Today →</Link>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6">
          <div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">Guardian academics</p>
          <h2 className="mt-2 font-serif text-2xl">Stay connected to student progress.</h2>
          <p className="mt-2 text-sm text-muted-foreground">Authorized guardians can review assignments, grades, and released feedback.</p></div>
          <Link to="/guardian/academics" className="rounded-xl border border-border px-5 py-3 text-sm font-semibold">View guardian academics →</Link>
        </div>
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <FlowCard
            label="Academic"
            title="Student support"
            description="Assignments, submissions, grading, family communication, Insights, and Actions share one record."
          />
          <FlowCard
            label="Enrollment"
            title="Family onboarding"
            description="Households, student identities, enrollment Journeys, and Program activation without re-keying."
          />
          <FlowCard
            label="Launch"
            title="Program readiness"
            description="Church-hosted academies and school extensions launch from the same Organization → Site → Program model."
          />
          <FlowCard
            label="Operations"
            title="Attendance"
            description="Local attendance, parent excuses, audit history, and offline-safe corrections stay synchronized."
          />
        </section>
      </div>
    </main>
  );
}

function FlowCard({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <CardTitle className="font-serif text-2xl font-normal">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-[13px] leading-5">{description}</CardDescription>
      </CardContent>
    </Card>
  );
}
