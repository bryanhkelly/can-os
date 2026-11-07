import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, GraduationCap, Landmark, Save, ShieldCheck, Users } from "lucide-react";
import { PageFrame, PageHeader } from "@/components/workspace";
import wallpaper from "@/assets/student-dashboard-wallpaper.jpg";

const paths = [
  { title: "Set up a school", description: "For administrators and school leaders", to: "/launch/hub/school", icon: Landmark },
  { title: "Apply for your child", description: "For parents and guardians", to: "/launch/family", icon: Users },
  { title: "Get started as a student", description: "For enrolled or invited students", to: "/launch/student", icon: GraduationCap },
  { title: "Join your school team", description: "For teachers and school staff", to: "/launch/staff", icon: BookOpen },
] as const;

export function LaunchStudioEntry() {
  return <PageFrame width="wide" className="launch-studio-page">
    <section className="grid border bg-card lg:grid-cols-[3fr_2fr]">
      <div className="p-6 sm:p-12">
        <PageHeader eyebrow="Your school journey starts here" title={<>Launch Studio<span className="text-primary">.</span></>}
          subtitle={<span className="font-serif text-2xl text-foreground sm:text-3xl">Set up, enroll, and get ready for a successful school year.</span>} />
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">One guided experience. Four paths tailored to you, with clear expectations, saved records, and a meaningful next step.</p>
        <nav aria-label="Choose your Launch Studio journey" className="mt-7 grid gap-3">
          {paths.map(path => <Link key={path.to} to={path.to}
            className="group flex min-h-20 items-center gap-4 border p-4 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary">
            <span className="bg-muted p-3"><path.icon className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{path.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{path.description}</span></span>
            <ArrowRight className="size-5 shrink-0 text-primary" />
          </Link>)}
        </nav>
        <p className="mt-5 text-xs leading-5 text-muted-foreground">Have an invitation? <strong className="text-foreground">Use your school's link to open your own journey.</strong> Choosing a path does not grant access.</p>
      </div>
      <div className="relative flex min-h-72 items-end bg-foreground bg-cover bg-center p-8 text-white sm:p-10"
        style={{ backgroundImage: `linear-gradient(0deg, rgba(16,29,57,.9), transparent 75%), url("${wallpaper}")` }}>
        <div><p className="text-xs font-bold uppercase tracking-eyebrow">CAN OS</p><h2 className="mt-3 font-serif text-4xl">A clearer beginning.</h2>
          <p className="mt-3 text-sm">One system for schools, families, students and staff.</p></div>
      </div>
    </section>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {[{ icon: Save, title: "Return to saved records" }, { icon: ShieldCheck, title: "Secure school records" }, { icon: BookOpen, title: "Help at every step" }].map(item =>
        <div key={item.title} className="flex items-center gap-3 border bg-card p-5 text-xs font-semibold"><item.icon className="size-5 text-primary" />{item.title}</div>)}
    </div>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="font-serif text-2xl">Just exploring CAN?</h2>
      <p className="mt-2 text-sm text-muted-foreground">Begin with an audience-specific introduction. No invitation or school record is needed to explore the opportunity.</p>
      <Link to="/landing" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline">
        Explore CAN pathways <ArrowRight className="size-4"/>
      </Link>
    </section>
    <section id="launch-help" className="mt-6 text-sm leading-6 text-muted-foreground">
      <h2 className="font-semibold text-foreground">Have a school invitation?</h2>
      <p>Use the exact account your school invited. <Link to="/access" className="font-semibold underline">Sign in</Link> to continue.
        {" "}New demonstration school? <Link to="/schools/new" className="underline">Create an isolated .demo school</Link>. This is not a production-school registration.</p>
    </section>
  </PageFrame>;
}
