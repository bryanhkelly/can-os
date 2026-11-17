/**
 * WS3 merge-preflight. Run from repo root after dependency installation:
 *    node scripts/acceptance/check-ws3-merge-gate.mjs
 *
 * No DB writes, feature-flag activation, auto-merge or production actions.
 * A passing focused suite is not a substitute for authenticated test01 E2E.
 * Fail closed on the first nonzero test command.
 */
import { spawnSync } from "node:child_process";

const required = [
  ["npm",["run","typecheck"]],
  ["npx",["vitest","run",
    "tests/unit/verified-completion.test.ts",
    "tests/unit/verified-completion-projection.test.ts",
    "tests/unit/class-completion-policy.test.ts",
    "tests/unit/completion-evidence-bindings.test.ts",
    "tests/unit/ws3-completion-command-contract.test.ts",
    "tests/unit/ws3-completion-reader-contract.test.ts",
    "tests/unit/ws3-source-authority-sql-contract.test.ts",
    "tests/unit/ws3-native-class-completion-contract.test.ts",
    "tests/unit/ws3-evidence-review-and-class-current.test.ts",
    "tests/unit/ws3-class-policy-publication-contract.test.ts",
  ]],
  ["npm",["run","test"]],
  ["npm",["run","build"]],
];
const results=[];
for (const [command,args] of required){
  console.log("[WS3 gate] Running "+[command,...args].join(" "));
  const run=spawnSync(command,args,{encoding:"utf8",stdio:"inherit",shell:false});
  const status=run.status??1;
  results.push({command,args,exitCode:status,error:run.error?.message??null});
  if(status!==0){console.error("[WS3 gate] FAILED. No release or merge authorized.");
    process.exitCode=1;break;}
}
console.log(JSON.stringify({gate:"ws3-code-merge",
  passed:results.length===required.length&&results.every(x=>x.exitCode===0),
  checks:results,
  caveat:"Requires separate SQL migration/role QA, signed-in acceptance and WS00 integration gate."
},null,2));
