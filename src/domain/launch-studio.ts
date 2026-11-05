import { z } from "zod";
import { siteProgramSelectionSchema, optionalSearchString } from "@/lib/route-search";

export const schoolLaunchSteps = ["welcome", "school", "academics", "website", "families", "readiness", "next"] as const;
export const schoolLaunchSearch = siteProgramSelectionSchema.extend({
  step: z.enum(schoolLaunchSteps).catch("welcome").optional(),
});
export const familyLaunchSearch = siteProgramSelectionSchema.pick({ programId: true }).extend({
  familyStart: optionalSearchString,
  application: optionalSearchString,
  step: z.enum(["welcome", "application", "documents", "next"]).catch("welcome").optional(),
});
export const studentLaunchSearch = z.object({
  step: z.enum(["welcome", "profile", "courses", "next"]).catch("welcome").optional(),
});
export const staffLaunchSearch = z.object({
  step: z.enum(["welcome", "details", "qualifications", "next"]).catch("welcome").optional(),
});

export function isLaunchStudioPath(pathname: string) {
  const path = pathname.replace(/\/$/, "");
  return path === "/launch" || path.startsWith("/launch/");
}

export function launchRequirementProgress(requirements: readonly { status: string }[]) {
  if (!requirements.length) return undefined;
  return { complete: requirements.filter(item => item.status === "complete").length, total: requirements.length };
}
