/** Pure contact intake. No emails are sent and no invitation status is inferred. */
export type FamilyContact = { firstName:string; lastName:string; email:string; phone?:string };
export type FamilyContactIssue = { line:number; raw:string; reason:string; suggested?:FamilyContact };
export type FamilyContactParse = { contacts:FamilyContact[]; issues:FamilyContactIssue[]; duplicates:number };

const emailPattern=/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;
function csvFields(line:string):string[] {
  const values:string[]=[];let value="";let quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'&&quoted&&line[i+1]==='"'){value+='"';i++;continue;}
    if(c==='"'){quoted=!quoted;continue;}
    if(c===","&&!quoted){values.push(value.trim());value="";continue;}
    value+=c;
  }
  values.push(value.trim());
  return values;
}
function parseContact(line:string):FamilyContact|null {
  const angle=line.match(/^(.+?)\s*<([^<>]+)>$/);
  let name="";let email="";let phone:string|undefined;
  if(angle){name=(angle[1]??"").trim();email=(angle[2]??"").trim();}
  else {
    const fields=csvFields(line);
    if(fields.length===1){email=fields[0]??"";}
    else if(fields.length===2){name=fields[0]??"";email=fields[1]??"";}
    else {name=fields[0]??"";email=fields[1]??"";phone=fields[2]||undefined;}
  }
  email=email.toLowerCase();
  if(!emailPattern.test(email))return null;
  const names=name.trim().split(/\s+/).filter(Boolean);
  return {firstName:names[0]??"",lastName:names.slice(1).join(" "),email,...(phone?{phone}:{})};
}
export function parseFamilyContacts(input:string, existingEmails:readonly string[]=[]):FamilyContactParse {
  const seen=new Set(existingEmails.map(email=>email.trim().toLowerCase()));
  const contacts:FamilyContact[]=[];const issues:FamilyContactIssue[]=[];
  let duplicates=0;
  const lines=input.replace(/^\uFEFF/,"").split(/\r?\n/);
  const header=lines[0]?.trim().toLowerCase().replace(/\s/g,"") ?? "";
  const separateNames=/^(?:firstname|first_name),(?:lastname|last_name),email(?:,phone)?$/.test(header);
  lines.forEach((raw,index)=>{
    const line=raw.trim();if(!line)return;
    if(index===0&&(separateNames||/^(name|first\s*name|email)\s*,/i.test(line)))return;
    const columns=separateNames?csvFields(line):[];
    const contact=separateNames
      ? parseContact(`${columns[0]??""} ${columns[1]??""},${columns[2]??""}${columns[3]?","+columns[3]:""}`)
      : parseContact(line);
    if(!contact){issues.push({line:index+1,raw,reason:"Missing or invalid email address"});return;}
    if(seen.has(contact.email)){duplicates++;issues.push({line:index+1,raw,reason:"Duplicate email",suggested:contact});return;}
    seen.add(contact.email);contacts.push(contact);
  });
  return {contacts,issues,duplicates};
}
