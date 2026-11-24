import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {geographyEntitySchema,entityGeographyMutationSchema} from "@/domain/entity-geography";
import {listEntityGeography,changeEntityGeography} from "./entity-geography.server";
export const getEntityGeography=createServerFn({method:"GET"})
 .validator((input:unknown)=>geographyEntitySchema.parse(input))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return listEntityGeography(getRequest(),data);});
export const assignEntityGeography=createServerFn({method:"POST"})
 .validator((input:unknown)=>entityGeographyMutationSchema.parse(input))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return changeEntityGeography(getRequest(),data.entity,data.areaCode,"assign",data.consent);});
export const withdrawEntityGeography=createServerFn({method:"POST"})
 .validator((input:unknown)=>entityGeographyMutationSchema.parse(input))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return changeEntityGeography(getRequest(),data.entity,data.areaCode,"withdraw");});
