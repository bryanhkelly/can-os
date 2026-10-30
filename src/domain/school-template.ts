export type SchoolTemplate={key:string;title:string;mode:"church_hosted"|"school_extension"|"microschool"|"hybrid";delivery:{onsite:boolean;asynchronous:boolean;liveOnline:boolean;onsiteDaysPerWeek:number};description:string};
export const schoolTemplates:readonly SchoolTemplate[]=[
 {key:"church-hosted",title:"Church-Hosted Academy",mode:"church_hosted",delivery:{onsite:true,asynchronous:true,liveOnline:true,onsiteDaysPerWeek:5},description:"Local supervision with CAN-delivered instruction"},
 {key:"k8-extension",title:"K–8 High School Extension",mode:"school_extension",delivery:{onsite:true,asynchronous:true,liveOnline:true,onsiteDaysPerWeek:3},description:"Retain graduates with flexible secondary instruction"},
 {key:"microschool",title:"Microschool",mode:"microschool",delivery:{onsite:true,asynchronous:true,liveOnline:false,onsiteDaysPerWeek:4},description:"Small independent local cohort"},
 {key:"hybrid",title:"Hybrid Program",mode:"hybrid",delivery:{onsite:true,asynchronous:true,liveOnline:true,onsiteDaysPerWeek:2},description:"Flexible schedule combining local and remote learning"}
];
export function newDraftFromTemplate(template:SchoolTemplate){return {status:"draft" as const,deploymentModel:template.mode,delivery:{...template.delivery},responsibilities:[] as string[]};}
