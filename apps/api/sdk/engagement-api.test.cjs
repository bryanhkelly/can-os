const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const ts=require('typescript');
const modules=["operation","campaign-api","go-link-api","engagement-registry-api","marketing-package-api","marketing-artifact-api","sender-admin-api","engagement-api"];
/** Isolated adapter mapping tests. No real provider, database or alternate application endpoint. */
function withAdapter(run){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'engagement-sdk-'));
 return Promise.resolve().then(async()=>{
  for(const name of modules){
   const source=fs.readFileSync(path.join(__dirname,name+'.ts'),'utf8');
   const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
   assert.deepEqual(compiled.diagnostics,[]);
   fs.writeFileSync(path.join(temp,name+'.js'),compiled.outputText);
  }
  const {createEngagementApi}=require(path.join(temp,'engagement-api.js'));
  const {requireApiReceipt}=require(path.join(temp,'operation.js'));
  await run(createEngagementApi,requireApiReceipt);
 }).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
}
test('every authenticated controller operation has exactly one SDK adapter',()=>withAdapter(async(createApi)=>{
 const controllers=['go-links','engagement','marketing-packages','marketing-artifacts','sender-admin','campaign'];
 const expected=controllers.flatMap(name=>[...fs.readFileSync(path.join(__dirname,'../src',name+'.controller.ts'),'utf8').matchAll(/operationId:'([^']+)'/g)].map(m=>m[1]));
 const api=createApi({});
 assert.equal(expected.length,39);
 assert.equal(new Set(expected).size,39);
 assert.deepEqual(Object.keys(api).sort(),expected.sort());
}));
test('maps Site path, owner query, revision, explicit request identity and nullable sender state',()=>withAdapter(async(createApi)=>{
 const calls=[];
 const make=(method)=>async(route,options)=>{calls.push({method,route,options});return {data:null,response:new Response(null,{status:200})};};
 const api=createApi({GET:make('GET'),POST:make('POST')});
 await api.listSiteGoLinksPage({data:{siteId:'site',packageId:'package',limit:20,cursor:'next'}});
 assert.deepEqual(calls.pop(),{method:'GET',route:'/api/v1/sites/{siteId}/go-links',options:{params:{path:{siteId:'site'},query:{packageId:'package',limit:20,cursor:'next'}}}});
 await api.createSiteGoLink({data:{siteId:'site',requestId:'stable',destination:{kind:'information',journeyId:'start-a-school'}}});
 assert.deepEqual(calls.pop(),{method:'POST',route:'/api/v1/sites/{siteId}/go-links',options:{params:{path:{siteId:'site'}},body:{requestId:'stable',destination:{kind:'information',journeyId:'start-a-school'}}}});
 await api.listOwnerEngagementDestinations({data:{owner:{kind:'organization',organizationId:'org'},kind:'information'}});
 assert.deepEqual(calls.pop().options.params.query,{ownerKind:'organization',organizationId:'org',kind:'information'});
 await api.listOwnerEngagementDefinitions({data:{owner:{kind:'platform'}}});
 assert.deepEqual(calls.pop().options.params.query,{ownerKind:'platform'});
 assert.equal(await api.readSenderAdministration({data:{organizationId:null}}),null);
 assert.deepEqual(calls.pop().options.params.query,{organizationId:undefined});
 await api.deleteSiteMarketingPackageV61({data:{siteId:'site',packageId:'pkg',expectedRevision:3}});
 assert.deepEqual(calls.pop().options.body,{siteId:'site',packageId:'pkg',expectedRevision:3});
}));
test('a failed or uncertain mutation is never automatically replayed',()=>withAdapter(async(createApi,receipt)=>{
 let calls=0;
 const api=createApi({POST:async()=>{calls++;return {error:{code:'CONFLICT'},response:new Response(null,{status:409})};}});
 await assert.rejects(()=>api.revokeSiteGoLink({data:{siteId:'site',linkId:'link'}}),/409/);
 assert.equal(calls,1);
 assert.throws(()=>receipt({response:new Response(null,{status:200})}),/could not be confirmed/);
 assert.equal(receipt({response:new Response(null,{status:200}),data:null}),null);
}));
