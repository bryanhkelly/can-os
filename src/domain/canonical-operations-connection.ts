/** The delegated CAN catalog/Blueprint SQL roles must never be selected
 * from a database owner or the dedicated read-only auth connection. */
export function canonicalOperationsUrlValid(
  operationsUrl: string | undefined,
  generalDatabaseUrl: string | undefined,
  canonicalAuthUrl?: string,
): boolean {
  if (!operationsUrl || !generalDatabaseUrl ||
      operationsUrl === generalDatabaseUrl ||
      operationsUrl === canonicalAuthUrl) return false;
  try {
    const ops = new URL(operationsUrl);
    const primary = new URL(generalDatabaseUrl);
    const neonEndpoint = (hostname: string) =>
      hostname.toLowerCase().replace(/-pooler(?=\.)/, "");
    return ["postgresql:", "postgres:"].includes(ops.protocol) &&
      ops.protocol === primary.protocol &&
      ops.username === "can_os_canonical_ops_app" &&
      primary.username !== ops.username &&
      ops.password.length > 0 &&
      ops.hostname.length > 0 &&
      neonEndpoint(ops.hostname) === neonEndpoint(primary.hostname) &&
      ops.port === primary.port &&
      ops.pathname === primary.pathname &&
      ops.pathname !== "/" &&
      !["user", "role", "options", "search_path"].some(key =>
        ops.searchParams.has(key));
  } catch {
    return false;
  }
}
