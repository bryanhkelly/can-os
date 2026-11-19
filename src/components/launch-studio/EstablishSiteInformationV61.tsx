import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Radio } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SiteAffiliationPanel } from "@/components/operations/SiteAffiliationPanel";
import { ActionFooter, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import {
  cleanSiteEnvironmentV61, cleanSiteHostingV61,
  siteEnvironmentV61Schema, siteHostingV61Schema, siteStoryV61Schema,
  type SiteEnvironmentV61, type SiteHostingV61, type SiteStoryV61,
} from "@/domain/site-information-v61";
import { saveSiteInformationV61 } from "@/modules/programs/site-information-v61.functions";
import { useLaunchUnsavedChanges } from "./useLaunchUnsavedChanges";

type Step = 0 | 1 | 2 | 3;
type EnvironmentDraft = Omit<SiteEnvironmentV61, "delivery"> & { delivery: SiteEnvironmentV61["delivery"] | "" };
type MultiKey = "motivations" | "distinctives" | "values" | "experiences";

export type SiteInformationV61Initial = {
  siteId: string;
  revision: string;
  host: SiteHostingV61;
  hostingSaved: boolean;
  environment: EnvironmentDraft;
  environmentSaved: boolean;
  story: SiteStoryV61;
  storyRevision: string | null;
};

const steps = [
  { title: "Hosting & Organization", description: "Who supports your Site" },
  { title: "Learning Environment", description: "How learning will happen" },
  { title: "Network Affiliation", description: "Optional connections" },
  { title: "Purpose & Story", description: "Why this community exists" },
] as const;

export const siteInformationV61Guidance = [
  {
    why: "The organization responsible for your Site may differ from the organization hosting its activities.",
    tip: "Naming a host is private planning information, not a verified legal relationship.",
    next: "Choose the learning environments your Site may support.",
  },
  {
    why: "In-person and online delivery have different needs. Your choice tailors later preparation.",
    tip: "A delivery preference is not a timetable, facility approval, or approved offering.",
    next: "Decide whether to explore network affiliation.",
  },
  {
    why: "Networks may provide resources, but membership and shared access require separate review.",
    tip: "You can continue independently. An affiliation request is never sent by clicking Continue.",
    next: "Share why your learning community exists.",
  },
  {
    why: "Your private answers guide suggested About Us, mission, vision and outreach messaging.",
    tip: "You can review and revise every suggestion. Nothing is published automatically.",
    next: "Continue to Programs & Audiences, where you can state your broad Program intent.",
  },
] as const;

export function SiteInformationV61Guidance({ step }: { step: Step }) {
  const guidance = siteInformationV61Guidance[step];
  return <div className="space-y-4">
    <WorkspacePanel title="Why this matters">
      <p className="text-sm leading-6 text-muted-foreground">{guidance.why}</p>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{guidance.tip}</p>
    </WorkspacePanel>
    <WorkspacePanel title="What comes next">
      <p className="text-sm leading-6 text-muted-foreground">{guidance.next}</p>
    </WorkspacePanel>
  </div>;
}

function SingleChoice({ name, selected, title, detail, onSelect }: {
  name: string; selected: boolean; title: string; detail: string; onSelect: () => void;
}) {
  return <label className={"flex min-h-20 cursor-pointer items-start gap-3 border p-4 text-sm " +
    (selected ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted/30")}>
    <Radio name={name} checked={selected} onChange={onSelect} className="mt-0.5" />
    <span><strong className="block">{title}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span></span>
  </label>;
}

const motivations = [
  ["access", "Expand access to educational opportunities"],
  ["belonging", "Build a supportive, welcoming community"],
  ["personalized", "Offer more personalized learning"],
  ["practical", "Develop practical and career skills"],
  ["alternative", "Give families more choices"],
  ["creative", "Provide enrichment and creative opportunities"],
  ["character", "Develop character, leadership and service"],
  ["need", "Address an unmet community need"],
] as const;
const distinctives = [
  ["flexible", "Flexible learning approaches"], ["community", "Strong community partnerships"],
  ["personal", "Individualized support"], ["hands-on", "Hands-on, applied learning"],
  ["faith", "Faith-informed identity (optional)"], ["service", "Leadership and service"],
  ["creative", "Creativity and expression"], ["technology", "Technology-enabled learning"],
] as const;
const values = [
  ["belonging", "Belonging and care"], ["curiosity", "Curiosity and discovery"],
  ["excellence", "Growth and excellence"], ["integrity", "Integrity and character"],
  ["creativity", "Creativity"], ["service", "Service and leadership"],
  ["opportunity", "Equity of opportunity"], ["family", "Family partnership"],
] as const;
const experiences = [
  ["known", "Feel known, supported and welcome"], ["confidence", "Build confidence and independence"],
  ["interests", "Discover interests and talents"], ["mastery", "Gain knowledge and develop mastery"],
  ["skills", "Practice real-world skills"], ["purpose", "Grow in character and purpose"],
] as const;

function MultiChoice({ title, hint, options, selected, onChange, max }: {
  title: string; hint: string; options: ReadonlyArray<readonly [string, string]>;
  selected: string[]; onChange: (values: string[]) => void; max?: number;
}) {
  return <fieldset className="min-w-0 space-y-3 border-b pb-6">
    <legend className="text-sm font-semibold">{title}</legend>
    <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map(([id, label]) => <label key={id} className="flex min-h-11 items-center gap-2 border bg-card p-3 text-xs">
        <Checkbox checked={selected.includes(id)}
          disabled={max !== undefined && selected.length >= max && !selected.includes(id)}
          onChange={event => onChange(event.target.checked ? [...selected, id] : selected.filter(value => value !== id))} />
        <span>{label}</span>
      </label>)}
    </div>
    {max !== undefined && <p className="text-xs text-muted-foreground">{selected.length} of {max} selected</p>}
  </fieldset>;
}

function normalizeStory(value: SiteStoryV61): SiteStoryV61 {
  return {
    motivations: [...value.motivations].sort(), communityNeed: value.communityNeed.trim(),
    distinctives: [...value.distinctives].sort(), foundingStory: value.foundingStory.trim(),
    values: [...value.values].sort(), experiences: [...value.experiences].sort(),
    futureVision: value.futureVision.trim(),
  };
}
function isEmptyStory(story: SiteStoryV61): boolean {
  return !Object.values(story).some(value => Array.isArray(value) ? value.length > 0 : value.trim().length > 0);
}
function snapshot(value: unknown) { return JSON.stringify(value); }

export function EstablishSiteInformationV61({ siteId, responsibleOrganizationName, initial,
  onBackToSiteProfile, onSaveAndExit, onContinueToPrograms, onInternalStepChange,
}: {
  siteId: string;
  responsibleOrganizationName: string | null;
  initial: SiteInformationV61Initial;
  onBackToSiteProfile: () => void;
  onSaveAndExit: () => void;
  onContinueToPrograms: () => void;
  onInternalStepChange?: (step: Step) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [host, setHost] = useState(initial.host);
  const [environment, setEnvironment] = useState<EnvironmentDraft>(initial.environment);
  const [story, setStory] = useState(initial.story);
  const [hostSaved, setHostSaved] = useState(initial.hostingSaved);
  const [environmentSaved, setEnvironmentSaved] = useState(initial.environmentSaved);
  const [storySaved, setStorySaved] = useState(initial.storyRevision !== null);
  const [savedHost, setSavedHost] = useState(snapshot(cleanSiteHostingV61(initial.host)));
  const [savedEnvironment, setSavedEnvironment] = useState(snapshot(initial.environment));
  const [savedStory, setSavedStory] = useState(snapshot(normalizeStory(initial.story)));
  const [networkChoice, setNetworkChoice] = useState<"independent" | "request">("independent");
  const [busy, setBusy] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(initial.revision);
  const lock = useRef(false);
  const saveAttempted = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstStepRender = useRef(true);
  useEffect(() => {
    if (firstStepRender.current) { firstStepRender.current = false; return; }
    panelRef.current?.focus();
  }, [step]);

  const hostDirty = snapshot(cleanSiteHostingV61(host)) !== savedHost;
  const environmentDirty = snapshot(environment.delivery === "digital"
    ? { delivery: "digital", physicalSpaceArrangement: "" } : environment) !== savedEnvironment;
  const storyDirty = snapshot(normalizeStory(story)) !== savedStory;
  const dirty = hostDirty || environmentDirty || storyDirty;
  const releaseNavigation = useLaunchUnsavedChanges(dirty,
    "Leave Site Information? Unsaved answers will be lost.");
  function selectStep(next: Step) {
    setStep(next); setError(""); onInternalStepChange?.(next);
  }
  function updateMulti(key: MultiKey, selected: string[]) {
    setStory(current => ({ ...current, [key]: selected }));
  }
  async function persist(section: "hosting" | "environment" | "story",
    draft: SiteHostingV61 | SiteEnvironmentV61 | SiteStoryV61) {
    const data = section === "hosting"
      ? { siteId, expectedRevision: revision.current, section, host: draft as SiteHostingV61 }
      : section === "environment"
        ? { siteId, expectedRevision: revision.current, section, environment: draft as SiteEnvironmentV61 }
        : { siteId, expectedRevision: revision.current, section, story: draft as SiteStoryV61 };
    // Discriminant is narrowed at the API boundary; the server revalidates all fields.
    // Even a rejected/failed response may hide a committed mutation. Reconcile first.
    saveAttempted.current = true;
    const result = await saveSiteInformationV61({ data });
    if (!result.revision) throw new Error("Save returned no Site revision. Reload before retrying.");
    revision.current = result.revision;
  }
  async function saveHosting(required: boolean) {
    if (!required && !hostDirty) return;
    if (hostSaved && !hostDirty) return;
    const validated = siteHostingV61Schema.safeParse(cleanSiteHostingV61(host));
    if (!validated.success) {
      selectStep(0); throw new Error(validated.error.issues[0]?.message ?? "Review Hosting & Organization.");
    }
    await persist("hosting", validated.data);
    setHost(validated.data); setHostSaved(true); setSavedHost(snapshot(validated.data));
  }
  async function saveEnvironment(required: boolean) {
    if (!required && !environmentDirty) return;
    if (environmentSaved && !environmentDirty) return;
    const validated = siteEnvironmentV61Schema.safeParse(environment);
    if (!validated.success) {
      selectStep(1); throw new Error(validated.error.issues[0]?.message ?? "Review Learning Environment.");
    }
    const clean = cleanSiteEnvironmentV61(validated.data);
    await persist("environment", clean);
    setEnvironment(clean); setEnvironmentSaved(true); setSavedEnvironment(snapshot(clean));
  }
  async function saveStory(required: boolean) {
    if (!storyDirty && (storySaved || !required)) return;
    const clean = normalizeStory(story);
    if (!storySaved && isEmptyStory(clean)) return; // Entire Story step is optional.
    const validated = siteStoryV61Schema.safeParse(clean);
    if (!validated.success) {
      selectStep(3); throw new Error(validated.error.issues[0]?.message ?? "Review Purpose & Story.");
    }
    await persist("story", validated.data);
    setStorySaved(true); setSavedStory(snapshot(clean));
  }

  async function act(mode: "next" | "exit") {
    if (lock.current || reloadRequired) return;
    lock.current = true; setBusy(true); setError("");
    saveAttempted.current = false;
    try {
      // Validate every section we intend to write before starting sequential commits.
      // A missing required answer must not leave a partial database update.
      const checkingHost = mode === "next" && step === 3 ||
        mode === "exit" && (step === 0 || hostDirty);
      const checkingEnvironment = mode === "next" && step === 3 ||
        mode === "exit" && (step === 1 || environmentDirty);
      if (checkingHost) {
        const checked = siteHostingV61Schema.safeParse(cleanSiteHostingV61(host));
        if (!checked.success) {
          selectStep(0); throw new Error(checked.error.issues[0]?.message ?? "Review Hosting & Organization.");
        }
      }
      if (checkingEnvironment) {
        const checked = siteEnvironmentV61Schema.safeParse(environment);
        if (!checked.success) {
          selectStep(1); throw new Error(checked.error.issues[0]?.message ?? "Review Learning Environment.");
        }
      }
      if ((mode === "next" && step === 3 || mode === "exit" && (step === 3 || storyDirty))
          && !siteStoryV61Schema.safeParse(normalizeStory(story)).success) {
        selectStep(3); throw new Error("Review the optional Purpose & Story answers.");
      }
      // Saving multiple sections is sequential, with Site revision threading.
      // A failed later section must never be retried blindly.
      if (mode === "exit") {
        if (step === 0 || hostDirty) await saveHosting(step === 0);
        if (step === 1 || environmentDirty) await saveEnvironment(step === 1);
        if (step === 3 || storyDirty) await saveStory(step === 3);
      } else if (step === 0) {
        await saveHosting(true);
      } else if (step === 1) {
        await saveEnvironment(true);
      } else if (step === 3) {
        // Finishing out of order must still save and validate required earlier answers.
        await saveHosting(true);
        await saveEnvironment(true);
        await saveStory(true);
      }
      if (mode === "next" && step < 3) {
        selectStep((step + 1) as Step);
      } else {
        await router.invalidate(); // Confirm latest authorized Site before navigating.
        releaseNavigation();
        if (mode === "exit") onSaveAndExit();
        else onContinueToPrograms();
      }
    } catch (cause) {
      if (saveAttempted.current) setReloadRequired(true);
      setError(cause instanceof Error ? cause.message : "Unable to save Site Information. Reload and review your answers.");
    } finally {
      lock.current = false; setBusy(false);
    }
  }

  return <section aria-label="Site Information" className="min-w-0 space-y-5">
    <div className="sticky top-0 z-10 border bg-background p-2 shadow-sm">
      <nav aria-label="Site Information sections" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {steps.map((item, index) => {
          const saved = index === 0 ? hostSaved && !hostDirty :
            index === 1 ? environmentSaved && !environmentDirty :
              index === 3 ? storySaved && !storyDirty : false;
          return <Button key={item.title} type="button" variant="outline" disabled={busy || reloadRequired}
            aria-current={index === step ? "step" : undefined}
            onClick={() => selectStep(index as Step)}
            className={"flex min-h-16 min-w-0 w-full shrink flex-col items-stretch justify-center gap-1 border p-3 text-left text-xs " +
              (index === step ? "border-primary bg-accent" : "border-border bg-card")}>
            <span className="flex items-center gap-2 text-xs font-bold">
              <span>{index + 1}.</span><span>{item.title}</span>
              {saved && <><Check aria-hidden="true" className="ml-auto size-3 shrink-0 text-success" /><span className="sr-only">Saved</span></>}
            </span>
            <span className="mt-1 hidden text-xs text-muted-foreground xl:block">{item.description}</span>
          </Button>;
        })}
      </nav>
    </div>
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step {step + 1} of 4</p>
    <div ref={panelRef} role="region" tabIndex={-1} aria-label={steps[step].title}
      className="outline-none focus-visible:ring-2 focus-visible:ring-ring">
    {step === 0 && <WorkspacePanel id="site-information-step-0" title="Hosting & Organization"
      description="Who is responsible for your Site, and who hosts its activities?">
      <div className="space-y-5">
        <div className="border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">Responsible organization · Site Profile (read-only)</p>
          <p className="mt-1 font-semibold">{responsibleOrganizationName ?? "Organization unavailable. Refresh your Site."}</p>
          <p className="mt-2 text-xs text-muted-foreground">Changing the responsible organization requires its own authorized process.</p>
        </div>
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Who hosts your learning space or activities?</legend>
          <div className="grid gap-2 lg:grid-cols-3">
            <SingleChoice name="site-host" selected={host.hostingMode === "same"} title="Your organization"
              detail="Your organization hosts its own activities" onSelect={() => setHost(current => ({ ...current, hostingMode: "same" }))} />
            <SingleChoice name="site-host" selected={host.hostingMode === "different"} title="Another organization"
              detail="A separate organization hosts us" onSelect={() => setHost(current => ({ ...current, hostingMode: "different" }))} />
            <SingleChoice name="site-host" selected={host.hostingMode === "undecided"} title="Not decided yet"
              detail="We are still exploring options" onSelect={() => setHost(current => ({ ...current, hostingMode: "undecided" }))} />
          </div>
        </fieldset>
        {host.hostingMode === "different" && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Hosting organization name" required><Input maxLength={160} value={host.separateHostName}
            onChange={event => setHost(current => ({ ...current, separateHostName: event.target.value }))} /></Field>
          <Field label="Hosting organization type" required><Select value={host.separateHostType}
            onChange={event => setHost(current => ({ ...current, separateHostType: event.target.value as SiteHostingV61["separateHostType"] }))}>
            <option value="">Select a type</option>
            <option value="church">Church or faith community</option>
            <option value="community_nonprofit">Community or nonprofit organization</option>
            <option value="education_provider">Education provider</option>
            <option value="other">Other</option>
          </Select></Field>
        </div>}
        <WorkspaceNotice>A self-reported host does not create a verified organizational relationship, ownership or authorization.</WorkspaceNotice>
      </div>
    </WorkspacePanel>}
    {step === 1 && <WorkspacePanel id="site-information-step-1" title="Learning Environment"
      description="Choose how learners may participate. Specific Solutions and requirements come later.">
      <div className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">How will learners participate?</legend>
          <div className="grid gap-2 lg:grid-cols-3">
            <SingleChoice name="site-delivery" title="In person" detail="At a physical learning location"
              selected={environment.delivery === "physical"} onSelect={() => setEnvironment(current => ({ ...current, delivery: "physical" }))} />
            <SingleChoice name="site-delivery" title="Online" detail="Participate remotely"
              selected={environment.delivery === "digital"} onSelect={() => setEnvironment(current => ({ ...current, delivery: "digital" }))} />
            <SingleChoice name="site-delivery" title="Both" detail="In-person and online learning"
              selected={environment.delivery === "both"} onSelect={() => setEnvironment(current => ({ ...current, delivery: "both" }))} />
          </div>
        </fieldset>
        {environment.delivery && environment.delivery !== "digital" && <Field label="Physical space arrangement" required>
          <Select value={environment.physicalSpaceArrangement} onChange={event =>
            setEnvironment(current => ({ ...current, physicalSpaceArrangement: event.target.value as SiteEnvironmentV61["physicalSpaceArrangement"] }))}>
            <option value="">Select an arrangement</option>
            <option value="owned_leased">Owned or leased space</option>
            <option value="shared_hosted">Shared or hosted space</option>
            <option value="planned">Still looking for a location</option>
          </Select>
        </Field>}
        <WorkspaceNotice>Your Site address is managed in <a className="font-semibold underline" href={"/launch/site?siteId=" + encodeURIComponent(siteId) + "&module=site-profile"}>Site Profile</a>. Facilities, staffing, schedules, equipment and approvals are established during Prepare, based on the Solutions selected.</WorkspaceNotice>
      </div>
    </WorkspacePanel>}
    {step === 2 && <WorkspacePanel id="site-information-step-2" title="Network Affiliation"
      description="Optional. You can operate independently while you establish your Site.">
      <div className="space-y-5">
        <fieldset className="space-y-3"><legend className="text-sm font-semibold">Would you like to explore network affiliation?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <SingleChoice name="site-network" title="Not at this time" detail="Continue independently"
              selected={networkChoice === "independent"} onSelect={() => setNetworkChoice("independent")} />
            <SingleChoice name="site-network" title="Explore or request affiliation" detail="Review eligible networks and request approval"
              selected={networkChoice === "request"} onSelect={() => setNetworkChoice("request")} />
          </div>
        </fieldset>
        {networkChoice === "request" && <SiteAffiliationPanel siteId={siteId} />}
        <WorkspaceNotice>Only eligible denomination network requests are currently supported. Submitting a request is a separate explicit action and does not grant membership, private access or enrollment authority.</WorkspaceNotice>
      </div>
    </WorkspacePanel>}
    {step === 3 && <WorkspacePanel id="site-information-step-3" title="Purpose & Story"
      description="Optional. Tell us what matters to your learning community.">
      <div className="space-y-6">
        <WorkspaceNotice><strong>How CAN OS will use your answers</strong><p className="mt-2">
          The answers you provide here, including your written origin story, community need,
          values and future vision, are used to draft your website and outreach materials.
          Review, change or decline the drafts before sharing them. <strong>Nothing is published automatically.</strong>
          These answers do not establish Program approval or enrollment authority.
          Avoid including sensitive details or information about others that you cannot share.</p></WorkspaceNotice>
        <MultiChoice title="1. Why are you creating this learning community?" hint="Choose up to three motivations. Optional."
          options={motivations} selected={story.motivations} max={3} onChange={selected => updateMulti("motivations", selected)} />
        <Field label="2. What need are you hoping to address?" description="Describe the challenge or opportunity. No identifiable student details.">
          <Textarea rows={3} maxLength={1000} value={story.communityNeed}
            onChange={event => setStory(current => ({ ...current, communityNeed: event.target.value }))} /></Field>
        <MultiChoice title="3. What makes your approach distinctive?" hint="Select aspirations, not unverified claims."
          options={distinctives} selected={story.distinctives} onChange={selected => updateMulti("distinctives", selected)} />
        <Field label="4. How did your vision begin?" description="Your origin story, in your own words.">
          <Textarea rows={3} maxLength={2000} value={story.foundingStory}
            onChange={event => setStory(current => ({ ...current, foundingStory: event.target.value }))} /></Field>
        <MultiChoice title="5. What values matter most?" hint="Select what you want reflected in your messaging."
          options={values} selected={story.values} onChange={selected => updateMulti("values", selected)} />
        <MultiChoice title="6. What do you hope learners experience?" hint="Select aspirations, not promised outcomes."
          options={experiences} selected={story.experiences} onChange={selected => updateMulti("experiences", selected)} />
        <Field label="7. What do you hope this community becomes?" description="Your long-term vision. Optional.">
          <Textarea rows={4} maxLength={2000} value={story.futureVision}
            onChange={event => setStory(current => ({ ...current, futureVision: event.target.value }))} /></Field>
        <p className="text-xs italic leading-5 text-muted-foreground">
          By saving these optional answers, you authorize CAN OS to use them to prepare editable
          website and promotional drafts. The original answers remain in Site Information.
          You decide which wording appears in a shareable website preview or official publication.
        </p>
      </div>
    </WorkspacePanel>}
    </div>
    {error && <WorkspaceNotice tone={reloadRequired ? "attention" : "danger"}>{error}
      {reloadRequired && <span className="block">A save may have succeeded. Reload this Site to reconcile the current record before retrying.</span>}
    </WorkspaceNotice>}
    {reloadRequired && <Button type="button" variant="outline" onClick={() => {
      releaseNavigation();
      window.location.reload();
    }}>Reload Site and review saved answers</Button>}
    <footer aria-label="Site Information actions">
      <ActionFooter layout="inline" className="justify-between border-t border-border/60 pt-5">
      <Button type="button" variant="outline" disabled={busy} onClick={() => {
        if (step === 0) onBackToSiteProfile(); else selectStep((step - 1) as Step);
      }}><ArrowLeft className="size-4" />{step === 0 ? "Back to Site Profile" : "Previous step"}</Button>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" disabled={busy || reloadRequired} onClick={() => void act("exit")}>
          Save & Exit</Button>
        <Button type="button" disabled={reloadRequired} loading={busy}
          loadingLabel="Saving Site Information…" onClick={() => void act("next")}>
          {step === 3 ? "Finish Site Information" : "Save & Continue"}<ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
      </ActionFooter>
    </footer>
  </section>;
}
