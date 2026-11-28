const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi, readConfig } = require('../dist/bootstrap');
const id = '00000000-0000-4000-8000-000000000001';
const anonymousCommands = new Set(['requestAccessLink','verifyAccess','registerAccount','requestSiteSignup']);
const publicReads = new Set(['getLiveness']);
const methods = new Set(['get','post','put','patch','delete','head','options']);
test('every documented operation is uniquely identified and fails closed without credentials', async () => {
  const {app,document} = await createApi(readConfig({NODE_ENV:'test',API_CANONICAL_READS:'0',API_CANONICAL_WRITES:'0',API_DOCS:'0'}));
  const seen = new Set();
  const failures = [];
  try {
    await app.listen(0,'127.0.0.1');
    const origin=await app.getUrl();
    for(const [path,entry] of Object.entries(document.paths)){
      for(const [method,op] of Object.entries(entry)){
        if(!methods.has(method))continue;
        const label=method.toUpperCase()+' '+path;
        try{
          assert.ok(op.operationId,'missing operationId');
          assert.ok(!seen.has(op.operationId),'duplicate operationId');
          seen.add(op.operationId);
          assert.ok(path.startsWith('/api/v1/'),'unexpected API version');
          const read=method==='get'||method==='head';
          const publicRead=publicReads.has(op.operationId);
          const anonymousCommand=anonymousCommands.has(op.operationId);
          assert.ok(publicRead||anonymousCommand||op.security?.some(s=>Object.keys(s).length>0),'missing declared authentication');
          assert.ok(Object.keys(op.responses||{}).some(k=>/^2\\d\\d$/.test(k)),'missing success response');
          const response=await fetch(origin+path.replace(/\\{[^}]+\\}/g,id),{
            method:method.toUpperCase(),redirect:'manual',signal:AbortSignal.timeout(5000),
            headers:{'x-person-id':id,'x-role':'platform_owner','x-request-id':'forged',...(read?{}:{Origin:origin,'content-type':'application/json'})},
            ...(read?{}:{body:'{}'})
          });
          assert.equal(response.status,publicRead?200:read?401:503);
          assert.match(response.headers.get('x-request-id')||'',/^[0-9a-f-]{36}$/);
          assert.equal(response.headers.get('cache-control'),'no-store');
          if(!publicRead){
            assert.match(response.headers.get('content-type')||'',/application\\/problem\\+json/);
            const problem=await response.json();
            assert.equal(problem.requestId,response.headers.get('x-request-id'));
            assert.equal(problem.status,response.status);
          }else await response.arrayBuffer();
        }catch(error){failures.push(label+': '+error.message);}
      }
    }
    assert.ok(seen.size>=30,'unexpectedly empty runtime contract');
    assert.deepEqual(failures,[]);
  }finally{await app.close();}
});
