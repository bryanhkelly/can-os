import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { analyzeSource, createInventory, checkChangedFiles, findSharedLayerGeometryViolations, collectV61SourceViolations, inspectV61ThemeTokens } from "./v61-source-audit.mjs";

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

test("brand shape discriminants are not Tailwind classes, but standalone rounded utilities are", () => {
  const source = [
    'const isRoundedEmblem = design.emblem === "rounded";',
    'export const Card = () => <div className="rounded" />;',
  ].join("\n");
  const audit = analyzeSource(source, "/demo/src/components/launch-studio/BrandCard.tsx");
  assert.deepEqual(audit.corners.map(corner => corner.utility), ["rounded"]);
});

test("full-card checkbox/radio labels are deliberate accessible wrappers, not migration debt", () => {
  const source = [
    "export const Options = () => <section>",
    "  <label><Checkbox name='approval'/> Agree</label>",
    "  <label><Radio name='level' value='beginner'/> Beginner</label>",
    "  <label><Input type='text'/> Invalid text-input wrapper</label>",
    "  <label><Input type='checkbox'/> Canonical Input is not the choice primitive</label>",
    "</section>;",
  ].join("\n");
  const result = analyzeSource(source, "/demo/src/components/feature/Options.tsx");
  assert.deepEqual(result.native.map(node => node.tag), ["label", "label"]);
  assert.equal(result.syntaxErrors.length, 0);
});

test("native dialogs outside UI primitives must use the shared Modal", () => {
  const source = 'export const Page = () => <dialog open>Details</dialog>;';
  const feature = analyzeSource(source, "/demo/src/components/learning/Details.tsx");
  const primitive = analyzeSource(source, "/demo/src/components/ui/modal.tsx");
  assert.deepEqual(feature.native.map(node => node.tag), ["dialog"]);
  assert.equal(primitive.native.length, 0);
});

test("routes and reachable components are discovered, without route manifests", () => temp(({ root, write }) => {
  write("src/routes/home.tsx", 'import { Widget } from "@/components/cards"; export const Page = () => <Widget/>;');
  write("src/routes/old.tsx", 'export const Page = () => <button className="rounded-xl">Legacy</button>;');
  write("src/components/cards/index.ts", 'export { Widget } from "./Widget"; export { Legacy } from "./Legacy";');
  write("src/components/cards/Legacy.tsx", 'export const Legacy = () => <button>Unused legacy component</button>;');
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


test("new TSX files compare against an empty base without parser fallback errors", () => temp(({ root, write }) => {
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q");
  git("config", "user.name", "V61 test");
  git("config", "user.email", "test@example.invalid");
  write("src/routes/existing.tsx", "export const Existing = () => <Button/>;");
  git("add", "."); git("commit", "-qm", "initial");
  write("src/routes/new.tsx", "export const New = () => <input/>;");
  git("add", "."); git("commit", "-qm", "new route");
  const result = checkChangedFiles(root, "HEAD^");
  assert.equal(result.checked, 1);
  assert.match(result.errors.join("\n"), /native increased \(input\)/);
}));


test("unstaged and untracked TSX regressions are detected before commit", () => temp(({ root, write }) => {
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q");
  git("config", "user.name", "V61 test");
  git("config", "user.email", "test@example.invalid");
  write("src/routes/page.tsx", "export const Page = () => <Button/>;");
  git("add", "."); git("commit", "-qm", "initial");
  write("src/routes/other.tsx", "export const Other = () => <Button/>;");
  git("add", "."); git("commit", "-qm", "clean second");
  write("src/routes/page.tsx", "export const Page = () => <button/>;");
  write("src/routes/new.tsx", "export const New = () => <textarea/>;");
  const result = checkChangedFiles(root, "HEAD^");
  assert.equal(result.checked, 3);
  assert.match(result.errors.join("\n"), /page\.tsx: native increased \(button\)/);
  assert.match(result.errors.join("\n"), /new\.tsx: native increased \(textarea\)/);
}));


test("lazy-loaded feature components appear in the composed source audit", () => temp(({ root, write }) => {
  write("src/routes/home.tsx", 'export const load = () => import("@/components/views/Legacy");');
  write("src/components/views/Legacy.tsx",
    'export const Legacy = () => <button className="rounded-lg">Open</button>;');
  const inventory = createInventory(root);
  assert.equal(inventory.totals.routes, 1);
  assert.equal(inventory.routes[0].reachableNative, 1);
  assert.equal(inventory.routes[0].reachableCorners, 1);
  assert.equal(inventory.routes[0].composedSourceClean, false);
}));

test("shared-layer geometry rules follow new components without a manifest", () => temp(({root, write}) => {
  write("src/components/ui/future-control.tsx",
    'export const FutureControl = () => <input className="rounded-lg"/>;');
  write("src/components/workspace/new-surface.tsx",
    'export const NewSurface = () => <div className="rounded-xl"/>;');
  write("src/components/learning/legacy-feature.tsx",
    'export const Legacy = () => <div className="rounded-xl"/>;');
  const inventory = createInventory(root);
  const problems = findSharedLayerGeometryViolations(inventory);
  assert.equal(problems.length, 2);
  assert.deepEqual(problems.map(p => p.file).sort(), [
    "src/components/ui/future-control.tsx",
    "src/components/workspace/new-surface.tsx",
  ]);
  assert.equal(inventory.totals.directlyCleanComponents, 0);
}));

test("release audits include regressions committed before the latest commit", () => temp(({root, write}) => {
  const git = (...args) => execFileSync("git", args, {cwd:root, stdio:"pipe", encoding:"utf8"}).trim();
  git("init", "-q");
  git("config", "user.name", "V61 test");
  git("config", "user.email", "test@example.invalid");
  write("src/routes/page.tsx", "export const Page = () => <Button/>;");
  git("add", "."); git("commit", "-qm", "main base");
  const base = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", base);
  git("checkout", "-qb", "release-test");
  write("src/routes/page.tsx", "export const Page = () => <button/>;");
  git("add", "."); git("commit", "-qm", "earlier regression");
  write("src/routes/other.tsx", "export const Other = () => <Button/>;");
  git("add", "."); git("commit", "-qm", "unrelated change");
  const result = checkChangedFiles(root, "");
  assert.equal(result.base, base);
  assert.equal(result.checked, 2);
  assert.match(result.errors.join("\n"), /page\.tsx: native increased \(button\)/);
  assert.equal(checkChangedFiles(root, "HEAD^").errors.length, 0);
  git("update-ref", "-d", "refs/remotes/origin/main");
  const blocked = checkChangedFiles(root, "");
  assert.equal(blocked.base, null);
  assert.match(blocked.warning, /Git base unavailable/);
}));

test("directional, logical, arbitrary and important corner utilities cannot bypass square geometry", () => {
  const utilities = ["rounded-t", "rounded-bl-lg", "rounded-se-none",
    "rounded-xs", "md:rounded-s-full", "hover:!rounded-tr-[3px]",
    "rounded-(--custom-radius)", "[&>a]:rounded-b-md!", "dark:rounded-ss-4xl"];
  const audit = analyzeSource('export const Page = () => <div className="' +
    utilities.join(" ") + ' border-t text-sm"/>;', "/demo/src/components/workspace/panel.tsx");
  assert.deepEqual(audit.corners.map(item => item.utility), utilities);
});

test("absolute policy rejects unchanged debt in routes, feature components and extra UI", () => temp(({root, write}) => {
  write("src/routes/legacy.tsx", 'export const Legacy = () => <button>Old</button>;');
  write("src/components/example/Panel.tsx", 'export const Panel = () => <div className="rounded-lg"/>;');
  write("src/widgets/External.tsx", 'export const Widget = () => <select/>;');
  write("src/components/ui/input.tsx", 'export const Input = () => <input/>;');
  write("src/routes/clean.tsx", 'export const Clean = () => <input type="hidden"/>;');
  const violations = collectV61SourceViolations(createInventory(root));
  assert.deepEqual(violations.map(v => [v.file, v.kind, v.detail]).sort(), [
    ["src/components/example/Panel.tsx", "geometry", "rounded-lg"],
    ["src/routes/legacy.tsx", "native-control", "button"],
    ["src/widgets/External.tsx", "native-control", "select"],
  ]);
  assert.ok(violations.every(v => v.line > 0 && v.column > 0));
  write("src/routes/legacy.tsx", 'export const Legacy = () => <Button>Old</Button>;');
  write("src/components/example/Panel.tsx", 'export const Panel = () => <div className="border"/>;');
  write("src/widgets/External.tsx", 'export const Widget = () => <Select/>;');
  assert.deepEqual(collectV61SourceViolations(createInventory(root)), []);
}));

test("the build and release share the same theme contract", () => {
  const css = `
    --font-sans: "DM Sans";
    --font-serif: "Instrument Serif";
    --radius: 0;
    --color-success: var(--success);
    --color-warning: var(--warning);
    --color-danger: var(--danger);
    --sidebar-width: 16rem;
    --topbar-height: 4rem;
  `;
  assert.ok(Object.values(inspectV61ThemeTokens(css)).every(Boolean));
  assert.equal(inspectV61ThemeTokens(css.replace("--radius: 0;", "--radius: 8px;")).squareGeometry, false);
  assert.equal(inspectV61ThemeTokens(css.replace('"DM Sans"', '"Arial"')).fontSans, false);
  assert.equal(inspectV61ThemeTokens(css.replace("--color-danger: var(--danger);", "")).semanticDanger, false);
});


test("canonical appearance ownership follows imported aliases and conditional classes", () => {
  const source = [
    'import { Button as Action } from "@/components/ui/button";',
    'import { Input } from "@/components/ui/input";',
    'const field = "mt-1 border bg-background p-2";',
    'export const Page = () => <div><Action className={cn("w-full", active && "hover:bg-primary", active ? "px-4" : "mt-2")}/><Input className={field}/></div>;',
  ].join("\n");
  const audit = analyzeSource(source, "/demo/src/routes/example.tsx");
  assert.deepEqual(audit.appearance.map(issue => issue.utility).sort(),
    ["bg-background", "border", "hover:bg-primary", "p-2", "px-4"]);
});
test("layout composition and feature-local names are not appearance violations", () => {
  const source = [
    'import { Button } from "@/components/ui/button";',
    'import { Input } from "./custom-input";',
    'export const Page = () => <div><Button className="mt-2 w-full min-w-0 flex-1 whitespace-normal text-left"/><Input className="bg-background"/></div>;',
  ].join("\n");
  assert.deepEqual(analyzeSource(source, "/demo/src/routes/example.tsx").appearance, []);
});
test("appearance violations block the absolute source gate", () => temp(({root, write}) => {
  write("src/routes/page.tsx", 'import { Button } from "@/components/ui/button"; export const Page = () => <Button className="bg-red-500"/>;');
  write("src/components/ui/button.tsx", 'export const Button = () => <button className="bg-primary"/>;');
  const violations = collectV61SourceViolations(createInventory(root));
  assert.equal(violations.length, 1);
  assert.equal(violations[0].kind, "control-appearance");
  assert.equal(violations[0].detail, "Button: bg-red-500");
}));
