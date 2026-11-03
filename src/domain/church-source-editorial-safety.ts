import {
  classifySiteLocalContent, emptySiteLocalContent,
  siteLocalContentLimits, type SiteLocalTextField,
} from "./site-local-content";

/**
 * Church reference excerpts may describe the church, not establish school
 * eligibility, fees, safety assurances, academic staffing or permissions.
 * Reuse the canonical claim/unsafe-markup scanner and add P-specific
 * conservative limits around factual school marketing.
 */
const schoolMarketingClaims = [
  /\b(?:school|academy|campus|academic program)\b.{0,140}\b(?:enroll\w*|admission\w*|appl(?:y|ication\w*|icants?)|tuition|fees?|licensed|accredited|state[- ]approved|funding|eligible|qualified teachers?|certified staff|background.checked|guaranteed safety|safe campus|secure campus)\b/i,
  /\b(?:guaranteed|certified|background.checked|fully licensed|state[- ]approved|accredited)\b.{0,70}\b(?:school|academy|campus|teachers?|school staff|instructors?|enrollment|students?)\b/i,
  /\b(?:eligible for|qualifies? for|accepts?)\s+(?:state |federal )?(?:voucher|education savings account|esa funding|scholarship|school funding|financial aid)\b/i,
  /\b(?:admissions?|enrollment|enrolling|tuition|school fees?|student applications?)\s+(?:are|is|open|now|available|starting|accepted|begins|has begun)\b/i,
  /\b(?:enrolling|admitting|accepting applications?\s+for)\s+(?:students?|children|learners|grades?|families)\b/i,
];

export function assertChurchSourceEditorialCopy(text: string, target: SiteLocalTextField) {
  if (typeof text !== "string" || !text.trim() || text.length > siteLocalContentLimits[target] ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) {
    throw new Error("Church excerpt is empty, too long, or contains control characters");
  }
  // The canonical scanner rejects unsafe markup and classifies protected
  // academic/institutional claims before the proposal can enter the queue.
  const decision = classifySiteLocalContent({
    ...emptySiteLocalContent, [target]: text,
  });
  if (decision.status !== "published" || schoolMarketingClaims.some(rule => rule.test(text))) {
    throw new Error("Church source text may not assert school admissions, tuition, staffing, eligibility, safety or institutional approval. Use separately reviewed CAN facts.");
  }
}
