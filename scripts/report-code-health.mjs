#!/usr/bin/env node
/** Read-only code health inventory. Findings are review candidates, not a gate.
 * No dependencies beyond the repository's locked TypeScript and ESLint stack. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.length) throw new Error("Unknown code health report arguments");

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [resolve(root, script), ...args], {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status === null || result.status > 1) {
    throw new Error(script + " could not complete: " + (result.error?.message ?? result.stderr));
  }
  return result;
}

const lint = runNode("node_modules/eslint/bin/eslint.js", [
  "src", "--format", "json",
  "--rule", 'complexity: ["warn", 15]',
  "--rule", 'max-lines-per-function: ["warn", {"max": 120, "skipBlankLines": true, "skipComments": true}]',
]);
const lintFiles = JSON.parse(lint.stdout);
const findings = [];
const countsByRule = {};
for (const file of lintFiles) {
  for (const message of file.messages) {
    const rule = message.ruleId ?? "parser";
    countsByRule[rule] = (countsByRule[rule] ?? 0) + 1;
    if (["complexity", "max-lines-per-function", "@typescript-eslint/no-unused-vars",
      "no-unused-vars", "no-unreachable", "no-duplicate-imports"].includes(rule)) {
      findings.push({
        file: relative(root, file.filePath).replaceAll("\\", "/"),
        line: message.line, column: message.column, rule, message: message.message,
      });
    }
  }
}

const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const byCommand = new Map();
for (const [name, command] of Object.entries(packageJson.scripts)) {
  const names = byCommand.get(command) ?? [];
  names.push(name);
  byCommand.set(command, names);
}
const duplicateCommands = [...byCommand.entries()]
  .filter(([, names]) => names.length > 1)
  .map(([command, names]) => ({ command, names }));
const historicalCandidates = Object.entries(packageJson.scripts)
  .filter(([name, command]) => /test01|fullflow/i.test(name + " " + command))
  .map(([name, command]) => ({ name, command }));

console.log(JSON.stringify({
  schemaVersion: 1,
  scope: "ESLint-covered src files and package scripts",
  lintExitCode: lint.status,
  files: lintFiles.length,
  countsByRule,
  findings,
  tooling: {
    scriptCount: Object.keys(packageJson.scripts).length,
    duplicateCommands,
    historicalCandidates,
  },
  limitations: [
    "Unused local findings are not proof that exported modules or dynamic consumers are dead.",
    "Complexity and size warnings identify candidates; they do not mandate arbitrary function splitting.",
    "Run architecture:inventory for the existing duplicate-body report.",
    "No test coverage, typecheck, security, visual or runtime acceptance is implied.",
  ],
}, null, 2));
