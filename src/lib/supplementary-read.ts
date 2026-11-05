import { classifyLoaderError } from "./safe-loader";

export type SupplementaryRead<T> =
  | { state: "ready" | "empty"; data: T }
  | { state: "unavailable" | "unauthorized"; data: null };

export async function supplementaryRead<T>(load: () => Promise<T>, empty: (data: T) => boolean): Promise<SupplementaryRead<T>> {
  try {
    const data = await load();
    return { state: empty(data) ? "empty" : "ready", data };
  } catch (error) {
    const { kind } = classifyLoaderError(error);
    return { state: kind === "authorization" || kind === "authentication" ? "unauthorized" : "unavailable", data: null };
  }
}

export type LaunchReadStates = Record<"preparationPrograms" | "familyInvitations" | "admissionsCounts" |
  "enrollmentCounts" | "extendedPlanning" | "jurisdictionGuidance" | "jurisdictionResearch", SupplementaryRead<unknown>["state"]>;

export const launchMilestoneReads = {
  configuration: ["jurisdictionGuidance", "jurisdictionResearch"],
  outreach: ["familyInvitations"],
  enrollment: ["admissionsCounts", "enrollmentCounts"],
  opening: ["jurisdictionGuidance", "jurisdictionResearch", "enrollmentCounts"],
} as const satisfies Record<string, readonly (keyof LaunchReadStates)[]>;

export function launchMilestoneAvailable(states: LaunchReadStates, milestone: keyof typeof launchMilestoneReads) {
  return launchMilestoneReads[milestone].every(key => states[key] === "ready" || states[key] === "empty");
}