import {z} from "zod";
import {entityGeographyRoles,type GeographicEntityKind} from "./geographic-intelligence";
const entityKinds=["organization","site","person","program","offering","campaign","partner","funding_opportunity","learning_activity"] as const satisfies readonly GeographicEntityKind[];
export const geographyEntitySchema=z.object({entityKind:z.enum(entityKinds),entityId:z.string().uuid(),role:z.string().max(40)}).strict().superRefine((input,ctx)=>{
 if(!(entityGeographyRoles[input.entityKind] as readonly string[]).includes(input.role))
  ctx.addIssue({code:"custom",path:["role"],message:"Invalid geographic relationship"});
});
export const entityGeographyAreaCode=z.string().min(2).max(80).regex(/^[A-Z0-9][A-Z0-9-]*$/);
export const entityGeographyMutationSchema=z.object({entity:geographyEntitySchema,areaCode:entityGeographyAreaCode,consent:z.boolean().optional()}).strict();
export type GeographyEntity=z.output<typeof geographyEntitySchema>;
export function privateGeography(entity:GeographyEntity){
 return entity.entityKind==="person"||(entity.entityKind==="learning_activity"&&entity.role==="participation");
}
export function assignablePersonalArea(kind:string){return ["country","state","territory","federal_district","metro","micro","csa","region"].includes(kind);}
export function requireEntityGeographyConsent(entity:GeographyEntity,consent:boolean|undefined){
 if(privateGeography(entity)&&consent!==true)throw new Error("Explicit consent is required for optional personal geography");
 if(entity.entityKind==="site")throw new Error("Site delivery geography is derived from the canonical address");
}
