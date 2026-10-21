/**
 * 1EdTech OneRoster 1.2 CSV bulk profile for canonical class rosters.
 * No authentication secrets, hidden PII joins or global tenant reads.
 * Unsupported gradebook and resource files are listed as absent, not fabricated.
 */
export type AcademicSession={id:string;title:string;type:"schoolYear"|"term";startsOn:string;endsOn:string;parentId?:string|null};
export type RosterCourse={id:string;title:string;code:string;subject:string};
export type RosterClass={id:string;title:string;code:string;courseId:string;termId:string};
export type RosterPerson={id:string;givenName:string;familyName:string;grade?:string|null};
export type RosterRegistration={id:string;classId:string;personId:string;role:"student"|"teacher";beginDate?:string|null};
export type OneRosterInput={
  organization:{id:string;name:string};sessions:AcademicSession[];
  courses:RosterCourse[];classes:RosterClass[];people:RosterPerson[];
  registrations:RosterRegistration[];
};

const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const manifestFiles=[
 "academicSessions","categories","classes","classResources","courses","courseResources",
 "demographics","enrollments","lineItemLearningObjectiveIds","lineItems",
 "lineItemScoreScales","orgs","resources","resultLearningObjectiveIds","results",
 "resultScoreScales","roles","scoreScales","userProfiles","userResources","users",
] as const;

/** Spreadsheet formula injection is neutralized in presentation fields before CSV quoting. */
function cell(value:string|null|undefined):string{
  let v=value??"";
  if(/^[\s]*[=+@-]/.test(v))v="'"+v;
  return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
}
function csv(headers:readonly string[],rows:readonly (readonly (string|null|undefined)[])[]):string{
  return [headers.join(","),...rows.map(row=>{
    if(row.length!==headers.length)throw new Error("OneRoster CSV row width mismatch.");
    return row.map(cell).join(",");
  })].join("\r\n")+"\r\n";
}
function requireId(value:string,label:string):void{
 if(!uuid.test(value))throw new Error("Invalid OneRoster "+label+" sourcedId.");
}
function ensureUnique(records:{id:string}[],label:string){
 const ids=new Set<string>();
 for(const record of records){requireId(record.id,label);if(ids.has(record.id))throw new Error("Duplicate "+label+" sourcedId.");ids.add(record.id);}
}
function roleId(id:string,role:string){
 // UUIDv5-like deterministic local export identifier, not a claim of an external sourcedId mapping.
 let h=0;
 const source=id+":"+role;
 for(let i=0;i<source.length;i++)h=Math.imul(h^source.charCodeAt(i),16777619)>>>0;
 const value=(id.replace(/-/g,"").slice(0,24)+h.toString(16).padStart(8,"0")).split("");
 value[12]="5";value[16]="8";
 return [value.slice(0,8),value.slice(8,12),value.slice(12,16),value.slice(16,20),value.slice(20,32)].map(x=>x.join("")).join("-");
}
export function exportOneRoster12Roster(input:OneRosterInput):Record<string,string>{
 const {organization:org,sessions,courses,classes,people,registrations}=input;
 requireId(org.id,"school");if(!org.name.trim())throw new Error("A school name is required.");
 for(const [type,items] of Object.entries({sessions,courses,classes,people,registrations}))ensureUnique(items,type);
 if(classes.length>5000||registrations.length>20000||people.length>20000)throw new Error("OneRoster bulk export exceeds the synchronous safety limit.");
 const sessionIds=new Set(sessions.map(x=>x.id));
 const courseIds=new Set(courses.map(x=>x.id));
 const classIds=new Set(classes.map(x=>x.id));
 const peopleIds=new Set(people.map(x=>x.id));
 for(const s of sessions)if(s.parentId&&!sessionIds.has(s.parentId))throw new Error("Unknown parent academic session.");
 for(const c of classes)if(!courseIds.has(c.courseId)||!sessionIds.has(c.termId))throw new Error("Class references an unknown course or term.");
 for(const r of registrations)if(!classIds.has(r.classId)||!peopleIds.has(r.personId))throw new Error("Enrollment references an unknown class or user.");
 const rows:Record<string,string>={};
 rows["orgs.csv"]=csv(["sourcedId","name","type","identifier","parentSourcedId"],
   [[org.id,org.name,"school","",""]]);
 rows["academicSessions.csv"]=csv(["sourcedId","title","type","startDate","endDate","parentSourcedId","schoolYear"],
   sessions.map(x=>[x.id,x.title,x.type,x.startsOn,x.endsOn,x.parentId??"",x.type==="schoolYear"?x.startsOn.slice(0,4):""]));
 const year=sessions.find(x=>x.type==="schoolYear");
 rows["courses.csv"]=csv(["sourcedId","schoolYearSourcedId","title","courseCode","grades","orgSourcedId","subjects","subjectCodes"],
   courses.map(x=>[x.id,year?.id??"",x.title,x.code,"",org.id,x.subject,""]));
 rows["classes.csv"]=csv(["sourcedId","title","grades","courseSourcedId","classCode","classType","location","schoolSourcedId","termSourcedIds","subjects","subjectCodes"],
   classes.map(x=>[x.id,x.title,"",x.courseId,x.code,"scheduled","",org.id,x.termId,"",""]));
 rows["users.csv"]=csv(["sourcedId","enabledUser","username","userIds","givenName","familyName","middleName","identifier","email","sms","phone","agentSourcedIds","grades","password","primaryOrgSourcedId","userMasterIdentifier","preferredGivenName","preferredMiddleName","preferredFamilyName","pronouns"],
   people.map(x=>[x.id,"true","can-"+x.id,"",x.givenName,x.familyName,"","","","","","",x.grade??"","",org.id,"","","","",""]));
 const distinctRoleIds=new Set<string>();
 const roles: {id:string;personId:string;role:"student"|"teacher"}[]=[];
 for(const r of registrations) {
  const key=r.personId+":"+r.role;
  if(distinctRoleIds.has(key))continue;
  distinctRoleIds.add(key);roles.push({id:roleId(r.personId,r.role),personId:r.personId,role:r.role});
 }
 const primary=new Set<string>();
 rows["roles.csv"]=csv(["sourcedId","userSourcedId","roleType","role","beginDate","endDate","orgSourcedId","userProfileSourcedId"],
   roles.map(r=>{
     const type=primary.has(r.personId)?"secondary":"primary";primary.add(r.personId);
     return [r.id,r.personId,type,r.role,"","",org.id,""];
   }));
 rows["enrollments.csv"]=csv(["sourcedId","classSourcedId","schoolSourcedId","userSourcedId","role","primary","beginDate","endDate"],
   registrations.map(r=>[r.id,r.classId,org.id,r.personId,r.role,r.role==="teacher"?"true":"","",""]));
 rows["manifest.csv"]=csv(["propertyName","value"],[
  ["manifest.version","1.0"],["oneroster.version","1.2"],
  ...manifestFiles.map(f=>["file."+f,rows[f+".csv"]?"bulk":"absent"]),
  ["source.systemName","CAN OS"],["source.systemCode","can-os"],
 ]);
 return rows;
}
