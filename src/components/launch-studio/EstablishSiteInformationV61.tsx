import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SiteAffiliationPanel } from "@/components/operations/SiteAffiliationPanel";
import {
  siteIdentityV61Schema, siteIdentityTypeOptionsV61, siteFaithTraditionOptionsV61,
  isFaithBasedSiteIdentityV61, siteIdentityEditorialContextV61,
  type SiteIdentityV61, type SiteIdentityV61Draft,
} from "@/domain/site-identity-v61";
import { ActionFooter, SelectionCard, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import {
  cleanSiteEnvironmentV61, cleanSiteHostingV61,
  siteEnvironmentV61Schema, siteHostingV61Schema, siteStoryV61Schema,
  type SiteEnvironmentV61, type SiteHostingV61, type SiteStoryV61,
} from "@/domain/site-information-v61";
import { saveSiteInformationV61 } from "@/modules/programs/site-information-v61.functions";
import { useLaunchUnsavedChanges } from "./useLaunchUnsavedChanges";
import { LaunchGuidancePanels } from "./LaunchGuidancePanels";
import { siteInformationGuideV61 } from "@/domain/launch-site-guide-v61";
import type { SiteProgramsAudiencesV61 } from "@/domain/site-launch-preferences";
import type { SiteGuideContentV61 } from "./SiteGuideV61";
import { GuidedSetupShell } from "@/components/workflow";

type Step = 0 | 1 | 2 | 3;
type EnvironmentDraft = Omit<SiteEnvironmentV61, "delivery"> & { delivery: SiteEnvironmentV61["delivery"] | "" };
type MultiKey = "motivations" | "distinctives" | "values" | "experiences";

export type SiteInformationV61Initial = {
  siteId: string;
  revision: string;
  identity: SiteIdentityV61Draft;
  identitySaved: boolean;
  host: SiteHostingV61;
  hostingSaved: boolean;
  environment: EnvironmentDraft;
  environmentSaved: boolean;
  story: SiteStoryV61;
  storyRevision: string | null;
};

const steps = [
  { title: "Hosting & Organization", description: "Your Site identity and who supports it" },
  { title: "How People Participate", description: "Where and how your activities take place" },
  { title: "Network Affiliation", description: "Optional connections" },
  { title: "Purpose & Story", description: "Why this community exists" },
] as const;

export const siteInformationV61Guidance = [
  {
    why: "Describe your Site, then choose who will host its activities.",
    tip: "Your Site identity is different from the identity of its hosting organization.",
    next: "Choose how people will participate.",
  },
  {
    why: "Choose how people will participate.",
    tip: "Schedules and facilities come later.",
    next: "Choose a network affiliation, if applicable.",
  },
  {
    why: "You can explore a network or continue independently.",
    tip: "No request is sent until you submit one.",
    next: "Tell us about your community.",
  },
  {
    why: "Your answers help shape your community's story.",
    tip: "You can edit these answers later.",
    next: "Choose your Programs and audiences next.",
  },
] as const;

export function SiteInformationV61Guidance({ step, guide }: { step: Step; guide?: SiteGuideContentV61 | null }) {
  return <LaunchGuidancePanels guidance={siteInformationV61Guidance[step]} guide={guide} />;
}

const motivations = [
  ["access", "Make opportunities accessible to more people"],
  ["belonging", "Build a supportive, welcoming community"],
  ["personalized", "Offer experiences that respond to individual needs"],
  ["practical", "Develop practical and career skills"],
  ["alternative", "Give families more choices"],
  ["creative", "Provide enrichment and creative opportunities"],
  ["character", "Encourage character, leadership and service"],
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
      {options.map(([id, label]) => <SelectionCard key={id} kind="checkbox" compact
        value={id} title={label} checked={selected.includes(id)}
        disabled={max !== undefined && selected.length >= max && !selected.includes(id)}
        onChange={checked => onChange(checked ? [...selected, id] : selected.filter(value => value !== id))} />)}
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
  onBackToSiteProfile, onSaveAndExit, onContinueToPrograms, onInternalStepChange, onGuideChange, guidePlanning,
}: {
  siteId: string;
  responsibleOrganizationName: string | null;
  initial: SiteInformationV61Initial;
  onBackToSiteProfile: () => void;
  onSaveAndExit: () => Promise<void>;
  onContinueToPrograms: () => void;
  onInternalStepChange?: (step: Step) => void;
  onGuideChange?: (guide: SiteGuideContentV61) => void;
  guidePlanning?: SiteProgramsAudiencesV61 | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [identity, setIdentity] = useState<SiteIdentityV61Draft>(initial.identity);
  const [identitySaved, setIdentitySaved] = useState(initial.identitySaved);
  const [host, setHost] = useState(initial.host);
  const [environment, setEnvironment] = useState<EnvironmentDraft>(initial.environment);
  const [story, setStory] = useState(initial.story);
  const [hostSaved, setHostSaved] = useState(initial.hostingSaved);
  const [environmentSaved, setEnvironmentSaved] = useState(initial.environmentSaved);
  const [storySaved, setStorySaved] = useState(initial.storyRevision !== null);
  const [savedIdentity, setSavedIdentity] = useState(snapshot(initial.identity));
  const [savedHost, setSavedHost] = useState(snapshot(cleanSiteHostingV61(initial.host)));
  const [savedEnvironment, setSavedEnvironment] = useState(snapshot(initial.environment));
  const [savedStory, setSavedStory] = useState(snapshot(normalizeStory(initial.story)));
  const [networkChoice, setNetworkChoice] = useState<"independent" | "request">("independent");
  // The rail follows live structured selections without reading free-text story fields.
  const liveGuide = useMemo(() => siteInformationGuideV61(step, {
    siteType: identity.siteType, hostingMode: host.hostingMode,
    delivery: environment.delivery, values: story.values, networkChoice, planning: guidePlanning,
  }), [step, identity.siteType, host.hostingMode, environment.delivery, story.values, networkChoice, guidePlanning]);
  useEffect(() => { onGuideChange?.(liveGuide); }, [liveGuide, onGuideChange]);
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

  const identityDirty = snapshot(identity) !== savedIdentity;
  const hostDirty = snapshot(cleanSiteHostingV61(host)) !== savedHost;
  const environmentDirty = snapshot(environment.delivery === "digital"
    ? { delivery: "digital", physicalSpaceArrangement: "" } : environment) !== savedEnvironment;
  const storyDirty = snapshot(normalizeStory(story)) !== savedStory;
  const dirty = identityDirty || hostDirty || environmentDirty || storyDirty;
  const identityContext=siteIdentityEditorialContextV61(identity);
  const storyDistinctives=distinctives.filter(([id])=>id!=="faith" ||
    isFaithBasedSiteIdentityV61(identity) || story.distinctives.includes("faith"));
  const releaseNavigation = useLaunchUnsavedChanges(dirty,
    "Leave Site Information? Unsaved answers will be lost.");
  function selectStep(next: Step) {
    setStep(next); setError(""); onInternalStepChange?.(next);
  }
  function updateMulti(key: MultiKey, selected: string[]) {
    setStory(current => ({ ...current, [key]: selected }));
  }
  async function persist(section: "identity" | "hosting" | "environment" | "story",
    draft: SiteIdentityV61 | SiteHostingV61 | SiteEnvironmentV61 | SiteStoryV61) {
    const data = section === "identity"
      ? { siteId, expectedRevision: revision.current, section, identity: draft as SiteIdentityV61 }
      : section === "hosting"
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
  async function saveIdentity(required: boolean) {
    if (!required && !identityDirty) return;
    if (identitySaved && !identityDirty) return;
    if (!identity.siteType) {selectStep(0);throw new Error("Choose what kind of Site you are building.");}
    const validated = siteIdentityV61Schema.safeParse(identity);
    if (!validated.success) {
      selectStep(0);
      throw new Error(validated.error.issues[0]?.message ?? "Choose your Site identity.");
    }
    await persist("identity", validated.data);
    setIdentity(validated.data);
    setIdentitySaved(true);
    setSavedIdentity(snapshot(validated.data));
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
      const checkingIdentity = mode === "next" && (step === 0 || step === 3) ||
        mode === "exit" && (step === 0 || identityDirty);
      const checkingHost = mode === "next" && (step === 0 || step === 3) ||
        mode === "exit" && (step === 0 || hostDirty);
      if (checkingIdentity) {
        if (!identity.siteType) {selectStep(0);throw new Error("Choose what kind of Site you are building.");}
        const checked = siteIdentityV61Schema.safeParse(identity);
        if (!checked.success) {
          selectStep(0); throw new Error(checked.error.issues[0]?.message ?? "Choose your Site identity.");
        }
      }
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
        if (step === 0 || identityDirty) await saveIdentity(step === 0);
        if (step === 0 || hostDirty) await saveHosting(step === 0);
        if (step === 1 || environmentDirty) await saveEnvironment(step === 1);
        if (step === 3 || storyDirty) await saveStory(step === 3);
      } else if (step === 0) {
        await saveIdentity(true);
        await saveHosting(true);
      } else if (step === 1) {
        await saveEnvironment(true);
      } else if (step === 3) {
        // Finishing out of order must still save and validate required earlier answers.
        await saveIdentity(true);
        await saveHosting(true);
        await saveEnvironment(true);
        await saveStory(true);
      }
      if (mode === "next" && step < 3) {
        selectStep((step + 1) as Step);
      } else {
        await router.invalidate(); // Confirm latest authorized Site before navigating.
        releaseNavigation();
        if (mode === "exit") {
          try { await onSaveAndExit(); }
          catch (failure) {
            setError(failure instanceof Error ? failure.message :
              "Your changes were saved, but we could not open your Site Workspace. Try again from the navigation.");
          }
        }
        else onContinueToPrograms();
      }
    } catch (cause) {
      if (saveAttempted.current) setReloadRequired(true);
      setError(cause instanceof Error ? cause.message : "Unable to save Site Information. Reload and review your answers.");
    } finally {
      lock.current = false; setBusy(false);
    }
  }

  const progressSteps = steps.map((item, index) => {
    const saved = index === 0 ? identitySaved && !identityDirty && hostSaved && !hostDirty :
      index === 1 ? environmentSaved && !environmentDirty :
      index === 3 ? storySaved && !storyDirty : false;
    return {
      id: String(index),
      title: item.title,
      description: item.description,
      // Visiting is not completion. Only persisted, unchanged sections are complete.
      status: index === step ? "current" as const : saved ? "complete" as const : "upcoming" as const,
    };
  });

  return <section aria-label="Site Information" className="min-w-0 space-y-5">
    <GuidedSetupShell title="Site Information" showHeader={false}
      steps={progressSteps} progressLabel="Site Information sections"
      onStepChange={id => selectStep(Number(id) as Step)}
      navigationDisabled={busy || reloadRequired}>
      <div ref={panelRef} role="region" tabIndex={-1} aria-label={steps[step].title}
        className="outline-none focus-visible:ring-2 focus-visible:ring-ring">
    {step === 0 && <WorkspacePanel id="site-information-step-0" title="Hosting & Organization"
      description="First describe the Site you are creating. Then tell us who is responsible for it and where activities will be hosted.">
      <div className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">What kind of organization or community are you building?</legend>
          <p className="text-xs leading-5 text-muted-foreground">
            Describe this Site, not the organization providing its space. Your answer helps tailor
            Tell Your Story and outreach. It does not establish recognition or affiliation.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {siteIdentityTypeOptionsV61.map(option =>
              <SelectionCard key={option.value} kind="radio" name="site-identity"
                checked={identity.siteType===option.value} title={option.label}
                onChange={() => setIdentity(current => ({
                  ...current,siteType:option.value,
                  faithOrientation:option.value==="church_community"||option.value==="faith_based_org"
                    ? "faith_based" : current.siteType==="church_community"||current.siteType==="faith_based_org"
                      ? "undecided" : current.faithOrientation,
                  faithTradition:option.value==="church_community"||option.value==="faith_based_org"
                    ? current.faithTradition : "",
                }))} />)}
          </div>
        </fieldset>
        {identity.siteType && <fieldset className="space-y-3 border-t pt-5">
          <legend className="text-sm font-semibold">Is faith part of this Site's identity?</legend>
          {identity.siteType==="church_community"||identity.siteType==="faith_based_org" ? (
            <p className="text-sm text-muted-foreground">
              Yes. Faith is central to the Site type you selected.
            </p>
          ) : <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["faith_based","Yes, faith-based"],
              ["not_faith_based","No, not faith-based"],
              ["undecided","Still deciding"],
            ] as const).map(([value,label]) =>
              <SelectionCard key={value} kind="radio" name="site-faith"
                checked={identity.faithOrientation===value} title={label}
                onChange={() => setIdentity(current=>({...current,
                  faithOrientation:value,faithTradition:value==="faith_based"?current.faithTradition:"",
                }))}/>)}
          </div>}
          {isFaithBasedSiteIdentityV61(identity) && <Field label="Faith tradition (optional)"
            description="This is self-described and does not establish membership in a denomination or network.">
            <Select value={identity.faithTradition}
              onChange={event=>setIdentity(current=>({...current,
                faithTradition:event.target.value as SiteIdentityV61["faithTradition"],
              }))}>
              <option value="">Not specified</option>
              {siteFaithTraditionOptionsV61.map(option=>
                <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </Field>}
        </fieldset>}
        <div className="border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">Responsible organization · Site Profile (read-only)</p>
          <p className="mt-1 font-semibold">{responsibleOrganizationName ?? "Organization unavailable. Refresh your Site."}</p>
          
        </div>
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Who will host your activities or programs?</legend>
          <div className="grid gap-2 lg:grid-cols-3">
            <SelectionCard kind="radio" name="site-host" checked={host.hostingMode === "same"} title="Your organization"
              detail="Your organization hosts its own activities" onChange={() => setHost(current => ({ ...current, hostingMode: "same" }))} />
            <SelectionCard kind="radio" name="site-host" checked={host.hostingMode === "different"} title="Another organization"
              detail="A separate organization hosts us" onChange={() => setHost(current => ({ ...current, hostingMode: "different" }))} />
            <SelectionCard kind="radio" name="site-host" checked={host.hostingMode === "undecided"} title="Not decided yet"
              detail="We are still exploring options" onChange={() => setHost(current => ({ ...current, hostingMode: "undecided" }))} />
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
        {host.hostingMode!=="undecided"&&<Field label="Hosting organization website (optional)"
          description="Add a website to help us understand your organization and suggest content for you to review. Saving the URL does not retrieve or publish anything.">
          <Input inputMode="url" maxLength={2048}
            placeholder="https://www.example.org"
            value={host.hostWebsiteUrl??""}
            onChange={event=>setHost(current=>({
              ...current,hostWebsiteUrl:event.target.value,
            }))}/>
        </Field>}
        <fieldset className="space-y-3 border-t pt-5">
          <legend className="text-sm font-semibold">Organization &amp; Tax-Exempt Status</legend>
          <p className="text-xs leading-5 text-muted-foreground">
            This helps us understand your organization for planning and funding.
            Self-reported status is private until reviewed. It does not verify nonprofit recognition or tax-deductibility.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Which organization does this status describe?">
              <Select value={host.nonprofitSubject??"responsible"}
                onChange={event=>setHost(current=>({...current,
                  nonprofitSubject:event.target.value as NonNullable<SiteHostingV61["nonprofitSubject"]>}))}>
                <option value="responsible">Your responsible organization</option>
                <option value="host">The hosting organization</option>
                <option value="sponsor">A fiscal sponsor</option>
              </Select>
            </Field>
            <Field label="Tax-exempt status">
              <Select value={host.nonprofitStatus??"not_provided"}
                onChange={event=>setHost(current=>({...current,
                  nonprofitStatus:event.target.value as NonNullable<SiteHostingV61["nonprofitStatus"]>}))}>
                <option value="not_provided">Not provided</option>
                <option value="recognized_501c3">IRS-recognized 501(c)(3)</option>
                <option value="qualifying_church">Qualifying church or religious organization</option>
                <option value="group_exemption">Covered by a group exemption</option>
                <option value="fiscal_sponsor">Operating under a fiscal sponsor</option>
                <option value="pending">Recognition/application pending</option>
                <option value="not_tax_exempt">Not tax-exempt</option>
                <option value="unsure">Unsure</option>
              </Select>
            </Field>
            {host.nonprofitStatus&&host.nonprofitStatus!=="not_provided"&&
              <Field label="Legal organization name (if different)">
                <Input maxLength={160} value={host.nonprofitOrganizationName??""}
                  onChange={event=>setHost(current=>({...current,
                    nonprofitOrganizationName:event.target.value}))}/>
              </Field>}
            {host.nonprofitStatus&&host.nonprofitStatus!=="not_provided"&&
              <Field label="Employer Identification Number (EIN, optional)">
                <Input placeholder="XX-XXXXXXX" maxLength={10} value={host.nonprofitEin??""}
                  onChange={event=>setHost(current=>({...current,
                    nonprofitEin:event.target.value}))}/>
              </Field>}
          </div>
        </fieldset>
      </div>
    </WorkspacePanel>}
    {step === 1 && <WorkspacePanel id="site-information-step-1" title="How People Participate"
      description="Will people join in person, online or both?">
      <div className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">How will people participate?</legend>
          <div className="grid gap-2 lg:grid-cols-3">
            <SelectionCard kind="radio" name="site-delivery" title="In person" detail="At a physical location"
              checked={environment.delivery === "physical"} onChange={() => setEnvironment(current => ({ ...current, delivery: "physical" }))} />
            <SelectionCard kind="radio" name="site-delivery" title="Online" detail="Join from anywhere with an internet connection"
              checked={environment.delivery === "digital"} onChange={() => setEnvironment(current => ({ ...current, delivery: "digital" }))} />
            <SelectionCard kind="radio" name="site-delivery" title="Both" detail="In person and online"
              checked={environment.delivery === "both"} onChange={() => setEnvironment(current => ({ ...current, delivery: "both" }))} />
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
        <WorkspaceNotice>Your address is managed in <a className="font-semibold underline" href={"/launch/site?siteId=" + encodeURIComponent(siteId) + "&module=site-profile"}>Site Profile</a>. Facilities, staffing, schedules, equipment and approvals are established during Prepare, based on the Solutions selected.</WorkspaceNotice>
      </div>
    </WorkspacePanel>}
    {step === 2 && <WorkspacePanel id="site-information-step-2" title="Network Affiliation"
      description="Optional. Select a network or continue independently.">
      <div className="space-y-5">
        <fieldset className="space-y-3"><legend className="text-sm font-semibold">Would you like to explore network affiliation?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <SelectionCard kind="radio" name="site-network" title="Not at this time" detail="Continue independently"
              checked={networkChoice === "independent"} onChange={() => setNetworkChoice("independent")} />
            <SelectionCard kind="radio" name="site-network" title="Explore or request affiliation" detail="Review eligible networks and request approval"
              checked={networkChoice === "request"} onChange={() => setNetworkChoice("request")} />
          </div>
        </fieldset>
        {networkChoice === "request" && <SiteAffiliationPanel siteId={siteId} />}
      </div>
    </WorkspacePanel>}
    {step === 3 && <WorkspacePanel id="site-information-step-3" title="Purpose & Story"
      description={identityContext.storyPrompt}>
      <div className="space-y-6">
        <p className="text-xs text-muted-foreground">Your answers can help shape your website and outreach. You'll review any suggested wording before using it. Please don't share private details about others.</p>
        <MultiChoice title="1. What inspires this work?" hint="Choose up to three motivations. Optional."
          options={motivations} selected={story.motivations} max={3} onChange={selected => updateMulti("motivations", selected)} />
        <Field label="2. What need are you hoping to address?" description="Describe the challenge or opportunity. Please leave out private information about participants.">
          <Textarea rows={3} maxLength={1000} value={story.communityNeed}
            onChange={event => setStory(current => ({ ...current, communityNeed: event.target.value }))} /></Field>
        <MultiChoice title="3. What makes your approach distinctive?" hint="Choose up to three."
          options={storyDistinctives} selected={story.distinctives} onChange={selected => updateMulti("distinctives", selected)} />
        <Field label="4. How did your vision begin?" >
          <Textarea rows={3} maxLength={2000} value={story.foundingStory}
            onChange={event => setStory(current => ({ ...current, foundingStory: event.target.value }))} /></Field>
        <MultiChoice title="5. What values matter most?" hint="Select what you want reflected in your messaging."
          options={values} selected={story.values} onChange={selected => updateMulti("values", selected)} />
        <MultiChoice title="6. What do you hope participants experience?" hint="Select aspirations, not promised outcomes."
          options={experiences} selected={story.experiences} onChange={selected => updateMulti("experiences", selected)} />
        <Field label="7. What do you hope to build over time?">
          <Textarea rows={4} maxLength={2000} value={story.futureVision}
            onChange={event => setStory(current => ({ ...current, futureVision: event.target.value }))} /></Field>
      </div>
    </WorkspacePanel>}
    </div>
    </GuidedSetupShell>
    {error && <WorkspaceNotice tone={reloadRequired ? "attention" : "danger"}>{error}
      {reloadRequired && <span className="block">A save may have succeeded. Reload this Site to reconcile the current record before retrying.</span>}
    </WorkspaceNotice>}
    {reloadRequired && <Button type="button" variant="outline" onClick={() => {
      releaseNavigation();
      window.location.reload();
    }}>Reload Site and review saved answers</Button>}
    <footer aria-label="Site Information actions">
      <ActionFooter layout="step">
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
