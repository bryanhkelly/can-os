import { spawnSync } from "node:child_process";

const acceptanceBranches = new Set(["main", "FullFlow"]);

/** Attest reviewed source independently of the isolated Neon database identity. */
export function assertFullFlowCheckout({ sourceSha, githubSha, githubRefName, githubRefType, localBranch, dirty = false }) {
  if (!/^[0-9a-f]{40}$/.test(sourceSha ?? ""))
    throw new Error("FullFlow acceptance requires a valid checked-out Git SHA.");
  if (githubSha && githubSha !== sourceSha)
    throw new Error("FullFlow acceptance refused: checked-out commit differs from GITHUB_SHA.");
  if (dirty) throw new Error("FullFlow acceptance refused: commit or discard working-tree changes before acceptance.");
  if (githubRefName) {
    if (!githubSha || githubRefType !== "branch" || !acceptanceBranches.has(githubRefName))
      throw new Error("FullFlow acceptance refused: CI requires the exact SHA on the main or FullFlow branch.");
  } else if (!acceptanceBranches.has(localBranch)) {
    throw new Error("FullFlow acceptance refused: local Git branch is not main or FullFlow.");
  }
  return sourceSha;
}

export function verifyFullFlowCheckout(env = process.env) {
  const current = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  const branch = spawnSync("git", ["symbolic-ref", "--short", "HEAD"], { encoding: "utf8" });
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8" });
  if (current.error || current.status !== 0) throw new Error("Cannot inspect checked-out FullFlow commit.");
  if (status.error || status.status !== 0) throw new Error("Cannot verify clean acceptance source.");
  return assertFullFlowCheckout({
    sourceSha: current.stdout.trim(),
    githubSha: env.GITHUB_SHA,
    githubRefName: env.GITHUB_REF_NAME,
    githubRefType: env.GITHUB_REF_TYPE,
    localBranch: branch.status === 0 ? branch.stdout.trim() : null,
    dirty: status.stdout.trim().length > 0,
  });
}
