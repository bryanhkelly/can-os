#!/usr/bin/env node
/**
 * Fail early on malformed TS/TSX/JS/JSX before TanStack Router runs route
 * generation. Otherwise routeTree.gen is never created and the bundler reports
 * a misleading unresolved import.
 *
 * Pure local file parsing: no database, network, generated assets or deploy.
 */
import {readdir, readFile} from "node:fs/promises";
import {join, relative, resolve, extname} from "node:path";
import ts from "typescript";

const root=resolve(process.cwd());
// Only runtime and build-tool source blocks a production build. Test suites
// are parsed by their own test/CI commands, not production asset generation.
const roots=["src","scripts"];
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
}
if(errors){
  console.error("Source syntax gate blocked build: "+errors+
    " parser errors across "+files.length+" files. Fix the first syntax error, then retry.");
  process.exitCode=1;
}else{
  console.log("Source syntax gate: "+files.length+
    " TypeScript/JavaScript files parsed without syntax errors.");
}
