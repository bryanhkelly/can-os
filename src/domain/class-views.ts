import { AuthorizationError } from "./command-context";

export const classViews = ["learn", "teach", "manage"] as const;
export type ClassView = typeof classViews[number];
export const classTabs = {
  learn: ["lessons", "assignments", "progress", "sessions"] as const,
  teach: ["overview", "lessons", "classroom", "roster"] as const,
  manage: ["overview", "offering", "roster", "sessions", "reports"] as const,
};
export type ClassTab = (typeof classTabs)[ClassView][number];
export type ClassPermissions = {
  learn: boolean;
  teach: boolean;
  manage: boolean;
};
export function permittedClassViews(permitted: ClassPermissions): ClassView[] {
  return classViews.filter(view => permitted[view]);
}
/** A URL view changes presentation ONLY. It cannot grant an unverified role.
 * A person with multiple current Class relationships may switch views. */
export function selectClassView(
  requested: ClassView | undefined, permitted: ClassPermissions,
): ClassView {
  const available = permittedClassViews(permitted);
  if (!available.length) throw new AuthorizationError("current relationship to this Class");
  if (requested) {
    if (!permitted[requested]) throw new AuthorizationError("requested Class view");
    return requested;
  }
  return available[0]!;
}
export function selectClassTab(
  view: ClassView, requested?: string,
): (typeof classTabs)[typeof view][number] {
  if (requested && !classTabs[view].some(tab => tab === requested)) {
    throw new AuthorizationError("requested Class tab for authorized view");
  }
  return (requested ?? classTabs[view][0]) as (typeof classTabs)[typeof view][number];
}
