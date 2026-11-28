const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compareContracts}=require('./contract-compatibility.cjs');
function base(){return {openapi:'3.0.0',paths:{'/api/v1/me':{get:{operationId:'getMe',description:'old',security:[{session:[]}],responses:{200:{description:'OK',content:{'application/json':{schema:{$ref:'#/components/schemas/Me'}}}}}}}},components:{schemas:{Me:{type:'object',required:['description'],properties:{description:{type:'string'}}}}}};}
test('additive operations and editorial changes do not require baseline replacement',()=>{
 const old=base(),next=structuredClone(old);
 next.paths['/api/v1/me'].get.description='new';
 next.paths['/api/v1/new']={get:{operationId:'new'}};
 next.components.schemas.New={type:'string'};
 assert.deepEqual(compareContracts(old,next),[]);
});
test('removals, security changes and field changes require review',()=>{
 const old=base(),next=structuredClone(old);
 next.paths['/api/v1/me'].get.security=[];
 next.components.schemas.Me.properties.description.type='number';
 assert.deepEqual(compareContracts(old,next),['changed operation GET /api/v1/me','changed component schemas/Me']);
 delete next.paths['/api/v1/me'];
 assert.ok(compareContracts(old,next).includes('removed path /api/v1/me'));
});
test('path-level parameters, operation IDs and top-level servers are part of the wire review',()=>{
 const old=base(),next=structuredClone(old);
 next.paths['/api/v1/me'].parameters=[{in:'query',name:'required',required:true}];
 next.paths['/api/v1/me'].get.operationId='changed';
 next.servers=[{url:'https://other.example'}];
 assert.deepEqual(compareContracts(old,next),['document servers','path parameters /api/v1/me','changed operation GET /api/v1/me']);
});
