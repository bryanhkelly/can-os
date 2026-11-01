/**
 * Internal-only live credential source freshness checks (Agent A ownership).
 *
 * Agent B MUST additionally verify institutional authority, recipient identity,
 * consent, instructions, unexpired/unrevoked exact credential grant and purpose.
 * These functions MUST run inside the same DB transaction as grant creation or
 * authenticated private PDF preparation, never as browser/server functions.
 *
 * Both checks fail closed and hold source-row locks until that transaction ends.
 */
export {
 assertDiplomaFreshForAuthorizedRelease,
 assertOfficialTranscriptFreshForAuthorizedRelease,
} from "./graduation.functions";
