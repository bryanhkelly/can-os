/** Read-only OneRoster 1.2 CSV preview. It never mutates People, enrollments, grades or classes.
 * No certification or complete OneRoster support is claimed. */
export type OneRosterKind="orgs"|"users"|"courses"|"classes"|"enrollments"|"academicSessions"|"lineItems"|"results";
export type OneRosterRow=Record<string,string>;
export type OneRosterPreview={kind:OneRosterKind;headers:string[];rows:OneRosterRow[];errors:string[];warnings:string[]};
const required:Record<OneRosterKind,string[]>={
 orgs:["sourcedId","name","type"],users:["sourcedId","enabledUser","givenName","familyName","role"],
 courses:["sourcedId","title","orgSourcedId"],classes:["sourcedId","title","courseSourcedId","classCode","schoolSourcedId"],
 enrollments:["sourcedId","classSourcedId","schoolSourcedId","userSourcedId","role"],
 academicSessions:["sourcedId","title","type","startDate","endDate"],
 lineItems:["sourcedId","title","assignDate","dueDate","classSourcedId"],
 results:["sourcedId","lineItemSourcedId","studentSourcedId","scoreStatus"],
};
const maxBytes=2_000_000,maxRows=10_000,maxColumns=100;
function csvRows(value:string):string[][]{
 if(value.length>maxBytes)throw new Error("CSV file exceeds the 2MB preview limit.");
 if(value.startsWith("\uFEFF"))value=value.slice(1);
 if(value.includes("\0"))throw new Error("NUL bytes are not valid CSV.");
 const rows:string[][]=[];let row:string[]=[],field="",quoted=false,afterQuote=false;
 for(let i=0;i<value.length;i++){
  const ch=value[i]!;
  if(quoted){
   if(ch==='"'&&value[i+1]==='"'){field+='"';i++;continue;}
   if(ch==='"'){quoted=false;afterQuote=true;continue;}
   field+=ch;continue;
  }
  if(afterQuote){
   if(ch===','||ch==='\n'||ch==='\r'){afterQuote=false;}
   else throw new Error("Unexpected character after CSV quote.");
  }
  if(ch==='"'&&!field&&!afterQuote){quoted=true;continue;}
  if(ch===','||ch==='\n'||ch==='\r'){
   row.push(field);field="";
   if(row.length>maxColumns)throw new Error("Too many CSV columns.");
   if(ch!==','){rows.push(row);row=[];if(ch==='\r'&&value[i+1]==='\n')i++;}
   if(rows.length>maxRows+1)throw new Error("Too many CSV records.");
   continue;
  }
  if(ch==='"')throw new Error("Unexpected CSV quote.");
  field+=ch;
 }
 if(quoted)throw new Error("Unclosed CSV quoted field.");
 if(field!==""||row.length){row.push(field);rows.push(row);}
 return rows;
}
export function previewOneRosterCsv(kind:OneRosterKind,content:string):OneRosterPreview{
 const records=csvRows(content);
 const headers=records.shift()??[];
 if(!headers.length)throw new Error("OneRoster CSV needs a header.");
 if(headers.some(h=>!h||h.trim()!==h)||new Set(headers).size!==headers.length)
  throw new Error("OneRoster headers must be unique, nonempty and unpadded.");
 const missing=required[kind].filter(name=>!headers.includes(name));
 if(missing.length)throw new Error("OneRoster required columns missing: "+missing.join(", "));
 const rows:OneRosterRow[]=[],errors:string[]=[],warnings:string[]=[];
 const used=new Set<string>();
 for(let index=0;index<records.length;index++){
  const record=records[index]!;
  if(record.length!==headers.length){errors.push(`Row ${index+2}: expected ${headers.length} columns but found ${record.length}`);continue;}
  const obj:OneRosterRow={};
  for(let j=0;j<headers.length;j++)obj[headers[j]!] = record[j]!;
  const identifier=obj.sourcedId??"";
  if(!identifier||identifier.length>256){errors.push(`Row ${index+2}: invalid sourcedId`);continue;}
  if(used.has(identifier)){errors.push(`Row ${index+2}: duplicate sourcedId ${identifier}`);continue;}
  used.add(identifier);
  for(const field of required[kind])if(!obj[field]?.trim())errors.push(`Row ${index+2}: ${field} is empty`);
  if(obj.status&&!["active","tobedeleted"].includes(obj.status.toLowerCase()))
   errors.push(`Row ${index+2}: status is not an expected OneRoster lifecycle value`);
  if(kind==="enrollments"&&obj.role&&!["student","teacher","administrator","aide","proctor"].includes(obj.role.toLowerCase()))
   warnings.push(`Row ${index+2}: review enrollment role ${obj.role}`);
  if(kind==="results"&&obj.scoreStatus&&!["fully graded","partially graded","not submitted","submitted","exempt"].includes(obj.scoreStatus.toLowerCase()))
   warnings.push(`Row ${index+2}: review scoreStatus ${obj.scoreStatus}`);
  rows.push(obj);
 }
 return {kind,headers,rows,errors,warnings};
}
export function previewOneRosterBundle(files:Partial<Record<OneRosterKind,string>>){
 const previews=Object.entries(files).map(([kind,data])=>previewOneRosterCsv(kind as OneRosterKind,data));
 const indexed=new Map(previews.map(p=>[p.kind,new Set(p.rows.map(r=>r.sourcedId))]));
 const warnings:string[]=[];
 for(const p of previews){
  const relationships:Partial<Record<OneRosterKind,[string,OneRosterKind][]>>={
   courses:[["orgSourcedId","orgs"]],
   classes:[["courseSourcedId","courses"],["schoolSourcedId","orgs"]],
   enrollments:[["classSourcedId","classes"],["userSourcedId","users"],["schoolSourcedId","orgs"]],
   lineItems:[["classSourcedId","classes"]],
   results:[["lineItemSourcedId","lineItems"],["studentSourcedId","users"]],
  };
  for(const [field,target] of relationships[p.kind]??[]){
   const known=indexed.get(target);
   if(!known)continue;
   for(const row of p.rows)if(row[field]&&!known.has(row[field]))
    warnings.push(`${p.kind}/${row.sourcedId}: ${field} does not match supplied ${target} file`);
  }
 }
 return {previews,warnings,valid:previews.every(p=>p.errors.length===0)&&warnings.length===0};
}
