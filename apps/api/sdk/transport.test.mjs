import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createSameOriginFetch} from './transport.mjs';

test('transport preserves method, payload and error status without retries', async () => {
  let calls=0;
  const server=createServer(async(req,res)=>{
    calls++;
    assert.equal(req.url,'/api/v1/me/session/activity');
    assert.equal(req.method,'POST');
    let body='';for await(const part of req)body+=part;
    assert.equal(body,'{}');
    res.writeHead(409,{'content-type':'application/problem+json'}).end(JSON.stringify({status:409,code:'CONFLICT'}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const origin='http://127.0.0.1:'+server.address().port;
    const fetchApi=createSameOriginFetch(origin);
    const response=await fetchApi(new Request(origin+'/api/v1/me/session/activity',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));
    assert.equal(response.status,409);assert.deepEqual(await response.json(),{status:409,code:'CONFLICT'});assert.equal(calls,1);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('transport enforces origin and version, credentials, redirect and cache policy',async()=>{
  const origin='https://app.example.test';let seen;
  const fetchApi=createSameOriginFetch(origin,async request=>{seen=request;return new Response(null,{status:204});});
  await fetchApi(new Request(origin+'/api/v1/me',{credentials:'include',redirect:'follow',cache:'default'}));
  assert.equal(seen.credentials,'same-origin');assert.equal(seen.redirect,'error');assert.equal(seen.cache,'no-store');
  for(const url of ['https://foreign.example/api/v1/me',origin+'/api/v10/me',origin+'/access/request',origin+'/api/v1/../private']){
    await assert.rejects(()=>fetchApi(new Request(url)),/outside application boundary/);
  }
  assert.throws(()=>createSameOriginFetch(origin+'/api/v1'),/exact application origin/);
});

test('recorded instruction adapter forwards pagination and does not replay failed commands',async()=>{
  const {recordedInstructionApi}=await import('./recorded-instruction.ts');
  const calls=[];
  const client={
    GET:async(path,options)=>{calls.push({path,options});return {response:new Response(null,{status:200}),data:{items:[],nextBeforeId:null}};},
    POST:async(path,options)=>{calls.push({path,options});return {response:new Response(null,{status:409}),error:{code:'CONFLICT'}};},
  };
  const api=recordedInstructionApi(client);
  const id='00000000-0000-4000-8000-000000000001',cursor='00000000-0000-4000-8000-000000000002';
  assert.deepEqual(await api.history(id,cursor),{items:[],nextBeforeId:null});
  assert.deepEqual(calls[0].options.params,{path:{courseAttemptId:id},query:{beforeId:cursor}});
  const command={requestId:id,trackVersionId:cursor,expectedRevision:2};
  await assert.rejects(()=>api.select(id,command),{status:409,code:'CONFLICT'});
  assert.equal(calls.length,2);
  assert.deepEqual(calls[1].options.body,command);
  await assert.rejects(()=>api.practice(id,{requestId:id,courseVersionId:id,trackVersionId:cursor,materialId:id,expectedRevision:2,responses:Array.from({length:100},(_,i)=>({promptKey:String(i),response:'😀'.repeat(10000)}))}),{status:413,code:'PAYLOAD_TOO_LARGE'});
  assert.equal(calls.length,2,'oversized UTF-8 payload is rejected before network transmission');
});
