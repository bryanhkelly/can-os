import { execFileSync } from "node:child_process";

/** Embeds the actual checked-out source commit into each built deployment.
 * This is immutable build provenance, not an environment feature flag.
 */
export function resolveBuildSourceRevision():string|null {
  const sha=/^[a-f0-9]{40}$/i;
  // Prefer the actual source checkout over CI metadata: pull-request merge
  // refs and stale pipeline variables must not masquerade as deployed main.
  try {
    const commit=execFileSync("git",["rev-parse","HEAD"],{
      encoding:"utf8",timeout:2500,stdio:["ignore","pipe","ignore"],
    }).trim().toLowerCase();
    if(sha.test(commit))return commit;
  }catch{ /* Some hosted build contexts omit .git. */ }
  for(const value of [process.env.CF_PAGES_COMMIT_SHA,process.env.COMMIT_REF,
    process.env.GITHUB_SHA,process.env.CI_COMMIT_SHA]){
    if(value&&sha.test(value.trim()))return value.trim().toLowerCase();
  }
  return null;
}
