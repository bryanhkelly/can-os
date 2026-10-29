/**
 * Suggest a launch slug from the school name so a church leader does not
 * have to invent kebab-case. Suggestion only: the form field stays editable
 * and server validation remains authoritative.
 */
export function suggestedLaunchSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    // Strip combining diacritical marks left over from NFKD decomposition.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
