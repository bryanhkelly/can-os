export type GroupKind="course"|"interest";
export type MembershipStatus="pending"|"approved"|"declined"|"left";
export function validateGroupInput(input:{title:string;description:string;kind:string;maxMembers:number}) {
 const title=input.title.trim(),description=input.description.trim();
 if(title.length<3||title.length>100)throw new Error("Group title must be 3–100 characters");
 if(description.length<10||description.length>2000)throw new Error("Group description must be 10–2000 characters");
 if(!["course","interest"].includes(input.kind))throw new Error("Unknown study group kind");
 if(!Number.isInteger(input.maxMembers)||input.maxMembers<2||input.maxMembers>50)throw new Error("Group capacity must be 2–50");
 return {title,description,kind:input.kind as GroupKind,maxMembers:input.maxMembers};
}
export function canAccessGroup(status:MembershipStatus|null,role:"student"|"facilitator") {
 return role==="facilitator"||status==="approved";
}
export function canApproveMembership(actorId:string,facilitatorPersonId:string,subjectId:string){
 return actorId===facilitatorPersonId&&actorId!==subjectId;
}
export function validateGroupPost(text:string){const body=text.trim();if(body.length<1||body.length>3000)throw new Error("Post must be 1–3000 characters");return body;}
export function validateSession(startsAt:string,endsAt:string){
 const start=new Date(startsAt),end=new Date(endsAt);
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new Error("Session requires valid start and end times");
 if(end.getTime()-start.getTime()>4*60*60*1000)throw new Error("Study sessions may last no more than four hours");
 return {start,end};
}
