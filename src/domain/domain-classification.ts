/** Domain classification is not authentication or authorization. */
export function isDemoDomain(domain: string | null | undefined): boolean {
  const normalized=domain?.trim().toLowerCase();
  return !!normalized && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.demo$/.test(normalized);
}
