import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function* walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) yield* walk(child);
    else if (/\.functions\.tsx?$/.test(entry.name)) yield child.replaceAll('\\', '/');
  }
}
const inventory = [];
for await (const path of walk('src')) {
  const source = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const entries = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer) continue;
      let call;
      let validators=0;
      function inspect(node) {
        if (ts.isCallExpression(node)) {
          if (ts.isIdentifier(node.expression) && node.expression.text==='createServerFn') call=node;
          if (ts.isPropertyAccessExpression(node.expression) && ['validator','inputValidator'].includes(node.expression.name.text)) validators++;
        }
        ts.forEachChild(node, inspect);
      }
      inspect(declaration.initializer);
      if (!call) continue;
      const arg=call.arguments[0];
      const method=arg&&ts.isObjectLiteralExpression(arg)
        ? arg.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(source)==='method') : undefined;
      entries.push({name:declaration.name.getText(source),method:method&&ts.isStringLiteral(method.initializer)?method.initializer.text:'UNSPECIFIED',hasValidator:validators>0});
    }
  }
  inventory.push({path,operations:entries});
}
inventory.sort((a,b)=>a.path.localeCompare(b.path));
const operations=inventory.flatMap(f=>f.operations);
console.log(JSON.stringify({files:inventory.length,detectedOperations:operations.length,
  byMethod:Object.fromEntries([...new Set(operations.map(o=>o.method))].sort().map(m=>[m,operations.filter(o=>o.method===m).length])),
  filesWithoutDetectedOperations:inventory.filter(f=>f.operations.length===0).map(f=>f.path),
  inventory},null,2));
// This inventory is a source heuristic, not an API contract or a proof of authorization.
// Files with no detected operations and alias-based server function declarations need review.
