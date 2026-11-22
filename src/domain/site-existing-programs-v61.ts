import { programTypeLabels, type ProgramType } from "./program-offerings";

/**
 * Exact-Site, read-only canonical Program records. This is what the Site has,
 * not what a registrar might select in Establish and not a Solution adoption.
 * Neither lifecycle status nor synthetic provenance confers opening authority.
 */
export type ExistingSiteProgramV61 = {
  id: string;
  name: string;
  type: ProgramType;
  status: "draft" | "launching" | "ready" | "active" | "paused" | "closed";
  gradeRange: { min: string; max: string };
  deliveryModel: {
    onsite?: boolean;
    asynchronous?: boolean;
    liveOnline?: boolean;
    onsiteDaysPerWeek?: number;
  };
};

export type ExistingSiteProgramsStateV61 =
  | { state: "ready"; programs: readonly ExistingSiteProgramV61[];
      visibility?: "whole_site" | "assigned" }
  | { state: "unavailable" };

const statusLabels: Record<ExistingSiteProgramV61["status"], string> = {
  active: "Active",
  ready: "Ready",
  launching: "Launching",
  draft: "Draft",
  paused: "Paused",
  closed: "Closed",
};

export function existingSiteProgramPresentation(program: ExistingSiteProgramV61) {
  const delivery = [
    program.deliveryModel.onsite ? "Onsite" : null,
    program.deliveryModel.liveOnline ? "Live online" : null,
    program.deliveryModel.asynchronous ? "Self-paced online" : null,
  ].filter((value): value is string => value !== null);
  const min = program.gradeRange.min?.trim();
  const max = program.gradeRange.max?.trim();
  return {
    typeLabel: programTypeLabels[program.type],
    statusLabel: statusLabels[program.status],
    detail: [
      min && max ? `Grades ${min}–${max}` : null,
      ...delivery,
    ].filter(Boolean).join(" · "),
  };
}
