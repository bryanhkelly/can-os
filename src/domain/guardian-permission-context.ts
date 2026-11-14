/**
 * The checkbox acknowledges a particular visible request, not merely its ID.
 * A refreshed or edited request must require a new affirmative choice.
 */
export function coursePermissionContext(item: {
 id:string;studentName:string;sectionCode:string;sectionTitle:string;
 deadline:string;status:string;contentReady:boolean;
}): string {
 return JSON.stringify([item.id,item.studentName,item.sectionCode,item.sectionTitle,
  item.deadline,item.status,item.contentReady]);
}

export function groupPermissionContext(item: {
 id:string;groupTitle:string;studentName:string;status:string;
 obsolete:boolean;decision:string|null;
}): string {
 return JSON.stringify([item.id,item.groupTitle,item.studentName,
  item.status,item.obsolete,item.decision]);
}
