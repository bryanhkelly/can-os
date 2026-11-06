import type { ProgramType } from "@/domain/program-offerings";

export function useLaunchModelPresets(setters: {
  setType: (value: ProgramType) => void;
  setSummerCreditBearing: (value: boolean) => void;
}) {
  function applyProgramType(type: ProgramType) {
    setters.setType(type);
    if (type !== "summer_program") setters.setSummerCreditBearing(false);
  }

  return {
    applyProgramType,
    applySchoolModelPreset: applyProgramType,
    applyNinthGradeHybridPreset: () => applyProgramType("high_school_extension"),
    applyExtendedLearningPreset: (type: ProgramType) => applyProgramType(type),
  };
}
