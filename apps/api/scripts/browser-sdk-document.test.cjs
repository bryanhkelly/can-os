const {test}=require('node:test');
const assert=require('node:assert/strict');
const {browserSdkDocument}=require('./browser-sdk-document.cjs');
const header=name=>({name,in:'header',required:true,schema:{type:'string'}});
test('browser projection preserves canonical wire requirements and removes only browser-owned headers',()=>{
 const operation={operationId:'selectMyMembership',parameters:[header('Origin'),header('Cookie'),header('Sec-Fetch-Site'),header('Idempotency-Key'),{name:'id',in:'path',required:true,schema:{type:'string'}},{name:'origin',in:'query',required:true,schema:{type:'string'}}],security:[{session:[]}],requestBody:{required:true,content:{'application/json':{schema:{type:'object'}}}},responses:{204:{description:'No content'}}};
 const original={openapi:'3.0.0',paths:{'/api/v1/me/{id}':{post:operation}}};
 const before=structuredClone(original);
 const browser=browserSdkDocument(original);
 assert.deepEqual(original,before);
 const projected=browser.paths['/api/v1/me/{id}'].post;
 assert.deepEqual(projected.parameters.map(p=>p.name),['Idempotency-Key','id','origin']);
 assert.deepEqual(projected.security,operation.security);
 assert.deepEqual(projected.requestBody,operation.requestBody);
 assert.deepEqual(projected.responses,operation.responses);
});
test('path-level and referenced browser headers are removed without dropping caller headers',()=>{
 const original={components:{parameters:{origin:header('ORIGIN'),key:header('Idempotency-Key')}},paths:{'/api/v1/example':{parameters:[{$ref:'#/components/parameters/origin'}],post:{parameters:[{$ref:'#/components/parameters/key'}]}}}};
 const projected=browserSdkDocument(original);
 assert.deepEqual(projected.paths['/api/v1/example'].parameters,[]);
 assert.deepEqual(projected.paths['/api/v1/example'].post.parameters,[{$ref:'#/components/parameters/key'}]);
});
test('unsupported parameter and path references fail closed',()=>{
 assert.throws(()=>browserSdkDocument({paths:{'/a':{get:{parameters:[{$ref:'#/components/parameters/missing'}]}}}}),/Unresolved SDK parameter reference/);
 assert.throws(()=>browserSdkDocument({paths:{'/a':{get:{parameters:[{$ref:'https://example.test/schema'}]}}}}),/Unsupported SDK parameter reference/);
 assert.throws(()=>browserSdkDocument({paths:{'/a':{$ref:'#/x'}}}),/Unsupported SDK path reference/);
});
