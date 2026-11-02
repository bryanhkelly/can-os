import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";
import {
  workspaceLinks,
  workspaceHome,
} from "@/components/shell/WorkspaceNavigation";
vi.mock("@/modules/identity/workspace-session.functions",()=>({getWorkspaceSession:vi.fn()}));

/**
 * Route wiring integrity. Two failure classes this guards against:
 *
 * 1. A route file exists but src/routeTree.gen.ts was not regenerated, so
 *    the route silently 404s (or falls back) on the deployed build.
 * 2. Navigation links point at paths no route file implements.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const routesDir = join(repoRoot, "src", "routes");

/** "student.assignments.tsx" -> "/student/assignments"; "student.index.tsx" -> "/student" */
function routePathFor(file: string): string | null {
  const base = file.replace(/\.(tsx|ts)$/, "");
  if (base === "__root") return null;
  const segments = base.split(".");
  if (segments[segments.length - 1] === "index") segments.pop();
  return "/" + segments.join("/");
}

const routeFiles = readdirSync(routesDir).filter((f) => /\.(tsx|ts)$/.test(f));
const routePaths = new Set(
  routeFiles
    .map(routePathFor)
    .filter((p): p is string => p !== null),
);

function linkPath(target: string): string {
  return target.split(/[?#]/)[0].replace(/\/$/, "") || "/";
}

function matchesRoute(target: string): boolean {
  return [...routePaths].some(route =>
    new RegExp("^"+route.replace(/\$[^/]+/g,"[^/]+")+"/?$").test(linkPath(target)),
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const full=join(dir,entry.name);
    return entry.isDirectory()?sourceFiles(full):/\.(tsx|ts)$/.test(entry.name)?[full]:[];
  });
}

function literalTargets(node: ts.Node): string[] {
  if(ts.isStringLiteralLike(node))return [node.text];
  if(ts.isTemplateExpression(node))return [
    node.head.text+node.templateSpans.map(span=>"record"+span.literal.text).join(""),
  ];
  if(ts.isConditionalExpression(node))return [...literalTargets(node.whenTrue),...literalTargets(node.whenFalse)];
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken)return literalTargets(node.left);
  if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node))return literalTargets(node.expression);
  return [];
}

describe("route tree freshness", () => {
  it("registers every route file in the generated route tree", () => {
    const tree = readFileSync(join(repoRoot, "src", "routeTree.gen.ts"), "utf8");
    const unregistered = routeFiles.filter(
      (file) => !tree.includes(`./routes/${file.replace(/\.(tsx|ts)$/, "")}`),
    );
    expect(
      unregistered,
      `route files missing from routeTree.gen.ts (stale generated tree — run the dev server or build to regenerate): ${unregistered.join(", ")}`,
    ).toEqual([]);
  });
});

describe("parent route renderability", () => {
  it("every route with children renders <Outlet/> or is a pure redirect/server-handler route", () => {
    const tree = readFileSync(join(repoRoot, "src", "routeTree.gen.ts"), "utf8");
    // "./routes/operations" -> "operations" for each generated route import.
    const fileByImport = new Map<string, string>();
    for (const match of tree.matchAll(/import \{ Route as (\w+)RouteImport \} from '\.\/routes\/([^']+)'/g)) {
      fileByImport.set(match[1], match[2]);
    }
    // The generated tree marks parents via `<Name>Route._addFileChildren(`.
    const parentsWithChildren = new Set(
      [...tree.matchAll(/(\w+)Route\._addFileChildren\(/g)].map((match) => match[1]),
    );
    const offenders: string[] = [];
    for (const name of parentsWithChildren) {
      const base = fileByImport.get(name);
      if (!base || base === "__root" || base.endsWith(".index")) continue;
      const file = routeFiles.find((f) => f.replace(/\.(tsx|ts)$/, "") === base);
      if (!file) continue;
      const source = readFileSync(join(routesDir, file), "utf8");
      const rendersOutlet = /\bOutlet\b/.test(source);
      const isServerHandler = /server:\s*\{\s*handlers:/.test(source);
      const isPureRedirect = /redirect\(/.test(source) && !/component\s*:/.test(source);
      if (!rendersOutlet && !isServerHandler && !isPureRedirect) {
        offenders.push(
          `src/routes/${file} has child routes in routeTree.gen.ts but never renders <Outlet/>, so its children can never render`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("navigation link targets", () => {
  it("resolves literal and templated links, redirects, and generated navigation URLs across the application",()=>{
    const broken:string[]=[];
    for(const file of sourceFiles(join(repoRoot,"src"))){
      if(file.endsWith("routeTree.gen.ts"))continue;
      const source=ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true,
        file.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
      const visit=(node:ts.Node):void=>{
        let values:string[]=[];
        if(ts.isJsxAttribute(node)&&["to","href"].includes(node.name.getText(source))&&node.initializer){
          const value=ts.isJsxExpression(node.initializer)?node.initializer.expression:node.initializer;
          if(value)values=literalTargets(value);
        }else if(ts.isPropertyAssignment(node)&&["to","href","path"].includes(node.name.getText(source))){
          values=literalTargets(node.initializer);
        }else if(ts.isCallExpression(node)&&node.expression.getText(source)==="window.location.assign"&&node.arguments[0]){
          values=literalTargets(node.arguments[0]);
        }
        for(const value of values){
          if(value.startsWith("/")&&!value.startsWith("//")&&!matchesRoute(value)){
            broken.push(`${file.slice(repoRoot.length+1)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line+1} -> ${value}`);
          }
        }
        ts.forEachChild(node,visit);
      };
      visit(source);
    }
    expect(broken).toEqual([]);
  });

  it("has no enabled native buttons without an action or a submitting form",()=>{
    const inert:string[]=[];
    for(const root of [routesDir,join(repoRoot,"src","components")]){
      for(const file of sourceFiles(root)){
        const source=ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
        const visit=(node:ts.Node):void=>{
          if((ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))&&node.tagName.getText(source)==="button"){
            const attributes=node.attributes.properties;
            const hasAction=attributes.some(attr=>ts.isJsxSpreadAttribute(attr)||
              ts.isJsxAttribute(attr)&&["onClick","onClickCapture","disabled"].includes(attr.name.getText(source)));
            let inForm=false;
            for(let parent:ts.Node|undefined=node.parent;parent;parent=parent.parent){
              if(ts.isJsxElement(parent)&&parent.openingElement.tagName.getText(source)==="form"){
                inForm=true;break;
              }
            }
            if(!hasAction&&!inForm)inert.push(`${file.slice(repoRoot.length+1)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line+1}`);
          }
          ts.forEachChild(node,visit);
        };
        visit(source);
      }
    }
    expect(inert).toEqual([]);
  });
  it("every primary navigation link resolves to a route", () => {
    const broken = Object.values(workspaceLinks).flat()
      .map((link) => link.path)
      .filter((to) => !routePaths.has(linkPath(to)));
    expect(broken, `nav links with no matching route file: ${broken.join(", ")}`).toEqual([]);
  });

  it("every persona home resolves to a route", () => {
    const broken = Object.values(workspaceHome).filter(
      (to) => !routePaths.has(linkPath(to)),
    );
    expect(broken).toEqual([]);
  });

  it("every static Link target in routes and components resolves to a route", () => {
    const broken: Array<{ file: string; target: string }> = [];
    const scan = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
          continue;
        }
        if (!/\.(tsx|ts)$/.test(entry.name)) continue;
        const text = readFileSync(full, "utf8");
        // JSX to="/..." and navigation-config to:"/..." — a leading slash
        // marks a route target (state-machine `to:` values never have one).
        for (const match of text.matchAll(/\bto=["'](\/[^"']*)["']/g)) {
          const target = linkPath(match[1]);
          // Dynamic segments: /staff/students/$personId matches any concrete id.
          const matchesRoute = [...routePaths].some((route) => {
            const pattern = route.replace(/\$[^/]+/g, "[^/]+");
            return new RegExp(`^${pattern}/?$`).test(target);
          });
          if (!matchesRoute) {
            broken.push({ file: full.slice(repoRoot.length + 1), target: match[1] });
          }
        }
      }
    };
    scan(routesDir);
    scan(join(repoRoot, "src", "components"));
    expect(
      broken,
      `link targets with no matching route:\n${broken.map((b) => `  ${b.file} -> ${b.target}`).join("\n")}`,
    ).toEqual([]);
  });
});
