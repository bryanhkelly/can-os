/** Only the canonical Site brand reader may resolve school email branding.
 * Branding is optional decoration, never authentication or sender authority. */
export async function readOptionalEmailBrand(
  siteId: string | undefined,
  source: "access-email" | "notification-email",
) {
  if (!siteId) return null;
  try {
    const { readSchoolBrand } = await import("@/modules/sites/school-brand.server");
    return await readSchoolBrand(siteId);
  } catch {
    console.warn("[" + source + "] School branding unavailable; using CAN branding");
    return null;
  }
}
