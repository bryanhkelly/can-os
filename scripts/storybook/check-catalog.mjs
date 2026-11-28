import {readFileSync,readdirSync} from "node:fs";
import {join,relative} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";
const root=fileURLToPath(new URL("../../",import.meta.url));
const groups=new Set(["00 Start here","01 Foundations","02 Primitives","03 Components","04 Application patterns","05 Page layouts","06 Interaction states","07 Persona experiences","08 Feature workspaces","09 Public experiences","10 User journeys","11 Accessibility and responsive","12 Engineering and acceptance"]);
const navigation=JSON.parse(readFileSync(join(root,"docs/design-coverage/storybook-navigation.json"),"utf8"));
const errors=[],titles=new Map(),ids=new Map(),sources=new Map();
const slug=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
function unwrap(node){while(node&&(ts.isSatisfiesExpression(node)||ts.isAsExpression(node)||ts.isParenthesizedExpression(node)))node=node.expression;return node;}
const paths=walk(join(root,"src")).filter(p=>/\.stories\.[jt]sx?$/.test(p));
for(const path of paths){
 const relativePath=relative(root,path).replaceAll("\\","/");
 const source=ts.createSourceFile(path,readFileSync(path,"utf8"),ts.ScriptTarget.Latest,true,path.endsWith("tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const meta=source.statements.flatMap(s=>ts.isVariableStatement(s)?[...s.declarationList.declarations]:[]).find(d=>ts.isIdentifier(d.name)&&d.name.text==="meta");
 const object=unwrap(meta?.initializer);
 if(!object||!ts.isObjectLiteralExpression(object)){errors.push(relativePath+": literal meta object required");continue;}
 function property(name){const p=object.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(source).replace(/["']/g,"")===name);return p&&ts.isStringLiteral(p.initializer)?p.initializer.text:null;}
 const title=property("title"),explicitId=property("id");
 if(!title||!groups.has(title.split("/")[0])||!title.includes("/")){errors.push(relativePath+": use a governed catalog title");continue;}
 const id=explicitId??slug(title);
 if(titles.has(title))errors.push("Duplicate title: "+title+" in "+titles.get(title)+" and "+relativePath);
 if(ids.has(id))errors.push("Duplicate metadata ID: "+id+" in "+ids.get(id)+" and "+relativePath);
 titles.set(title,relativePath);ids.set(id,relativePath);sources.set(relativePath,{title,id,explicitId,source:source.getFullText()});
}
const migrated=new Set();
for(const entry of navigation.migrations){
 if(migrated.has(entry.path))errors.push("Duplicate navigation migration: "+entry.path);
 migrated.add(entry.path);
 const item=sources.get(entry.path);
 if(!item||item.title!==entry.title||item.explicitId!==entry.metaId)errors.push("Navigation identity changed: "+entry.path);
 else for(const name of entry.exports)if(!new RegExp("\\bexport\\s+const\\s+"+name+"\\b").test(item.source))errors.push("Migrated export missing: "+entry.path+"#"+name);
}
console.log(JSON.stringify({families:paths.length,migrated:migrated.size,governedTitles:titles.size,errors},null,2));
if(errors.length)process.exitCode=1;
