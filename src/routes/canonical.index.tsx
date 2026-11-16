import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, BookOpen, ClipboardCheck, GraduationCap, Layers3, MapPinned, ShieldCheck, Users } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace";
import { workspaceSessionQueryOptions } from "@/components/shell/WorkspaceSession";

/**
 * Canonical's stable entry point. Keep this index discoverable as lab routes
 * graduate into production; never mistake navigation for an access grant.
 * Every destination enforces its own canonical organization/site authorization.
 */
export const Route = createFileRoute("/canonical/")({
  loader: async ({ context }) => {
    const result = await context.queryClient.fetchQuery(workspaceSessionQueryOptions());
    if (!result.session?.authenticated) {
      throw redirect({ to: "/access", search: { returnTo: "/canonical" } });
    }
  },
  component: CanonicalIndex,
});

const groups = [
  {
    name: "Plan and publish",
    description: "Configure approved educational experiences and the content behind them.",
    icon: Layers3,
    links: [
      { title: "Blueprint Studio", detail: "Site-based educational blueprints and planning", path: "/canonical/blueprints" },
      { title: "Blueprint reviews", detail: "Independent approval and review", path: "/canonical/blueprint-reviews" },
      { title: "Content studio", detail: "Academic content and instructional tracks", path: "/canonical/content" },
      { title: "Content reviews", detail: "Independent instructional content review", path: "/canonical/content-reviews" },
    ],
  },
  {
    name: "Enrollment and learning",
    description: "Run participant registration, learning delivery, and evidence of completion.",
    icon: GraduationCap,
    links: [
      { title: "Class Offerings · Training", detail: "Publish current adult training Class Offerings and enrollment windows", path: "/programs/noncredit/enrollment" },
      { title: "Enrollment lab", detail: "Inspect enrollment journeys", path: "/canonical/lab/enrollment" },
      { title: "Noncredit learning lab", detail: "Review attempts, assessments, and completion decisions", path: "/canonical/lab/noncredit" },
      { title: "Facilitated learning lab", detail: "Explore local in-room learning delivery", path: "/canonical/lab/facilitated" },
      { title: "My credentials", detail: "View the credentials available to your account", path: "/canonical/my-credentials" },
    ],
  },
  {
    name: "Sites and operations",
    description: "Understand delivery locations, readiness, and operating capacity.",
    icon: MapPinned,
    links: [
      { title: "Site qualification", detail: "Facility and operational evidence", path: "/canonical/lab/site-qualification" },
      { title: "Deployments", detail: "Local delivery and offering adoption", path: "/canonical/lab/deployments" },
      { title: "Devices", detail: "Device readiness and inventory testing", path: "/canonical/lab/devices" },
      { title: "Assessment readiness", detail: "Diagnostic and mastery assessment inventory", path: "/canonical/lab/readiness" },
    ],
  },
  {
    name: "Feedback and reporting",
    description: "Collect evidence and understand the impact of learning programs.",
    icon: ClipboardCheck,
    links: [
      { title: "Surveys", detail: "Survey definitions and campaigns", path: "/canonical/lab/surveys" },
      { title: "Survey drafts", detail: "Versioned survey authoring", path: "/canonical/lab/survey-drafts" },
      { title: "Survey reviews", detail: "Independent survey review", path: "/canonical/lab/survey-reviews" },
      { title: "Survey publications", detail: "Approved survey publication workflows", path: "/canonical/lab/survey-publications" },
      { title: "Impact lab", detail: "Enrollment, participation, and impact evidence", path: "/canonical/lab/impact" },
    ],
  },
] as const;

function CanonicalIndex() {
  return (
    <WorkspaceShell width="wide" eyebrow="CAN OS · Canonical" title="Canonical workspace"
      subtitle="One place to find canonical education, program, site and network capabilities. Each area verifies its own access permissions.">
      <section className="mt-6 grid gap-3 md:grid-cols-3" aria-label="Quick destinations">
        <Link to="/canonical/capability-lab" className="flex min-h-24 items-center gap-4 border border-border bg-card px-5 py-4 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary">
          <BookOpen aria-hidden="true" className="h-6 w-6 shrink-0 text-primary" />
          <span className="flex-1"><strong className="block text-sm">Capability Lab</strong><span className="mt-1 block text-xs text-muted-foreground">Internal workflows and testing</span></span>
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
        <Link to="/canonical/blueprints" className="flex min-h-24 items-center gap-4 border border-border bg-card px-5 py-4 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary">
          <Layers3 aria-hidden="true" className="h-6 w-6 shrink-0 text-primary" />
          <span className="flex-1"><strong className="block text-sm">Blueprint Studio</strong><span className="mt-1 block text-xs text-muted-foreground">Plan your educational operations</span></span>
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
        <Link to="/programs/noncredit/enrollment" className="flex min-h-24 items-center gap-4 border border-border bg-card px-5 py-4 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary">
          <Users aria-hidden="true" className="h-6 w-6 shrink-0 text-primary" />
          <span className="flex-1"><strong className="block text-sm">Program enrollment</strong><span className="mt-1 block text-xs text-muted-foreground">Manage noncredit releases</span></span>
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </section>
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {groups.map(group => {
          const Icon = group.icon;
          return (
            <section key={group.name} className="border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <Icon aria-hidden="true" className="mt-1 h-5 w-5 text-primary" />
                <div>
                  <h2 className="font-serif text-2xl text-foreground">{group.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
                </div>
              </div>
              <ul className="mt-5 divide-y divide-border border-t border-border">
                {group.links.map(link => (
                  <li key={link.path}>
                    <Link to={link.path} className="group flex min-h-16 items-center gap-3 py-3 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
                      <span className="flex-1">
                        <span className="block text-sm font-semibold">{link.title}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{link.detail}</span>
                      </span>
                      <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="mt-6 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
        Internal lab pages are not production-readiness confirmations. Availability depends on your verified role and organization or Site scope.
      </p>
    </WorkspaceShell>
  );
}
