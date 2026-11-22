#!/usr/bin/env node
/**
 * Fail early on malformed TS/TSX/JS/JSX and unresolved local module imports
 * before TanStack Router runs route generation. Otherwise routeTree.gen may
 * never be created and bundler errors obscure the original source defect.
 *
 * Pure local file parsing: no database, network, generated assets or deploy.
 */
import {readdir, readFile} from "node:fs/promises";
import {join, relative, resolve, extname} from "node:path";
import ts from "typescript";
import { duplicateImportBindings } from "../lib/import-binding-conflicts.mjs";
import { sourceDependencySpecifiers } from "../lib/v61-component-dependencies.mjs";
import { unresolvedLocalSourceModule } from "../lib/source-module-resolution.mjs";

const root=resolve(process.cwd());
// Only runtime and build-tool source blocks a production build. Test suites
// are parsed by their own test/CI commands, not production asset generation.
const includeTests=process.argv.includes("--include-tests");
const roots=includeTests ? ["src","scripts","tests"] : ["src","scripts"];
const sourceExts=new Map([
  [".ts",ts.ScriptKind.TS], [".tsx",ts.ScriptKind.TSX],
  [".mts",ts.ScriptKind.TS], [".cts",ts.ScriptKind.TS],
  [".js",ts.ScriptKind.JS], [".jsx",ts.ScriptKind.JSX],
  [".mjs",ts.ScriptKind.JS], [".cjs",ts.ScriptKind.JS],
]);
const ignoredDirs=new Set([
  "node_modules",".git",".output","dist",".next",".vinxi","coverage","playwright-report",
  "test-results",".tanstack",".wrangler",
]);
const files=[];
async function visit(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(entry.isDirectory()){
      if(!ignoredDirs.has(entry.name))await visit(join(dir,entry.name));
    }else if(entry.isFile() && sourceExts.has(extname(entry.name)) &&
       entry.name!=="routeTree.gen.ts"){
      files.push(join(dir,entry.name));
    }
  }
}
for(const dir of roots)await visit(resolve(root,dir));
// Build/tooling configs live at the repository root, outside src/ and scripts/.
// They are executed by Vite, Drizzle, ESLint and Playwright, and malformed
// imports here caused deploy failures even when src/ alone parsed cleanly.
for(const entry of await readdir(root,{withFileTypes:true})){
  if(entry.isFile() && sourceExts.has(extname(entry.name))){
    files.push(join(root,entry.name));
  }
}
files.sort();
let errors=0;
for(const filename of files){
  const source=await readFile(filename,"utf8");
  const kind=sourceExts.get(extname(filename));
  const parsed=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,kind);
  for(const diagnostic of parsed.parseDiagnostics){
    const {line,character}=parsed.getLineAndCharacterOfPosition(diagnostic.start??0);
    const message=ts.flattenDiagnosticMessageText(diagnostic.messageText," ");
    console.error(relative(root,filename)+":"+(line+1)+":"+(character+1)+
      " TS"+diagnostic.code+" "+message);
    errors++;
  }
  // Check local module targets before bundling, including re-exports and
  // type-only/lazy imports. A syntax-valid missing dependency must not
  // masquerade as a TanStack generated-route failure.
  for(const specifier of sourceDependencySpecifiers(parsed, ts)){
    const missing=unresolvedLocalSourceModule(root, filename, specifier);
    if(missing){
      console.error(relative(root,filename)+": Missing local import "+specifier+" (resolved to "+missing+")");
      errors++;
    }
  }
  // Parser diagnostics also miss two imports with the same local binding.
  for(const conflict of duplicateImportBindings(parsed)){
    const {line,character}=parsed.getLineAndCharacterOfPosition(conflict.start);
    console.error(relative(root,filename)+":"+(line+1)+":"+(character+1)+
      " Duplicate import binding: "+conflict.name);
    errors++;
  }
}
if(errors){
  console.error("Source syntax/import gate blocked build: "+errors+
    " syntax, duplicate-binding, or missing-import errors across "+files.length+" files. Fix the first error, then retry.");
  process.exitCode=1;
}else{
  console.log("Source syntax/import gate: "+files.length+
    " TypeScript/JavaScript files parsed with valid local imports.");
}
