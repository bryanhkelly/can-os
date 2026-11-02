export function hasRegistrarAuthority(role: string | undefined): boolean {
  return role === "registrar" || role === "site_admin";
}

/** Role inheritance never changes capabilities, scope or relationship checks. */
export function rolesAllow(allowed: readonly string[], actual: string | undefined): boolean {
  return actual !== undefined && (allowed.includes(actual) ||
    (actual === "site_admin" && allowed.includes("registrar")));
}
