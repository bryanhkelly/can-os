/** Shared, dependency-light policy for institutionally governed public claims. */
const protectedClaims = [
  /\bacc?redit(?:ed|ation|ing)?\b/i,
  /\b(?:school of record|credit issu(?:er|ing)|official transcript|diploma|graduation requirements)\b/i,
  /\b(?:tuition|school fees?|financial aid|scholarship guarantee|payment plan)\b/i,
  /\b(?:admissions? (?:are |is )?open|enrollment (?:is |now )?open|guaranteed (?:admission|enrollment|seat))\b/i,
  /\b(?:state[- ]licensed school|certified high school|official CAN curriculum|CAN[- ]approved)\b/i,
  /\b(?:official(?:ly)? (?:endorsed|recognized|affiliated) by (?:a |the )?denomination)\b/i,
  /\b(?:only (?:accept|admit|enroll) (?:children|students|families) who)\b/i,
  /\b(?:only|never|do not|won't)\s+(?:admit|accept|enroll)\b/i,
  /\b(?:school admissions policy|academic admission requirement|CAN(?: Academy| OS)?(?:'s)? official (?:faith|theology|doctrine))\b/i,
];
/** Institutional and admissions claims must use authoritative approved facts. */
export function containsProtectedInstitutionalClaim(text: string): boolean {
  return protectedClaims.some(rule => rule.test(text));
}

