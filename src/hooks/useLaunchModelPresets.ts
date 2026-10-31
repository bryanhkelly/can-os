import type { SchoolModelPreset, ExtendedLearningPreset } from "@/components/operations/LaunchSchoolModelPicker";
import { programTypes } from "@/domain/program-offerings";

type ProgramType = (typeof programTypes)[number];

export function useLaunchModelPresets(setters: {
  setType: (value: ProgramType) => void;
  setGradeMin: (value: string) => void;
  setGradeMax: (value: string) => void;
  setOnsite: (value: boolean) => void;
  setOnsiteDaysPerWeek: (value: string) => void;
  setAsynchronous: (value: boolean) => void;
  setLiveOnline: (value: boolean) => void;
  setSummerCreditBearing: (value: boolean) => void;
}) {
  const {setType,setGradeMin,setGradeMax,setOnsite,setOnsiteDaysPerWeek,setAsynchronous,setLiveOnline,setSummerCreditBearing}=setters;
  function applySchoolModelPreset(model:SchoolModelPreset) {
    const presets={
      elementary:{type:"church_hosted_academy",min:"K",max:"5",days:"5",async:false},
      middle:{type:"church_hosted_academy",min:"6",max:"8",days:"5",async:false},
      high:{type:"church_hosted_academy",min:"9",max:"12",days:"5",async:false},
      k12:{type:"full_school",min:"K",max:"12",days:"5",async:false},
      micro:{type:"microschool",min:"K",max:"8",days:"4",async:true},
      hybrid:{type:"hybrid_program",min:"6",max:"12",days:"2",async:true},
    } as const;
    const choice=presets[model];
    setType(choice.type);setGradeMin(choice.min);setGradeMax(choice.max);
    setSummerCreditBearing(false);
    setOnsite(true);setOnsiteDaysPerWeek(choice.days);setAsynchronous(choice.async);setLiveOnline(false);
  }
  function applyNinthGradeHybridPreset(){
    // Explicit form proposal only. No accreditation, staffing, credit issuer,
    // timetable, attendance or regulatory readiness is silently accepted.
    setSummerCreditBearing(false);
    setType("high_school_extension");
    setGradeMin("9");setGradeMax("9");
    setOnsite(true);setOnsiteDaysPerWeek("2");
    setAsynchronous(true);setLiveOnline(false);
  }
  function applyExtendedLearningPreset(offering: ExtendedLearningPreset) {
    setType(offering);
    setSummerCreditBearing(false);
    setGradeMin("K"); setGradeMax("12");
    setOnsite(true); setAsynchronous(false); setLiveOnline(false);
    setOnsiteDaysPerWeek(offering === "after_school_enrichment" ? "3" : "5");
  }

  return {applySchoolModelPreset,applyNinthGradeHybridPreset,applyExtendedLearningPreset};
}
