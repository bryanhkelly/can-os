/**
 * Server-only contract for Academic Credential Release (Agent B).
 * The caller must independently authorize a verified recipient and exact
 * issuer/student/credential grant. Run within the SAME database transaction
 * as release authorization or the private PDF download; do not expose as RPC.
 *
 * Agent B should import assertDiplomaFreshForAuthorizedRelease from this module,
 * call it for diploma kind at grant creation AND on EVERY recipient download,
 * and keep diploma/external-school release disabled until verified end-to-end.
 */
export { assertDiplomaFreshForAuthorizedRelease } from "./graduation.functions";
