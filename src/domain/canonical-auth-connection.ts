/**
 * Native CAN OS auth must use a dedicated restricted LOGIN, never the schema
 * owner or a reused application/general data URL. No secrets are logged.
 */
export function canonicalRestrictedAuthUrlValid(
  authUrl: string | undefined,
  generalDatabaseUrl?: string,
): boolean {
  if (!authUrl || (generalDatabaseUrl && authUrl === generalDatabaseUrl))
    return false;
  try {
    const target = new URL(authUrl);
    return ["postgresql:", "postgres:"].includes(target.protocol) &&
      target.username === "can_os_canonical_auth_app" &&
      target.password.length > 0 &&
      target.hostname.length > 0 &&
      !target.searchParams.has("user") &&
      !target.searchParams.has("role") &&
      !target.searchParams.has("options");
  } catch {
    return false;
  }
}
