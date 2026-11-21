import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GuidedSetupShell } from "@/components/workflow";
import { ActionFooter, SelectionCard, WorkspaceNotice } from "@/components/workspace";
import {
  reconcileSiteExperienceAssociationsV61, siteProgramsAudiencesV61SaveSchema, type SiteProgramsAudiencesV61,
} from "@/domain/site-launch-preferences";
import { saveSiteProgramsAudiencesV61 } from "@/modules/programs/site-programs-audiences-v61.functions";
import { exploreBlueprintReferenceCatalog } from "@/modules/blueprints/blueprint-reference-catalog.functions";
import type { BlueprintReferenceCatalogItem } from "@/domain/blueprint-reference-catalog";
import { academyReferenceMayBeSelected, schoolYearInterestMayBeSelected,
  noSchoolYearAvailability, type SchoolYearAvailability } from "@/domain/site-program-access-v61";
import { useLaunchUnsavedChanges } from "./useLaunchUnsavedChanges";
import { LaunchGuidancePanels } from "./LaunchGuidancePanels";
import { EstablishExperiencesV61, type ExperiencesStageV61 } from "./EstablishExperiencesV61";

type InternalStep = 0 | 1 | 2;
type InterestId = SiteProgramsAudiencesV61["interestIds"][number];
type TimingId = SiteProgramsAudiencesV61["timingIds"][number];
type AudienceId = SiteProgramsAudiencesV61["audienceIds"][number];

export type ProgramsAudiencesV61Initial = {
  siteId: string;
  revision: string;
  intent: SiteProgramsAudiencesV61;
  saved: boolean;
  schoolYearAvailability?: SchoolYearAvailability;
};

const interests = [
  { id: "grades-6-8", label: "Grades 6–8", detail: "Middle school learning", icon: "▤" },
  { id: "grades-9-12", label: "Grades 9–12", detail: "High school learning", icon: "▥" },
  { id: "afterschool", label: "After-school", detail: "Enrichment and support", icon: "☼" },
  { id: "summer", label: "Summer & Breaks", detail: "Seasonal experiences", icon: "✳" },
  { id: "adult", label: "Adult Learning", detail: "Skills and lifelong learning", icon: "⌘" },
  { id: "senior", label: "Older Adult Learning", detail: "Learning and connection", icon: "♧" },
] as const;
const days = [
  { id: "weekdays", label: "Weekdays", detail: "Monday through Friday" },
  { id: "weekends", label: "Weekends", detail: "Saturday and/or Sunday" },
] as const;
const times = [
  { id: "daytime", label: "Daytime", detail: "Morning, afternoon, or full day" },
  { id: "evenings", label: "Evenings", detail: "After-work or evening learning" },
] as const;
const audienceChoices = [
  { id: "children", label: "Children", detail: "Elementary-age learners" },
  { id: "teens", label: "Teens", detail: "Middle and high school ages" },
  { id: "adults", label: "Adults", detail: "Career skills and enrichment" },
  { id: "older_adults", label: "Older adults", detail: "Lifelong learning and community" },
] as const;

const guidance = [
  {
    why: "Choose the learning experiences you want to offer.",
    tip: "Select any days and times that interest you.",
    next: "Choose your audiences next.",
  },
  {
    why: "Choose who you hope to serve.",
    next: "Choose the experiences that bring your vision to life.",
  },
  {
    why: "Explore possible experiences across the Programs and audiences you chose.",
    tip: "These are planning interests, not confirmed services or enrollment offers.",
    next: "Save your choices and continue to Website & Brand.",
  },
] as const;

export function ProgramsAudiencesV61Guidance({ step }: { step: InternalStep }) {
  return <LaunchGuidancePanels guidance={guidance[step]} />;
}

export function EstablishProgramsAudiencesV61({ siteId, initial,
  onBackToSiteInformation, onSaveAndExit, onContinueToWebsiteBrand, onInternalStepChange,
}: {
  siteId: string;
  initial: ProgramsAudiencesV61Initial;
  onBackToSiteInformation: () => void;
  onSaveAndExit: () => Promise<void>;
  onContinueToWebsiteBrand: () => void;
  onInternalStepChange?: (step: InternalStep) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<InternalStep>(0);
  const [experienceStage,setExperienceStage]=useState<ExperiencesStageV61>("choose");
  const schoolYearAvailability = initial.schoolYearAvailability ?? noSchoolYearAvailability;
  const [draft, setDraft] = useState<SiteProgramsAudiencesV61>(() => ({
    interestIds: [...initial.intent.interestIds],
    timingIds: [...initial.intent.timingIds],
    audienceIds: [...initial.intent.audienceIds],
    startingFocus: initial.intent.startingFocus,
    ...(initial.intent.programCodes !== undefined
      ? { programCodes: [...initial.intent.programCodes] } : {}),
    ...(initial.intent.startingProgramCode !== undefined
      ? { startingProgramCode: initial.intent.startingProgramCode } : {}),
    ...(initial.intent.experienceIds !== undefined
      ? { experienceIds: [...initial.intent.experienceIds] } : {}),
    ...(initial.intent.customExperiences !== undefined
      ? { customExperiences: [...initial.intent.customExperiences] } : {}),
    ...(initial.intent.experienceDetails !== undefined
      ? { experienceDetails: initial.intent.experienceDetails.map(detail=>({
        ...detail,activityIds:[...detail.activityIds],outcomeIds:[...detail.outcomeIds],
        audienceIds:[...detail.audienceIds],programIds:[...detail.programIds],
      })) } : {}),
  }));
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(initial.intent));
  const [busy, setBusy] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [error, setError] = useState("");
  const [programCatalog, setProgramCatalog] = useState<BlueprintReferenceCatalogItem[] | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogReload, setCatalogReload] = useState(0);
  const revision = useRef(initial.revision);
  const saving = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const firstStepRender = useRef(true);
  const dirty = JSON.stringify(draft) !== savedSnapshot;
  const selectedExperienceCount=(draft.experienceIds?.length??0)+(draft.customExperiences?.length??0);
  const releaseNavigation = useLaunchUnsavedChanges(() => dirty || saving.current,
    "Leave Programs & Audiences? Unsaved Site planning choices will be lost.");
  useEffect(() => {
    if (firstStepRender.current) { firstStepRender.current = false; return; }
    panel.current?.focus();
  }, [step]);
  useEffect(() => {
    let current = true;
    setProgramCatalog(null);
    setCatalogError("");
    void exploreBlueprintReferenceCatalog({ data: { siteId } })
      .then(items => { if (current) setProgramCatalog(items.filter(item => item.kind === "program_model")); })
      .catch(() => { if (current) setCatalogError("The published Program catalog is unavailable for this Site."); });
    return () => { current = false; };
  }, [siteId, catalogReload]);

  function selectStep(next: InternalStep) {
    if (saving.current) return;
    setStep(next);
    setError("");
    onInternalStepChange?.(next);
  }
  function toggleInterest(id: InterestId, checked: boolean) {
    setDraft(current => {
      const interestIds = checked
        ? [...new Set([...current.interestIds, id])]
        : current.interestIds.filter(value => value !== id);
      return reconcileSiteExperienceAssociationsV61({ ...current, interestIds,
        startingFocus: current.startingFocus && !interestIds.includes(current.startingFocus)
          ? null : current.startingFocus });
    });
  }
  function toggleProgram(code: string, checked: boolean) {
    setDraft(current => {
      const programCodes = checked
        ? [...new Set([...(current.programCodes ?? []), code])]
        : (current.programCodes ?? []).filter(item => item !== code);
      return reconcileSiteExperienceAssociationsV61({ ...current, programCodes,
        startingProgramCode: current.startingProgramCode && !programCodes.includes(current.startingProgramCode)
          ? null : current.startingProgramCode ?? null });
    });
  }
  function toggleTiming(id: TimingId, checked: boolean) {
    setDraft(current => ({ ...current, timingIds: checked
      ? [...new Set([...current.timingIds, id])] : current.timingIds.filter(value => value !== id) }));
  }
  function toggleAudience(id: AudienceId, checked: boolean) {
    setDraft(current => reconcileSiteExperienceAssociationsV61({ ...current,
      audienceIds: checked ? [...new Set([...current.audienceIds, id])]
        : current.audienceIds.filter(value => value !== id) }));
  }

  async function save(exit: boolean) {
    if (saving.current || reloadRequired) return;
    const checked = siteProgramsAudiencesV61SaveSchema.safeParse(draft);
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? "Review your planning choices.");
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    let submitted = false;
    try {
      submitted = true;
      const result = await saveSiteProgramsAudiencesV61({ data: {
        siteId, expectedRevision: revision.current, intent: checked.data,
      } });
      if (result.siteId !== siteId || !result.revision)
        throw new Error("The Site save could not be verified. Reload before trying again.");
      revision.current = result.revision;
      setSavedSnapshot(JSON.stringify(checked.data));
      // Refresh authorized Site context and preview source before navigation.
      await router.invalidate();
      releaseNavigation();
      if (exit) {
        try { await onSaveAndExit(); }
        catch (failure) {
          setError(failure instanceof Error ? failure.message :
            "Changes saved, but sign-out failed. Use the Account menu to sign out.");
        }
      }
      else onContinueToWebsiteBrand();
    } catch (cause) {
      if (submitted) setReloadRequired(true); // Avoid blind replay after an uncertain commit.
      setError(cause instanceof Error ? cause.message :
        "Unable to save Site planning. Reload and review before retrying.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const programs = programCatalog ?? [];
  // Preserve historical selections until the operator removes them explicitly.
  // A retired entry is absent from the active catalog, so it cannot render
  // through the regular published Program choices.
  const unavailablePrograms = programCatalog
    ? (draft.programCodes ?? []).filter(code => !programs.some(item => item.code === code))
    : [];
  const disabled = busy || reloadRequired;
  const sections = [
    { id: "interests", title: "Programs", description: "What you want to offer",
      status: step === 0 ? "current" as const : "upcoming" as const },
    { id: "audiences", title: "Audiences", description: "Who you want to reach",
      status: step === 1 ? "current" as const : "upcoming" as const },
    { id: "experiences", title: "Experiences", description: "What people could do and enjoy",
      status: step === 2 ? "current" as const : "upcoming" as const },
  ];
  return <section aria-label="Programs & Audiences" className="min-w-0 space-y-5">
    <GuidedSetupShell title={step === 0 ? "What would you like to offer?" :
      step === 1 ? "Who do you hope to serve?" : "What experiences interest you?"}
      description={step === 0
        ? "Choose the Programs and learning ideas you want to explore."
        : step === 1 ? "Choose the people you hope to serve."
        : "Imagine what people could learn, do or enjoy. Details and approvals come later in Prepare."}
      steps={sections} onStepChange={id => selectStep(id === "interests" ? 0 : id === "audiences" ? 1 : 2)} navigationDisabled={disabled}>
      <div ref={panel} tabIndex={-1} role="region" aria-label={step === 0 ? "Program Interests" : step === 1 ? "Your Audiences" : "Experiences"}
        className="min-w-0 space-y-5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {step === 0 ? <>
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold">Which Programs or learning ideas are you considering?</legend>
          <p className="text-xs leading-5 text-muted-foreground">
            Select what interests you. You'll choose the details in Prepare.
          </p>
          <h3 className="text-sm font-semibold">Published Program ideas</h3>
          {!programCatalog && !catalogError && <p role="status" className="text-sm text-muted-foreground">Loading available Programs…</p>}
          {catalogError && <div role="alert" className="space-y-2 border p-3 text-sm">
            <p>{catalogError}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => setCatalogReload(n => n + 1)}>Retry Program catalog</Button>
          </div>}
          {programCatalog && <div className="grid gap-3 sm:grid-cols-2">
            {programs.map(item => {
              const schoolYearBlocked = !academyReferenceMayBeSelected(item,schoolYearAvailability);
              const selected = draft.programCodes?.includes(item.code) ?? false;
              return <div key={item.code} className="min-w-0 space-y-1">
                <SelectionCard kind="checkbox"
                  value={item.code} title={item.title}
                  detail={<>{item.summary}{schoolYearBlocked && <span className="mt-2 block font-medium">
                    Currently unavailable
                  </span>}</>}
                  checked={selected} disabled={disabled || schoolYearBlocked}
                  onChange={checked => toggleProgram(item.code, checked)} />
                {schoolYearBlocked && selected && <Button type="button" size="sm"
                    variant="outline" disabled={disabled} onClick={() => toggleProgram(item.code,false)}>
                    Remove previously selected school-year Program
                  </Button>}
              </div>;
            })}
          </div>}
          {programCatalog && programs.length === 0 && <p className="text-sm text-muted-foreground">No Programs available.</p>}
          {unavailablePrograms.length > 0 && <WorkspaceNotice tone="attention">
            <p>These saved Programs are no longer available. Remove any you no longer need.</p>
            <ul className="mt-3 space-y-2" aria-label="Unavailable selected Programs">
              {unavailablePrograms.map(code => <li key={code}
                className="flex flex-wrap items-center justify-between gap-3 border bg-background p-3">
                <span className="min-w-0 break-all text-sm font-medium">{code}</span>
                <Button type="button" size="sm" variant="outline" disabled={disabled}
                  aria-label={"Remove unavailable Program " + code}
                  onClick={() => toggleProgram(code, false)}>
                  Remove reference
                </Button>
              </li>)}
            </ul>
          </WorkspaceNotice>}
          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">Other learning ideas</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {interests.map(choice => {
                const schoolYearBlocked = !schoolYearInterestMayBeSelected(choice.id,schoolYearAvailability);
                const selected = draft.interestIds.includes(choice.id);
                return <div key={choice.id} className="min-w-0 space-y-1">
                  <SelectionCard kind="checkbox"
                    value={choice.id} title={choice.label}
                    detail={<>{choice.detail}{schoolYearBlocked && <span className="mt-2 block font-medium">
                      Currently unavailable
                    </span>}</>} icon={choice.icon}
                    checked={selected} disabled={disabled || schoolYearBlocked}
                    onChange={checked => toggleInterest(choice.id, checked)} />
                  {schoolYearBlocked && selected && <Button type="button" size="sm"
                      variant="outline" disabled={disabled} onClick={() => toggleInterest(choice.id,false)}>
                      Remove previously selected interest
                    </Button>}
                </div>;
              })}
            </div>
          </div>
        </fieldset>
        <section aria-labelledby="pa-timing-title" className="space-y-3 border-t pt-5">
          <h3 id="pa-timing-title" className="text-sm font-semibold">When might you offer learning? <span className="font-normal text-muted-foreground">(optional)</span></h3>
          <p className="text-xs leading-5 text-muted-foreground">Select the days and times you're considering.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[{ title: "Days", options: days }, { title: "Time of day", options: times }].map(group =>
              <fieldset key={group.title} className="min-w-0 border p-3">
                <legend className="px-2 text-sm font-semibold">{group.title}</legend>
                <div className="space-y-2">
                  {group.options.map(choice => <SelectionCard key={choice.id} kind="checkbox"
                    value={choice.id} title={choice.label} detail={choice.detail} compact className="min-h-16"
                    checked={draft.timingIds.includes(choice.id)} disabled={disabled}
                    onChange={checked => toggleTiming(choice.id, checked)} />)}
                </div>
              </fieldset>)}
          </div>
        </section>
      </> : step === 1 ? <>
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Who do you hope to serve? <span className="font-normal text-muted-foreground">(optional)</span></legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {audienceChoices.map(choice => <SelectionCard key={choice.id} kind="checkbox"
              value={choice.id} title={choice.label} detail={choice.detail} className="min-h-24"
              checked={draft.audienceIds.includes(choice.id)} disabled={disabled}
              onChange={checked => toggleAudience(choice.id, checked)} />)}
          </div>
        </fieldset>
      </> : <>
        <EstablishExperiencesV61 draft={draft} setDraft={setDraft} disabled={disabled}
          programCatalog={programs} stage={experienceStage} onStageChange={setExperienceStage}/>
      </>}
      </div>
    </GuidedSetupShell>
    {error && <WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
    {reloadRequired && <>
      <WorkspaceNotice tone="attention">
        The server may have saved your last request. Review your entries, then reload to reconcile the latest Site version before another save.
      </WorkspaceNotice>
      <Button type="button" variant="outline" onClick={() => {
        releaseNavigation();
        window.location.reload();
      }}>Reload Site and review saved choices</Button>
    </>}
    <footer aria-label="Programs & Audiences actions">
      <ActionFooter layout="step">
      <Button variant="outline" disabled={busy} onClick={() => {
        if(step===2&&experienceStage==="personalize")setExperienceStage("choose");
        else if(step===0)onBackToSiteInformation();
        else selectStep((step-1) as InternalStep);
      }}>
        <ArrowLeft aria-hidden="true"/>
        {step===2&&experienceStage==="personalize"?"Back to Explore Topics":
          step===0?"Back to Site Information":"Previous step"}
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" disabled={disabled} onClick={() => void save(true)}>Save & Sign Out</Button>
        {step!==2
          ? <Button disabled={disabled} onClick={() => selectStep((step+1) as InternalStep)}>
              Continue to {step===0?"Audiences":"Experiences"} <ArrowRight aria-hidden="true"/>
            </Button>
          : experienceStage==="choose"&&selectedExperienceCount>0
            ? <Button disabled={disabled||selectedExperienceCount>5}
                onClick={()=>setExperienceStage("personalize")}>
                Make these Experiences yours <ArrowRight aria-hidden="true"/>
              </Button>
            : <Button loading={busy} disabled={disabled||selectedExperienceCount>5}
                onClick={()=>void save(false)}>
                {experienceStage==="choose"?"Save & Continue without Experiences":"Save & Continue to Website & Brand"}
                <ArrowRight aria-hidden="true"/>
              </Button>}
      </div>
      </ActionFooter>
    </footer>
  </section>;
}
