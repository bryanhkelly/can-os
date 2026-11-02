import { readFile } from "node:fs/promises";
import { checkR2Cors } from "../src/platform/storage/r2-cors.ts";

const [file,...origins]=process.argv.slice(2);
if(!file||!origins.length){
  console.error("Usage: node --import tsx scripts/check-r2-cors.mjs <exported-cors.json> <approved-origin> [...]");
  process.exitCode=1;
}else{
  try{
    const issues=checkR2Cors(JSON.parse(await readFile(file,"utf8")),origins);
    if(issues.length){for(const issue of issues)console.error(issue);process.exitCode=1;}
    else console.log("R2 CORS configuration supports private uploads for all approved origins.");
  }catch(error){console.error("Unable to validate R2 CORS configuration:",error);process.exitCode=1;}
}
