import ts from "typescript";
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from "node:fs";
import {join,relative,resolve,posix} from "node:path";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../../",import.meta.url));
const nativeActions=new Set(["button","a"]);
const canonicalActions=new Set(["Button","IconButton","Link"]);
function attr(node,name){
 return node.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText()===name);
}
function literal(prop){
 const init=prop?.initializer;
 if(!init)return undefined;
 if(ts.isStringLiteral(init))return init.text;
 if(ts.isJsxExpression(init)){
  const expression=init.expression;
  if(expression&&(ts.isStringLiteral(expression)||ts.isNoSubstitutionTemplateLiteral(expression)))return expression.text;
  if(expression?.kind===ts.SyntaxKind.TrueKeyword)return true;
  if(expression?.kind===ts.SyntaxKind.FalseKeyword)return false;
 }
 return undefined;
}
function hasExplicitName(node){
 return ["aria-label","aria-labelledby","title"].some(name=>{
  const p=attr(node,name);const value=literal(p);
  return p&&!(typeof value==="string"&&!value.trim())&&value!==false;
 });
}
// Conservative source review only. Never invent labels for an unknown action,
// treat dynamic children as unknown, or replace actual browser axe evidence.
export function inspectAccessibleActions(source,path,{composed=[]}={}){
 const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const candidates=[];
 const icons=new Set();
 const composers=new Map();
 for(const statement of file.statements){
  if(!ts.isImportDeclaration(statement)||!ts.isStringLiteral(statement.moduleSpecifier)||statement.importClause?.isTypeOnly)continue;
  const specifier=statement.moduleSpecifier.text;
  const bindings=statement.importClause?.namedBindings;
  if(!bindings||!ts.isNamedImports(bindings))continue;
  const modulePath=(specifier.startsWith("@/")?"src/"+specifier.slice(2):specifier.startsWith(".")?posix.normalize(posix.join(posix.dirname(path.replaceAll("\\","/")),specifier)):specifier).replace(/\.[jt]sx?$/,"");
  for(const element of bindings.elements){
   if(element.isTypeOnly)continue;
   const name=element.propertyName?.text??element.name.text;
   if(specifier==="lucide-react")icons.add(element.name.text);
   if((name==="DashboardShortcut"&&["src/components/workspace/dashboard-layout","src/components/workspace","src/components/workspace/index"].includes(modulePath))||
      (name==="StatCard"&&["src/components/workspace/stat-card","src/components/workspace","src/components/workspace/index"].includes(modulePath)))composers.set(element.name.text,name);
  }
 }
 function contentKind(child){
  if(ts.isJsxText(child))return child.text.trim()?"text":"empty";
  if(ts.isJsxExpression(child)){
   if(!child.expression)return "empty";
   if(ts.isStringLiteral(child.expression))return child.expression.text.trim()?"text":"empty";
   return "unknown";
  }
  if(ts.isJsxFragment(child))return combined(child.children);
  if(ts.isJsxElement(child)||ts.isJsxSelfClosingElement(child)){
   const opening=ts.isJsxElement(child)?child.openingElement:child;
   const tag=opening.tagName.getText(file);
   if(literal(attr(opening,"aria-hidden"))===true||literal(attr(opening,"aria-hidden"))==="true")return "empty";
   if(icons.has(tag))return hasExplicitName(opening)?"unknown":"empty";
   if(tag==="span"&&ts.isJsxElement(child)&&!hasExplicitName(opening))return combined(child.children);
   return "unknown";
  }
  return "unknown";
 }
 function combined(children){
  const kinds=children.map(contentKind);
  return kinds.includes("text")?"text":kinds.includes("unknown")?"unknown":"empty";
 }
 // Only a direct slot child, including a conditional branch, receives the
 // composer content. Keep arbitrary nested links and other modules visible.
 function composingOwner(node){
  let child=ts.isJsxOpeningElement(node)?node.parent:node;
  while(child.parent&&(ts.isParenthesizedExpression(child.parent)||
    (ts.isConditionalExpression(child.parent)&&(child.parent.whenTrue===child||child.parent.whenFalse===child))||
    ts.isJsxExpression(child.parent)))child=child.parent;
  const parent=child.parent;
  if(!parent||!ts.isJsxElement(parent)||!parent.children.includes(child))return null;
  const opening=parent.openingElement,owner=composers.get(opening.tagName.getText(file));
  if(!owner||parent.children.filter(c=>!ts.isJsxText(c)||c.text.trim()).length!==1)return null;
  if(opening.attributes.properties.some(ts.isJsxSpreadAttribute))return null;
  if(owner==="StatCard"){
   const slot=attr(opening,"asChild");
   if(!slot||(slot.initializer&&literal(slot)!==true))return null;
  }
  const label=attr(opening,owner==="StatCard"?"label":"title");
  if(!label?.initializer)return null;
  const value=literal(label);
  if(value===false||(typeof value==="string"&&!value.trim())||
     (ts.isJsxExpression(label.initializer)&&(!label.initializer.expression||
      ["null","undefined","false","true"].includes(label.initializer.expression.getText(file)))))return null;
  return owner;
 }
 function visit(node){
  if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
   const tag=node.tagName.getText(file);
   const action=(nativeActions.has(tag)||canonicalActions.has(tag))&&(tag!=="a"||Boolean(attr(node,"href"))||literal(attr(node,"role"))==="button");
   const spread=node.attributes.properties.some(ts.isJsxSpreadAttribute);
   // A slotted link may supply its name via the child. Dynamic props and
   // children require rendered inspection, not a guessed source violation.
   if(action&&!spread&&!attr(node,"asChild")&&!attr(node,"children")&&!hasExplicitName(node)){
    const children=ts.isJsxOpeningElement(node)&&ts.isJsxElement(node.parent)?node.parent.children:[];
    if(combined(children)==="empty"){
     const at=file.getLineAndCharacterOfPosition(node.getStart(file));
     const owner=composingOwner(node);
     if(owner)composed.push({file:path,line:at.line+1,column:at.character+1,tag,owner,kind:"composed-action-name",review:"Name is supplied by the governed composer; verify rendered name and dynamic labels in browser."});
     else candidates.push({file:path,line:at.line+1,column:at.character+1,tag,kind:"missing-explicit-action-name",review:"Confirm rendered accessible name and add a meaningful label or visible text."});
    }
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(file);
 return candidates;
}
function walk(dir){
 return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const paths=walk(join(root,"src")).filter(p=>p.endsWith(".tsx")&&!/\.(?:test|spec)\.tsx$/.test(p)&&!p.includes("/node_modules/"));
 const composed=[];
 const candidates=paths.flatMap(p=>inspectAccessibleActions(readFileSync(p,"utf8"),relative(root,p).replaceAll("\\","/"),{composed}));
 const result={kind:"source-review-candidates",filesScanned:paths.length,candidates,composed,note:"Static candidates and composed-name locations, not proven accessibility violations or passes. Dynamic names and form associations require browser evidence."};
 const out=join(root,"acceptance-artifacts/storybook-quality");
 mkdirSync(out,{recursive:true});writeFileSync(join(out,"source-accessibility.json"),JSON.stringify(result,null,2)+"\n");
 console.log("Accessible-action source review: "+paths.length+" files; "+candidates.length+" candidates; "+composed.length+" composed-name locations for rendered verification.");
}
