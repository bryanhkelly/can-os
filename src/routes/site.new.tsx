import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import {
  ArrowRight, BookOpen, CalendarCheck, CheckCircle2, Clock3, GraduationCap,
  Globe2, Mail, ShieldCheck, Sun, UsersRound,
  type LucideIcon,
} from "lucide-react";
import { siteSignupSchema, publicSignupOrganizationTypeOptions } from "@/domain/school-setup";
import { useHydrated } from "@/lib/use-hydrated";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const noStore = { "Cache-Control": "no-store" };

/**
 * One public Site entry; identity approval determines when common provisioning runs.
 */
export const Route = createFileRoute("/site/new")({
  server: { handlers: {
    POST: createServerOnlyFn(async ({ request }) => {
      if (new URL(request.url).origin !== request.headers.get("origin")) {
        return Response.json({ error: "Invalid request origin" }, { status: 403, headers: noStore });
      }
      try {
        const gate = await import("@/modules/identity/anonymous-auth-admission.server");
        const denial = gate.anonymousAuthAdmissionResponse(await gate.admitAnonymousAuthRequest("school_setup"));
        if (denial) return denial;
      } catch {
        console.error("[site-signup] admission unavailable");
        return Response.json({ error: "Site setup is temporarily unavailable." },
          { status: 503, headers: { ...noStore, "Retry-After": "30" } });
      }
      let submitted: unknown;
      try {
        const text = await request.text();
        if (text.length > 4096) {
          return Response.json({ error: "Submission is too large." }, { status: 413, headers: noStore });
        }
        submitted = JSON.parse(text);
      } catch {
        return Response.json({ error: "Invalid submission." }, { status: 400, headers: noStore });
      }
      const parsed = siteSignupSchema.safeParse(submitted);
      if (!parsed.success) {
        return Response.json({ error: "Please check the Site and administrator details." },
          { status: 400, headers: noStore });
      }
      try {
        const { isDemoAccountEmail } = await import("@/domain/local-demo-access");
        if (isDemoAccountEmail(parsed.data.email)) {
          const { provisionDemoSiteSignup } = await import("@/modules/identity/school-setup-signup.server");
          await provisionDemoSiteSignup(parsed.data);
          return Response.json({ accepted: true, demo: true }, { status: 202, headers: noStore });
        }
        const { requestSchoolSetupAccess } = await import("@/modules/identity/passwordless-access.server");
        await requestSchoolSetupAccess(parsed.data);
      } catch {
        // Preserve account-existence and delivery-status indistinguishability.
        console.error("[site-signup] verified email request unavailable");
      }
      return Response.json({ accepted: true }, { status: 202, headers: noStore });
    }),
  } },
  component: SiteNewPage,
});

type Feature = { title: string; description: string; Icon: LucideIcon };
const programs: Feature[] = [
  { title: "Schools", description: "Grades 6–12 and beyond", Icon: GraduationCap },
  { title: "After-school", description: "Enrichment and support", Icon: Clock3 },
  { title: "Summer learning", description: "Seasonal programs", Icon: Sun },
  { title: "Adult education", description: "Skills and training", Icon: UsersRound },
];
const capabilities: Feature[] = [
  { title: "Curriculum & Learning", description: "Courses, lessons, assessments and instructional resources.", Icon: BookOpen },
  { title: "Enrollment & Registration", description: "Applications, families, learners and class registration.", Icon: CalendarCheck },
  { title: "Staff & Operations", description: "Roles, schedules, learning spaces and daily activities.", Icon: UsersRound },
  { title: "Website & Outreach", description: "Your website, family outreach and community engagement.", Icon: Globe2 },
  { title: "Teaching & Support", description: "Recorded instruction, tutors and academic support.", Icon: GraduationCap },
  { title: "Readiness & Compliance", description: "Requirements, evidence, approvals and launch readiness.", Icon: ShieldCheck },
];

function FeatureGrid({ items }: { items: Feature[] }) {
  return <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
    {items.map(({ title, description, Icon }) => <div key={title} className="flex min-w-0 items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center bg-accent text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>)}
  </div>;
}

function SiteNewPage() {
  const hydrated = useHydrated();
  const [sending, setSending] = useState(false);
  const [requested, setRequested] = useState(false);
  const [demoReady, setDemoReady] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const payload = {
      name: String(values.get("siteName") ?? "").trim(),
      organizationName: String(values.get("organizationName") ?? "").trim() || undefined,
      organizationType: String(values.get("organizationType") ?? "").trim(),
      firstName: String(values.get("firstName") ?? "").trim(),
      lastName: String(values.get("lastName") ?? "").trim(),
      email: String(values.get("email") ?? "").trim(),
    };
    setSending(true);
    setError("");
    try {
      const response = await fetch("/site/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Request not accepted");
      const result = await response.json() as { demo?: boolean };
      setDemoReady(result.demo === true);
      setRequested(true);
    } catch {
      setError("We couldn't start verification. Check your details and try again.");
    } finally {
      setSending(false);
    }
  }

  const eyebrow = "text-2xs font-bold uppercase tracking-eyebrow text-primary";
  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b bg-card">
      <div className="can-shell-bar mx-auto flex min-h-[var(--topbar-height)] max-w-screen-2xl flex-wrap items-center justify-between gap-4 px-[var(--page-gutter)] py-3">
        <Link to="/" className="flex items-center gap-4 text-foreground no-underline" aria-label="CAN OS home">
          <span className="text-xl font-bold tracking-tight">CAN OS</span>
          <span className="h-7 border-l border-border" aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-eyebrow">Launch Studio</span>
        </Link>
        <nav aria-label="Account links" className="flex items-center gap-4 text-sm">
          <Link to="/access" className="font-semibold text-foreground">Sign in</Link>
          <span aria-hidden="true" className="h-5 border-l border-border" />
          <a href="#site-new-help" className="font-semibold text-primary">Help</a>
        </nav>
      </div>
    </header>
    <main className="mx-auto max-w-screen-2xl px-[var(--page-gutter)] pb-12 pt-[var(--page-pad-top)]">
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="site-new-heading">
            <p className={eyebrow}>Get started</p>
            <h1 id="site-new-heading" className="mt-2 font-serif text-5xl leading-tight">Create your Site.</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              Start with the basics. Launch Studio will guide you through everything else.
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium">
              <span>✓ Simple to get started</span>
              <span>✓ Secure email verification</span>
              <span>✓ Complete details later</span>
            </div>
          </section>
          <section className="border bg-card p-5 sm:p-7" aria-label="Create your Site">
            {requested ? <div role="status" className="space-y-4">
              <CheckCircle2 className="size-9 text-success" aria-hidden="true" />
              <h2 className="font-serif text-3xl">{demoReady ? "Your demo Site is ready." : "Check your email."}</h2>
              <p className="leading-7 text-muted-foreground">
                {demoReady ? "Sign in with your demo email and the shared demo access code. No email verification is required." : "If the address is eligible, you will receive a secure verification link. Follow it to create your Site and continue into Launch Studio."}
              </p>
              <Button asChild variant="outline"><Link to="/access">Go to sign in</Link></Button>
            </div> : <form onSubmit={submit} className="space-y-5">
              <p className={eyebrow}>Your learning Site</p>
              <Field label="Site name" required description="The name of the learning community you want to create.">
                <Input name="siteName" autoComplete="organization" placeholder="e.g., Valor Learning Center"
                  required minLength={2} maxLength={160} />
              </Field>
              <Field label="Organization name (optional)"
                description="Only if the organization responsible for this Site has a different name. Affiliations and legal authority are reviewed separately.">
                <Input name="organizationName" placeholder="e.g., Grace Community Church" minLength={2} maxLength={160} />
              </Field>
              <Field label="Responsible organization type" required
                description="Choose how your organization describes itself. National network status and affiliations require independent verification.">
                <Select name="organizationType" defaultValue="other_partner" required>
                  {publicSignupOrganizationTypeOptions.map(option =>
                    <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </Field>
              <div className="border-t pt-5">
                <p className={eyebrow}>Initial Site administrator</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="First name" required>
                    <Input name="firstName" autoComplete="given-name" placeholder="First name" required maxLength={80} />
                  </Field>
                  <Field label="Last name" required>
                    <Input name="lastName" autoComplete="family-name" placeholder="Last name" required maxLength={80} />
                  </Field>
                </div>
                <div className="mt-4">
                  <Field label="Email address" required>
                    <Input name="email" type="email" autoComplete="email" placeholder="you@organization.org"
                      required maxLength={254} />
                  </Field>
                </div>
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button className="w-full justify-between" disabled={!hydrated || sending} type="submit">
                <Mail className="size-4" aria-hidden="true" />
                {sending ? "Sending verification…" : "Verify email & continue"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
              <p className="flex items-start gap-2 bg-muted p-3 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
                Real accounts require email verification. Demo accounts are automatically approved. Both create a standard Site.
                Creating a Site does not authorize opening or enrollment.
              </p>
              <p className="text-center text-xs text-muted-foreground">Already have a CAN OS account?{" "}
                <Link to="/access" className="font-semibold text-primary underline underline-offset-4">Sign in</Link>
              </p>
            </form>}
          </section>
        </div>
        <aside className="min-w-0 border bg-card" aria-label="What CAN OS enables">
          <img src="/school-template-previews/v1/modern/hero.jpg"
            alt="Learning environment" className="h-44 w-full object-cover sm:h-52" />
          <div className="space-y-6 p-5 sm:p-7">
            <section className="space-y-4">
              <p className={eyebrow}>What you can launch</p>
              <h2 className="font-serif text-3xl leading-tight">One platform. Many ways to learn.</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Launch schools, after-school programs, summer learning, adult education, and more.
                Start with your vision, then configure the programs that fit your community.
              </p>
              <FeatureGrid items={programs} />
            </section>
            <section className="space-y-4 border-t pt-6">
              <p className={eyebrow}>Everything you need</p>
              <h2 className="font-serif text-3xl leading-tight">The tools to launch. The platform to operate.</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                From curriculum and enrollment to staffing and daily operations,
                CAN OS brings the pieces together in one connected platform.
              </p>
              <FeatureGrid items={capabilities} />
            </section>
            <section id="site-new-help" className="flex items-start gap-3 border-t pt-5">
              <CheckCircle2 className="mt-1 size-6 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h2 className="font-semibold">Start with an idea. CAN OS helps you build the rest.</h2>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  Four guided stages take you from an initial idea to opening preparation.
                  You don't need a finished curriculum, facility, or team to start.
                </p>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </main>
  </div>;
}
