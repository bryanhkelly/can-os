import ts from 'typescript';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
const errors=[],root=process.cwd();
const read=async path=>{
 const source=ts.createSourceFile(path,await readFile(resolve(root,path),'utf8'),ts.ScriptTarget.Latest,true);
 for(const d of source.parseDiagnostics)errors.push(path+': '+ts.flattenDiagnosticMessageText(d.messageText,' '));
 return source;
};
function visit(node,fn){fn(node);ts.forEachChild(node,n=>visit(n,fn));}
const literal=node=>node&&ts.isStringLiteralLike(node)?node.text:undefined;
const prop=(node,key)=>node&&ts.isObjectLiteralExpression(node)?node.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText()===key)?.initializer:undefined;
const module=await read('apps/api/src/app.module.ts');
const bridge=await read('src/modules/identity/http-governed-workflows.server.ts');
const identity=await read('apps/api/src/identity.service.ts');
const registered=new Set(),implementation=new Set(),declared=new Set(),called=new Set(),operations=new Map(),routes=new Map();
visit(module,n=>{if(ts.isPropertyAssignment(n)&&n.name.getText()==='controllers'&&ts.isArrayLiteralExpression(n.initializer))for(const e of n.initializer.elements)registered.add(e.getText());});
const resolver=bridge.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='resolveGovernedWorkflow');
const returned=resolver?.body?.statements.find(n=>ts.isReturnStatement(n))?.expression;
if(!returned||!ts.isObjectLiteralExpression(returned))errors.push('Governed bridge return object missing');
else for(const p of returned.properties)if(ts.isPropertyAssignment(p)){const name=p.name.getText();if(implementation.has(name))errors.push('Duplicate bridge operation '+name);implementation.add(name);}
const workflow=identity.statements.find(n=>ts.isTypeAliasDeclaration(n)&&n.name.text==='Workflow');
const keyType=workflow?.type?.typeArguments?.[0];
if(!keyType||!ts.isUnionTypeNode(keyType))errors.push('Workflow key union missing');
else for(const t of keyType.types)if(ts.isLiteralTypeNode(t)&&literal(t.literal)!==undefined)declared.add(literal(t.literal));
const files=(await readdir(resolve(root,'apps/api/src'))).filter(p=>p.endsWith('.controller.ts')||p==='identity.ts'||p==='app.module.ts');
for(const file of files){
 const source=await read('apps/api/src/'+file);
 for(const c of source.statements){
  if(!ts.isClassDeclaration(c)||!c.name)continue;
  const decorators=ts.getDecorators(c)??[];
  const controller=decorators.map(d=>d.expression).find(e=>ts.isCallExpression(e)&&e.expression.getText()==='Controller');
  if(!controller)continue;
  if(!registered.has(c.name.text))errors.push('Unregistered controller '+c.name.text);
  const prefix=literal(controller.arguments[0])??'';
  for(const m of c.members){
   if(!ts.isMethodDeclaration(m))continue;
   const ds=(ts.getDecorators(m)??[]).map(d=>d.expression).filter(ts.isCallExpression);
   const http=ds.find(e=>['Get','Post','Put','Patch','Delete'].includes(e.expression.getText()));
   if(!http)continue;
   const op=ds.find(e=>e.expression.getText()==='ApiOperation');
   const opId=literal(prop(op?.arguments[0],'operationId'));
   const location=file+':'+m.name.getText();
   if(!opId)errors.push('Missing explicit operationId '+location);
   else if(operations.has(opId))errors.push('Duplicate operationId '+opId+' '+location);
   else operations.set(opId,location);
   const route='/api/v1/'+[prefix,literal(http.arguments[0])??''].filter(Boolean).join('/');
   const key=http.expression.getText().toUpperCase()+' '+route.replace(/:[^/]+/g,':param');
   if(routes.has(key))errors.push('Duplicate route '+key+' '+location);
   else routes.set(key,location);
   visit(m,n=>{
    if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText()==='workflow')called.add(n.expression.name.text);
   });
  }
 }
}
for(const key of declared)if(!implementation.has(key))errors.push('Typed workflow has no implementation: '+key);
for(const key of implementation)if(!declared.has(key))errors.push('Implementation has no workflow type: '+key);
for(const key of called)if(!implementation.has(key)||!declared.has(key))errors.push('Controller references missing workflow: '+key);
console.log(JSON.stringify({controllerFiles:files.length,operations:operations.size,workflowImplementations:implementation.size,typedWorkflows:declared.size,controllerWorkflowReferences:called.size,errors},null,2));
if(errors.length)process.exitCode=1;
