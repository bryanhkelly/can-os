import { spawnSync } from "node:child_process";

/** Enforce FullFlow-only checkout provenance before any fixture writes. */
export function assertFullFlowCheckout({ sourceSha, githubSha, githubRefName, localBranch }) {
  if (!/^[0-9a-f]{40}$/.test(sourceSha ?? ""))
    throw new Error("FullFlow acceptance requires a valid checked-out Git SHA.");
  if (githubSha && githubSha !== sourceSha)
    throw new Error("FullFlow acceptance refused: checked-out commit differs from GITHUB_SHA.");
  if (githubRefName) {
    if (githubRefName !== "FullFlow")
      throw new Error("FullFlow acceptance refused: GITHUB_REF_NAME is not FullFlow.");
  } else if (localBranch !== "FullFlow") {
    throw new Error("FullFlow acceptance refused: local Git branch is not FullFlow.");
  }
  return sourceSha;
}

export function verifyFullFlowCheckout(env = process.env) {
  const current = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  const branch = spawnSync("git", ["symbolic-ref", "--short", "HEAD"], { encoding: "utf8" });
  if (current.error || current.status !== 0) throw new Error("Cannot inspect checked-out FullFlow commit.");
  return assertFullFlowCheckout({
    sourceSha: current.stdout.trim(),
    githubSha: env.GITHUB_SHA,
    githubRefName: env.GITHUB_REF_NAME,
    localBranch: branch.status === 0 ? branch.stdout.trim() : null,
  });
}
