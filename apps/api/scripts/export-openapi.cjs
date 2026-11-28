// Build the real NestJS document, not a second hand-maintained API inventory.
const {mkdir,writeFile}=require('node:fs/promises');
const {resolve}=require('node:path');
const {createApi,readConfig}=require('../dist/bootstrap');
(async()=>{
 const {app,document}=await createApi(readConfig({NODE_ENV:'test',API_DOCS:'0',API_CANONICAL_READS:'0',API_CANONICAL_WRITES:'0'}));
 try{
  const directory=resolve(__dirname,'../sdk/generated');
  await mkdir(directory,{recursive:true});
  await writeFile(resolve(directory,'openapi.json'),JSON.stringify(document,null,2)+'\n');
 }finally{await app.close();}
})().catch(()=>{console.error('OpenAPI export failed');process.exitCode=1;});
