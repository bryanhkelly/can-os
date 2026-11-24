import {z} from "zod";
export const reportingGeographyKinds=["region","state","county","metro","micro","csa"] as const;
export type ReportingGeographyKind=typeof reportingGeographyKinds[number];
export const geographyFilterSchema=z.union([z.literal(""),z.literal("market:unknown"),z.literal("market:outside"),z.string().regex(/^US-(?:[A-Z]{2}|REGION-[A-Z]+|COUNTY-\d{5}|CBSA-\d{5}|CSA-\d{3})$/)]).optional().transform(value=>value??"");
export type GeographyFilter=string;
export type GeographyFilterOption={code:string;name:string;kind:ReportingGeographyKind};
export const geographyFilterGroups:{label:string;kinds:ReportingGeographyKind[]}[]=[
 {label:"Markets",kinds:["metro","micro"]},{label:"Combined markets",kinds:["csa"]},
 {label:"States and territories",kinds:["state"]},{label:"Counties",kinds:["county"]},{label:"Regions",kinds:["region"]},
];
/** A stale selection is never silently broadened to all geography. */
export function hasGeographyFilterOption(value:string,options:readonly GeographyFilterOption[]){
 return value===""||value==="market:unknown"||value==="market:outside"||options.some(o=>o.code===value);
}
