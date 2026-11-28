// Conservative review gate: additive paths/operations/components are allowed;
// changes to an existing wire shape require an explicit reviewed baseline update.
const { readFileSync } = require('node:fs');
const methods = new Set(['get','put','post','delete','options','head','patch','trace']);
const editorial = new Set(['description','summary','externalDocs','example','examples']);
function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalized(value[key])]));
}
function wire(value, map = false) {
  if (Array.isArray(value)) return value.map(item => wire(item));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => map || !editorial.has(key))
    .map(([key, child]) => [key, wire(child, !map && ['properties','responses','headers','content','mapping','patternProperties','schemas','parameters','securitySchemes','requestBodies','callbacks','links','examples'].includes(key) && !Array.isArray(child))]));
}
const equal = (a,b) => JSON.stringify(normalized(wire(a))) === JSON.stringify(normalized(wire(b)));
function compareContracts(base, next) {
  if (!base?.openapi || !next?.openapi || !base.paths || !next.paths) throw new Error('Expected two OpenAPI documents');
  const changes = [];
  const check = (label, a, b) => { if (!equal(a,b)) changes.push(label); };
  for (const key of ['openapi','security','servers','jsonSchemaDialect']) check('document '+key,base[key],next[key]);
  for (const [path, old] of Object.entries(base.paths)) {
    const current = next.paths[path];
    if (!current) { changes.push('removed path '+path); continue; }
    check('path parameters '+path,old.parameters,current.parameters);
    check('path servers '+path,old.servers,current.servers);
    check('path reference '+path,old.$ref,current.$ref);
    for (const [method, operation] of Object.entries(old)) {
      if (!methods.has(method)) continue;
      if (!current[method]) changes.push('removed operation '+method.toUpperCase()+' '+path);
      else check('changed operation '+method.toUpperCase()+' '+path,operation,current[method]);
    }
  }
  for (const [category, entries] of Object.entries(base.components ?? {})) {
    for (const [name, previous] of Object.entries(entries)) {
      const current = next.components?.[category]?.[name];
      if (current === undefined) changes.push('removed component '+category+'/'+name);
      else check('changed component '+category+'/'+name,previous,current);
    }
  }
  return changes;
}
if (require.main === module) {
  const [base, next] = process.argv.slice(2);
  if (!base || !next) throw new Error('Usage: node contract-compatibility.cjs BASELINE.json CANDIDATE.json');
  const changes = compareContracts(JSON.parse(readFileSync(base,'utf8')),JSON.parse(readFileSync(next,'utf8')));
  console.log(JSON.stringify({ reviewRequired: changes.length > 0, changes },null,2));
  if (changes.length) process.exitCode = 1;
}
module.exports = { compareContracts };
