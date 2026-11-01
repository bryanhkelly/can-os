// Read-only migration file enumerator: journal is authoritative, not fixed counts.
import {readFileSync,readdirSync} from "node:fs";
const entries=JSON.parse(readFileSync("drizzle/meta/_journal.json","utf8")).entries;
if(!Array.isArray(entries)||!entries.length)throw new Error("Missing Drizzle journal");
const expected=entries.map((entry,index)=>{
 const prefix=String(index).padStart(4,"0")+"_";
 if(entry.idx!==index||typeof entry.tag!=="string"||!entry.tag.startsWith(prefix))
  throw new Error("Migration index mismatch at "+index+": "+entry.tag);
 return entry.tag+".sql";
});
const actual=readdirSync("drizzle").filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort();
if(actual.length!==expected.length||actual.some((name,index)=>name!==expected[index]))
 throw new Error("Committed SQL and journal differ: "+JSON.stringify({expected,actual}));
process.stdout.write(expected.map(name=>"drizzle/"+name).join("\n")+"\n");
