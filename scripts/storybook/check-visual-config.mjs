import {readFileSync,readdirSync} from "node:fs";
import {join,relative} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";
const root=fileURLToPath(new URL("../../",import.meta.url));
function walk(dir){
 return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(dir,entry.name)):[join(dir,entry.name)]);
}
const paths=[join(root,".storybook/preview.tsx"),...walk(join(root,"src")).filter(path=>/\.stories\.[jt]sx?$/.test(path))];
const failures=[];
for(const path of paths){
 const source=ts.createSourceFile(path,readFileSync(path,"utf8"),ts.ScriptTarget.Latest,true,path.endsWith("tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 function visit(node){
  if(ts.isPropertyAssignment(node)&&node.name.getText(source).replace(/["']/g,"")==="chromatic"&&ts.isObjectLiteralExpression(node.initializer)){
   for(const property of node.initializer.properties){
    if(ts.isPropertyAssignment(property)&&property.name.getText(source).replace(/["']/g,"")==="viewports"){
      const position=source.getLineAndCharacterOfPosition(property.getStart(source));
      failures.push(relative(root,path)+":"+(position.line+1)+": use named Chromatic Modes, not legacy viewports");
    }
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
}
if(failures.length){console.error(failures.join("\n"));process.exitCode=1;}
else console.log("Named visual configuration contract passed for "+paths.length+" files.");
