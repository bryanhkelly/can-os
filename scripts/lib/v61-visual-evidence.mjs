import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const digestPattern = /^[a-f0-9]{64}$/;
const pngSignature = Buffer.from([137,80,78,71,13,10,26,10]);
const viewportWidths = { mobile: 390, tablet: 768, desktop: 1440 };

/** Checks provenance and artifact integrity, not the truth of a human review. */
export function hasReviewedVisualEvidence(root, reviews, file) {
  const matches = reviews.filter(review => review?.path === file);
  if (matches.length !== 1) return false;
  const entry = matches[0];
  if (entry.status !== "reviewed" || typeof entry.reviewer !== "string" ||
      !entry.reviewer.trim() || !Number.isFinite(Date.parse(entry.reviewedAt)) ||
      !digestPattern.test(entry.sourceSha256 ?? "") ||
      !Array.isArray(entry.screenshots) || entry.screenshots.length !== 3) return false;
  try {
    if (sha256(readFileSync(join(root, file))) !== entry.sourceSha256) return false;
    const screenshotRoot = realpathSync(join(root, "docs/verification/screenshots"));
    const paths = new Set(), hashes = new Set();
    for (const [viewport, width] of Object.entries(viewportWidths)) {
      const candidates = entry.screenshots.filter(item => item?.viewport === viewport);
      if (candidates.length !== 1) return false;
      const item = candidates[0];
      if (typeof item.path !== "string" ||
          !/^docs\/verification\/screenshots\/[a-zA-Z0-9/_-]+\.png$/.test(item.path) ||
          !digestPattern.test(item.sha256 ?? "")) return false;
      const actual = realpathSync(join(root, item.path));
      const fromRoot = relative(screenshotRoot, actual);
      if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(".." + sep) ||
          paths.has(actual) || hashes.has(item.sha256)) return false;
      const bytes = readFileSync(actual);
      // Header inspection only: this is not a complete PNG decoder.
      if (bytes.length < 33 || !bytes.subarray(0,8).equals(pngSignature) ||
          bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii",12,16) !== "IHDR" ||
          bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) === 0 ||
          sha256(bytes) !== item.sha256) return false;
      paths.add(actual); hashes.add(item.sha256);
    }
    return true;
  } catch {
    return false;
  }
}
