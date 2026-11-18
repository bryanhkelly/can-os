import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { analyzeSource, createInventory, checkChangedFiles } from "./v61-source-audit.mjs";

function temp(run) {
  const root = mkdtempSync(join(tmpdir(), "v61-audit-"));
  const write = (file, source) => {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  };
  try { return run({ root, write }); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test("AST ignores JSX-like comments and literal text; hidden inputs remain native", () => {
  const source = [
    "/* <button className='rounded-lg'>comment</button> */",
    "const example = '<select>quoted example</select>';",
    "export const Page = () => <div>",
    "  <Button>Approved</Button><input type=\"hidden\"/>",
    "  <label>Legacy</label><input type=\"text\"/>",
    "  <section className={true ? \"rounded-xl\" : \"border\"}/>",
    "</div>;",
  ].join("\n");
  const result = analyzeSource(source, "/demo/src/routes/example.tsx");
  assert.deepEqual(result.native.map(node => node.tag), ["label", "input"]);
  assert.equal(result.corners.length, 1);
  assert.equal(result.syntaxErrors.length, 0);
});

test("routes and reachable components are discovered, without route manifests", () => temp(({ root, write }) => {
  write("src/routes/home.tsx", 'import { Widget } from "@/components/cards"; export const Page = () => <Widget/>;');
  write("src/routes/old.tsx", 'export const Page = () => <button className="rounded-xl">Legacy</button>;');
  write("src/components/cards/index.ts", 'export { Widget } from "./Widget";');
  write("src/components/cards/Widget.tsx", 'export const Widget = () => <div className="border"/>;');
  write("src/components/ui/input.tsx", 'export const Input = () => <input/>;');
  const inventory = createInventory(root);
  assert.equal(inventory.totals.routes, 2);
  assert.equal(inventory.totals.directlyClean, 1);
  assert.equal(inventory.totals.composedClean, 1);
  assert.equal(inventory.routes.find(row => row.file.endsWith("home.tsx")).reachableComponentFiles, 1);
}));

test("changed route cannot introduce new unshared controls", () => temp(({ root, write }) => {
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q");
  git("config", "user.name", "V61 test");
  git("config", "user.email", "test@example.invalid");
  write("src/routes/page.tsx", "export const Page = () => <Button>OK</Button>;");
  git("add", "."); git("commit", "-qm", "clean");
  write("src/routes/page.tsx", "export const Page = () => <button>OK</button>;");
  git("add", "."); git("commit", "-qm", "regression");
  const result = checkChangedFiles(root, "HEAD^");
  assert.equal(result.checked, 1);
  assert.match(result.errors.join("\n"), /native increased/);
}));
