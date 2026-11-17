import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";
import ts from "typescript";

function parseRoute(source:string) {
  const parsed=ts.createSourceFile(
    "src/routes/learn.my-activity.tsx",source,ts.ScriptTarget.Latest,
    true,ts.ScriptKind.TSX,
  );
  return parsed.parseDiagnostics.map(item =>
    "TS"+item.code+" "+ts.flattenDiagnosticMessageText(item.messageText," "));
}

describe("Cloudflare route generation syntax regression",()=>{
  it("parses the exact My Activity route file before TanStack route generation",()=>{
    const file=readFileSync(resolve("src/routes/learn.my-activity.tsx"),"utf8");
    expect(parseRoute(file)).toEqual([]);
  });
  it("detects the nested JSX empty-state ternary that originally hid routeTree generation",()=>{
    const invalid=`const view=<main>{count ? <div/> : empty ? <p/>}</main>;`;
    const fixed=`const view=<main>{count ? <div/> : empty ? <p/> : null}</main>;`;
    expect(parseRoute(invalid).some(message=>message.includes("':' expected"))).toBe(true);
    expect(parseRoute(fixed)).toEqual([]);
  });
  it("checks source syntax before both Vite build variants",()=>{
    const packageJson=JSON.parse(readFileSync(resolve("package.json"),"utf8")) as
      {scripts:Record<string,string>};
    expect(packageJson.scripts["prebuild:cloudflare"]).toContain("check:build-source-syntax");
    expect(packageJson.scripts.prebuild).toContain("check:build-source-syntax");
    expect(packageJson.scripts["postbuild:cloudflare"]).toBe("npm run typecheck");
    expect(packageJson.scripts.postbuild).toBe("npm run typecheck");
    expect(packageJson.scripts["check:build-source-syntax"])
      .toContain("check-build-source-syntax.mjs");
  });
});
