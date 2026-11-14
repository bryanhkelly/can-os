import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * Private noncredit knowledge checks are NOT official school assessments.
 * Keys are authenticated ciphertext, never included in learner projections.
 */
export const NONCREDIT_KEY_REF = "can-noncredit-objective-aes256gcm-v1";
export const NONCREDIT_SCORING_ENGINE = "can-noncredit-objective-v1";
const keySchema = z.object({
  itemVersionId: z.string().uuid(),
  correctOptionIds: z.array(z.string().uuid()).min(1).max(32),
}).strict();

function secretKey(hex: string): Buffer {
  if (!/^[a-f\d]{64}$/i.test(hex)) {
    throw new Error("Noncredit assessment key is not configured");
  }
  return Buffer.from(hex, "hex");
}

/** For controlled content publishing only. Never invoke in a learner endpoint. */
export function sealNoncreditAnswerKey(
  hexKey: string, itemVersionId: string, correctOptionIds: readonly string[],
): Buffer {
  const key = keySchema.parse({itemVersionId, correctOptionIds: [...correctOptionIds]});
  if (new Set(key.correctOptionIds).size !== key.correctOptionIds.length) {
    throw new Error("Duplicate correct choices");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(hexKey), nonce);
  cipher.setAAD(Buffer.from(itemVersionId, "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(key), "utf8"), cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
}

/** For the restricted scoring service only, never for client-side rendering. */
export function openNoncreditAnswerKey(
  hexKey: string, itemVersionId: string, ciphertext: Uint8Array,
): readonly string[] {
  const body = Buffer.from(ciphertext);
  if (body.length < 29) throw new Error("Invalid encrypted assessment key");
  const decipher = createDecipheriv(
    "aes-256-gcm", secretKey(hexKey), body.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from(itemVersionId, "utf8"));
  decipher.setAuthTag(body.subarray(12, 28));
  const decoded = JSON.parse(Buffer.concat([
    decipher.update(body.subarray(28)), decipher.final(),
  ]).toString("utf8")) as unknown;
  const key = keySchema.parse(decoded);
  if (key.itemVersionId !== itemVersionId ||
      new Set(key.correctOptionIds).size !== key.correctOptionIds.length) {
    throw new Error("Assessment key integrity failed");
  }
  return key.correctOptionIds;
}

export function scoreNoncreditChoices(input: {
  responseKind: "single_select" | "multi_select" | "true_false";
  chosenOptionIds: readonly string[];
  correctOptionIds: readonly string[];
  availableOptionIds: readonly string[];
  maxPoints: number;
}): number {
  const selected = new Set(input.chosenOptionIds);
  const correct = new Set(input.correctOptionIds);
  const available = new Set(input.availableOptionIds);
  if (!Number.isFinite(input.maxPoints) || input.maxPoints <= 0 ||
      selected.size !== input.chosenOptionIds.length ||
      correct.size !== input.correctOptionIds.length ||
      available.size !== input.availableOptionIds.length ||
      !correct.size || !selected.size ||
      (input.responseKind !== "multi_select" && (selected.size !== 1 || correct.size !== 1)) ||
      [...selected, ...correct].some(id => !available.has(id))) {
    throw new Error("Invalid published objective assessment or response");
  }
  return selected.size === correct.size &&
    [...selected].every(option => correct.has(option)) ? input.maxPoints : 0;
}

export function evaluateKnowledgeCheckResult(earned: number, possible: number, passingFraction: number | null) {
  if (!Number.isFinite(earned) || !Number.isFinite(possible) ||
      possible <= 0 || earned < 0 || earned > possible) {
    throw new Error("Invalid knowledge check score");
  }
  if (passingFraction !== null && (!Number.isFinite(passingFraction) ||
      passingFraction < 0 || passingFraction > 1)) {
    throw new Error("Invalid published passing threshold");
  }
  const fraction = earned / possible;
  return {
    earned, possible, fraction,
    outcome: passingFraction === null ? "inconclusive" as const :
      fraction >= passingFraction ? "pass" as const : "fail" as const,
  };
}
