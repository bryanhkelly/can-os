import {z} from 'zod';
const id=z.string().uuid(),s=z.string(),b=z.boolean(),n=z.number().int().nonnegative(),dt=s.datetime({offset:true});
const obj=<T extends z.ZodRawShape>(shape:T)=>z.object(shape).strict();
const status=z.enum(['in_progress','waiting','resolved']);
const priority=z.enum(['normal','high','urgent']);
const item=obj({id,kind:z.literal('action'),title:s,detail:s,priority:z.enum(['critical','high','normal']),createdAt:dt,href:s,needsResponse:b,type:s,programId:id.nullable(),siteId:id.nullable(),ownerPersonId:id.nullable(),eligibleOwnerPersonId:id.nullable(),ownerName:s.nullable(),dueAt:dt.nullable(),status:s,managedBySupport:b,openingHandoff:b,enrollmentChangeKind:z.enum(['withdrawal','transfer']).nullable()});
const assignee=obj({id,siteId:id.nullable(),role:s,firstName:s,lastName:s});
const site=obj({id,name:s});
const program=site.extend({siteId:id.nullable()}).strict();
const summary=obj({total:n,urgent:n,needsResponse:n,overdue:n,unassigned:n,waiting:n});
const selection=obj({siteId:id.optional(),programId:id.optional()});
const detail=obj({id,title:s,description:s.nullable(),type:s,status:s,priority:s,dueAt:dt.nullable(),resolvedAt:dt.nullable(),resolutionNote:s.nullable(),siteId:id.nullable(),programId:id.nullable(),sectionId:id.nullable(),classId:id.nullable(),canReviewClass:b,canResolveMissingWork:b,canManageOperations:b,workspaceHome:s});
const approvalBase=obj({id,requestedAt:dt,reviewedAt:dt.nullable(),approvedUntil:dt.nullable()});
const active=approvalBase.extend({requestedByAccountId:id,organizationId:id.nullable(),siteId:id.nullable()}).strict();
const pending=obj({id,requestedByAccountId:id,evidenceReference:s,requestedAt:dt,grantId:id,organizationId:id.nullable(),siteId:id.nullable(),role:s});
const evidence=s.trim().min(25).max(1200);
export const params={id:obj({id}),actionId:obj({actionId:id}),approvalId:obj({approvalId:id})};
export const queries={none:obj({}),selection};
export const bodies={
 status:obj({status,resolutionNote:s.trim().max(2000).optional()}).refine(v=>v.status!=='resolved'||!!v.resolutionNote),
 assignment:obj({ownerPersonId:id.nullable(),priority}),
 deadline:obj({dueAt:dt.nullable(),reason:s.trim().min(5).max(500)}),
 resolution:obj({resolutionNote:s.trim().min(10).max(2000)}),
 request:obj({evidenceReference:evidence}),
 review:obj({decision:z.enum(['approve','reject']),evidenceReference:evidence,expiresAt:dt.optional()}).refine(v=>v.decision!=='approve'||!!v.expiresAt),
 revoke:obj({reason:evidence})
};
export const results={
 queue:obj({items:z.array(item).max(250),assignees:z.array(assignee),sites:z.array(site),programs:z.array(program),selected:selection,summary}),
 detail,saved:obj({saved:z.literal(true)}),changed:obj({changed:b}),requested:obj({requested:z.literal(true),approvalId:id}),
 mine:approvalBase.extend({status:s}).strict().nullable(),active:z.array(active).max(101),pending:z.array(pending).max(101),
 decision:obj({status:z.enum(['approved','rejected'])}),revoked:obj({revoked:z.literal(true)})
};
const i={type:'string' as const,format:'uuid'},t={type:'string' as const},date={...t,format:'date-time'},bool={type:'boolean' as const},integer={type:'integer' as const,minimum:0};
const nullable=(v:Record<string,any>)=>({...v,nullable:true});
const choice=(...values:string[])=>({...t,enum:values});
const o=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const a=(items:Record<string,any>,maxItems?:number)=>({type:'array' as const,items,...(maxItems===undefined?{}:{maxItems})});
const yes={...bool,enum:[true]};
const ni=nullable(i),nd=nullable(date),nt=nullable(t);
const ev={...t,minLength:25,maxLength:1200};
const base={id:i,requestedAt:date,reviewedAt:nd,approvedUntil:nd};
const scope={organizationId:ni,siteId:ni};
export const bodyDocs={
 status:o({status:choice('in_progress','waiting','resolved'),resolutionNote:{...t,maxLength:2000}},['status']),
 assignment:o({ownerPersonId:ni,priority:choice('normal','high','urgent')}),
 deadline:o({dueAt:nd,reason:{...t,minLength:5,maxLength:500}}),
 resolution:o({resolutionNote:{...t,minLength:10,maxLength:2000}}),
 request:o({evidenceReference:ev}),
 review:o({decision:choice('approve','reject'),evidenceReference:ev,expiresAt:date},['decision','evidenceReference']),
 revoke:o({reason:ev})
};
export const docs={
 queue:o({items:a(o({id:i,kind:choice('action'),title:t,detail:t,priority:choice('critical','high','normal'),createdAt:date,href:t,needsResponse:bool,type:t,programId:ni,siteId:ni,ownerPersonId:ni,eligibleOwnerPersonId:ni,ownerName:nt,dueAt:nd,status:t,managedBySupport:bool,openingHandoff:bool,enrollmentChangeKind:nullable(choice('withdrawal','transfer'))}),250),assignees:a(o({id:i,siteId:ni,role:t,firstName:t,lastName:t})),sites:a(o({id:i,name:t})),programs:a(o({id:i,name:t,siteId:ni})),selected:o({siteId:i,programId:i},[]),summary:o({total:integer,urgent:integer,needsResponse:integer,overdue:integer,unassigned:integer,waiting:integer})}),
 detail:o({id:i,title:t,description:nt,type:t,status:t,priority:t,dueAt:nd,resolvedAt:nd,resolutionNote:nt,siteId:ni,programId:ni,sectionId:ni,classId:ni,canReviewClass:bool,canResolveMissingWork:bool,canManageOperations:bool,workspaceHome:t}),
 saved:o({saved:yes}),changed:o({changed:bool}),requested:o({requested:yes,approvalId:i}),
 mine:nullable(o({...base,status:t})),active:a(o({...base,requestedByAccountId:i,...scope}),101),
 pending:a(o({id:i,requestedByAccountId:i,evidenceReference:t,requestedAt:date,grantId:i,...scope,role:t}),101),
 decision:o({status:choice('approved','rejected')}),revoked:o({revoked:yes})
};

// Manual work and read-only federated inbox.
export const manualQueries={page:obj({siteId:id.optional(),programId:id.optional(),afterId:id.optional()}),inbox:obj({})};
export const manualBodies={
 create:obj({requestId:id,siteId:id,programId:id.optional(),title:s.trim().min(3).max(200),description:s.trim().max(2000).optional(),ownerPersonId:id.nullable(),priority:priority.default('normal'),dueAt:dt.nullable().optional()}),
 escalate:obj({requestId:id,expectedUpdatedAt:dt,reason:s.trim().min(5).max(500)})
};
const manualRow=obj({id,title:s,status:s,priority,siteId:id.nullable(),programId:id.nullable(),ownerPersonId:id.nullable(),dueAt:dt.nullable(),updatedAt:dt});
const inboxItem=obj({id,title:s,status:s,priority:z.enum(['critical','high','normal']),siteId:id.nullable(),programId:id.nullable(),dueAt:dt.nullable(),createdAt:dt,href:s});
const inboxSource=obj({source:z.enum(['operations','credential_request','credential_review']),items:z.array(inboxItem).max(250),possiblyTruncated:b,limit:n,href:s});
export const manualResults={created:obj({actionId:id,replayed:b}),escalated:obj({changed:b,replayed:b}),page:obj({items:z.array(manualRow).max(50),nextAfterId:id.nullable()}),inbox:obj({sources:z.array(inboxSource).max(3)})};
export const manualBodyDocs={
 create:o({requestId:i,siteId:i,programId:i,title:{...t,minLength:3,maxLength:200},description:{...t,maxLength:2000},ownerPersonId:ni,priority:{...choice('normal','high','urgent'),default:'normal'},dueAt:nd},['requestId','siteId','title','ownerPersonId']),
 escalate:o({requestId:i,expectedUpdatedAt:date,reason:{...t,minLength:5,maxLength:500}})
};
export const manualDocs={
 created:o({actionId:i,replayed:bool}),escalated:o({changed:bool,replayed:bool}),
 page:o({items:a(o({id:i,title:t,status:t,priority:choice('normal','high','urgent'),siteId:ni,programId:ni,ownerPersonId:ni,dueAt:nd,updatedAt:date}),50),nextAfterId:ni}),
 inbox:o({sources:a(o({source:choice('operations','credential_request','credential_review'),items:a(o({id:i,title:t,status:t,priority:choice('critical','high','normal'),siteId:ni,programId:ni,dueAt:nd,createdAt:date,href:t}),250),possiblyTruncated:bool,limit:integer,href:t}),3)})
};
