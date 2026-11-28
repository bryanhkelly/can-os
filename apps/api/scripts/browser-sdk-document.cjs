// Canonical OpenAPI describes the wire, including headers enforced by the server.
// The browser SDK describes caller-controlled inputs only. Never weaken the wire contract.
const methods = new Set(['get','post','put','patch','delete','head','options','trace']);
function browserSdkDocument(document) {
  const result = structuredClone(document);
  function project(parameters) {
    return parameters?.filter(parameter => {
      if (parameter.$ref) {
        // Do not silently miss a browser-owned header behind a reference.
        const prefix = '#/components/parameters/';
        if (!parameter.$ref.startsWith(prefix)) throw new Error('Unsupported SDK parameter reference');
        const name = parameter.$ref.slice(prefix.length).replace(/~1/g,'/').replace(/~0/g,'~');
        const target = result.components?.parameters?.[name];
        if (!target || target.$ref) throw new Error('Unresolved SDK parameter reference');
        return !browserOwned(target);
      }
      return !browserOwned(parameter);
    });
  }
  function browserOwned(parameter) {
    return parameter.in === 'header' && ['origin','cookie','sec-fetch-site'].includes(parameter.name.toLowerCase());
  }
  for (const item of Object.values(result.paths ?? {})) {
    if (item.$ref) throw new Error('Unsupported SDK path reference');
    if (item.parameters) item.parameters = project(item.parameters);
    for (const [method, operation] of Object.entries(item)) {
      if (!methods.has(method)) continue;
      if (operation.parameters) operation.parameters = project(operation.parameters);
    }
  }
  return result;
}
module.exports = { browserSdkDocument };
