import { z } from "zod";

/**
 * Church-supplied setup values. Location identity does NOT certify state law,
 * local requirements, school opening, or public publishing permission.
 */
export const usStatesAndTerritories = Object.fromEntries([
  [ "AL", "Alabama" ],
  [ "AK", "Alaska" ],
  [ "AZ", "Arizona" ],
  [ "AR", "Arkansas" ],
  [ "CA", "California" ],
  [ "CO", "Colorado" ],
  [ "CT", "Connecticut" ],
  [ "DE", "Delaware" ],
  [ "FL", "Florida" ],
  [ "GA", "Georgia" ],
  [ "HI", "Hawaii" ],
  [ "ID", "Idaho" ],
  [ "IL", "Illinois" ],
  [ "IN", "Indiana" ],
  [ "IA", "Iowa" ],
  [ "KS", "Kansas" ],
  [ "KY", "Kentucky" ],
  [ "LA", "Louisiana" ],
  [ "ME", "Maine" ],
  [ "MD", "Maryland" ],
  [ "MA", "Massachusetts" ],
  [ "MI", "Michigan" ],
  [ "MN", "Minnesota" ],
  [ "MS", "Mississippi" ],
  [ "MO", "Missouri" ],
  [ "MT", "Montana" ],
  [ "NE", "Nebraska" ],
  [ "NV", "Nevada" ],
  [ "NH", "New Hampshire" ],
  [ "NJ", "New Jersey" ],
  [ "NM", "New Mexico" ],
  [ "NY", "New York" ],
  [ "NC", "North Carolina" ],
  [ "ND", "North Dakota" ],
  [ "OH", "Ohio" ],
  [ "OK", "Oklahoma" ],
  [ "OR", "Oregon" ],
  [ "PA", "Pennsylvania" ],
  [ "RI", "Rhode Island" ],
  [ "SC", "South Carolina" ],
  [ "SD", "South Dakota" ],
  [ "TN", "Tennessee" ],
  [ "TX", "Texas" ],
  [ "UT", "Utah" ],
  [ "VT", "Vermont" ],
  [ "VA", "Virginia" ],
  [ "WA", "Washington" ],
  [ "WV", "West Virginia" ],
  [ "WI", "Wisconsin" ],
  [ "WY", "Wyoming" ],
  [ "DC", "District of Columbia" ],
  [ "AS", "American Samoa" ],
  [ "GU", "Guam" ],
  [ "MP", "Northern Mariana Islands" ],
  [ "PR", "Puerto Rico" ],
  [ "VI", "U.S. Virgin Islands" ],
] as const) as Record<string,string>;

const canadianProvinces = Object.fromEntries([
  [ "AB", "Alberta" ],
  [ "BC", "British Columbia" ],
  [ "MB", "Manitoba" ],
  [ "NB", "New Brunswick" ],
  [ "NL", "Newfoundland and Labrador" ],
  [ "NS", "Nova Scotia" ],
  [ "NT", "Northwest Territories" ],
  [ "NU", "Nunavut" ],
  [ "ON", "Ontario" ],
  [ "PE", "Prince Edward Island" ],
  [ "QC", "Quebec" ],
  [ "SK", "Saskatchewan" ],
  [ "YT", "Yukon" ],
] as const) as Record<string,string>;

function normalizedCountry(input:string):string {
  const value=input.trim().toUpperCase().replace(/\./g,"");
  if(["US","USA","UNITED STATES","UNITED STATES OF AMERICA"].includes(value))return "US";
  if(["CA","CAN","CANADA"].includes(value))return "CA";
  if(["UK","UNITED KINGDOM"].includes(value))return "GB";
  return value;
}

function normalizedRegion(input:string,regions:Record<string,string>):string|null {
  const key=input.trim().toUpperCase().replace(/^US[-_]/,"").replace(/^CA[-_]/,"");
  if(Object.hasOwn(regions,key))return key;
  return Object.entries(regions).find(([,name])=>name.toUpperCase()===key)?.[0]??null;
}

const rawAddressSchema=z.object({
  street1:z.string().trim().min(2).max(200),
  street2:z.string().trim().max(200).optional(),
  city:z.string().trim().min(2).max(120),
  state:z.string().trim().min(2).max(80),
  postalCode:z.string().trim().min(3).max(24),
  country:z.string().trim().min(2).max(80).default("US"),
  county:z.string().trim().max(120).optional(),
}).strict();

export const physicalSiteAddressSchema=rawAddressSchema.superRefine((address,ctx)=>{
  const country=normalizedCountry(address.country);
  const state=address.state.trim();
  const postal=address.postalCode.trim();
  if(country==="US") {
    if(!normalizedRegion(state,usStatesAndTerritories))
      ctx.addIssue({code:"custom",path:["state"],message:"Choose a US state, DC, or supported territory."});
    if(!/^\d{5}(?:-\d{4})?$/.test(postal))
      ctx.addIssue({code:"custom",path:["postalCode"],message:"US addresses require a five-digit ZIP or ZIP+4."});
  }else if(country==="CA") {
    if(!normalizedRegion(state,canadianProvinces))
      ctx.addIssue({code:"custom",path:["state"],message:"Choose a Canadian province or territory."});
    if(!/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i.test(postal))
      ctx.addIssue({code:"custom",path:["postalCode"],message:"Choose a valid Canadian postal code."});
  }else if(!/^[A-Z]{2}$/.test(country)||["ZZ","XX","AA"].includes(country)) {
    ctx.addIssue({code:"custom",path:["country"],message:"Use an ISO two-letter country code (such as GB or PH)."});
  }
}).transform(address=>{
  const country=normalizedCountry(address.country);
  return {
    ...address,country,
    state:country==="US" ? normalizedRegion(address.state,usStatesAndTerritories)! :
      country==="CA" ? normalizedRegion(address.state,canadianProvinces)! : address.state.trim(),
    postalCode:country==="CA" ? address.postalCode.toUpperCase().replace(/\s+/g," ").trim()
      :address.postalCode.trim(),
    street2:address.street2?.trim()||undefined,
    county:address.county?.trim()||undefined,
  };
});

export const draftSiteContactSchema = z.object({
  displayName:z.string().trim().min(2).max(160),
  email:z.union([z.string().trim().email().max(254),z.literal("")]),
  phone:z.string().trim().max(40),
  website:z.union([z.string().trim().url().max(500),z.literal("")]),
}).strict().transform(contact=>({...contact,
  email:contact.email.trim().toLowerCase(),website:contact.website.trim(),
}));

/** Days are a count, not a Monday–Friday assumption; Sundays may be scheduled by academic-time. */
export const launchOnsiteDaysPerWeekSchema=z.number().int().min(1).max(7);

/** Explicit IANA zone selection; an address, ZIP, state or browser is not a reliable substitute. */
export const siteTimezoneSchema=z.string().trim().min(3).max(80).refine(zone=>{
  try {new Intl.DateTimeFormat("en-US",{timeZone:zone});return true;}
  catch {return false;}
},"Choose a valid school time zone");

export type PhysicalSiteAddress=z.output<typeof physicalSiteAddressSchema>;
export type DraftSiteContact=z.output<typeof draftSiteContactSchema>;

const stringFrom=(row:Record<string,unknown>,...keys:string[])=>{
  for(const key of keys)if(typeof row[key]==="string" && row[key].trim())return row[key].trim();
  return "";
};

/** Populate an editable form from canonical or legacy Site addresses without publishing them. */
export function siteAddressEditorDraft(value:unknown):{
  street1:string;street2:string;city:string;state:string;
  postalCode:string;country:string;county:string;
} {
  const item=value&&typeof value==="object"&&!Array.isArray(value)
    ? value as Record<string,unknown> : {};
  return {
    street1:stringFrom(item,"street1","line1","addressLine1","address1","streetAddress"),
    street2:stringFrom(item,"street2","line2","addressLine2","address2"),
    city:stringFrom(item,"city","locality"),
    state:stringFrom(item,"state","stateCode","regionCode","region"),
    postalCode:stringFrom(item,"postalCode","zipCode","zip","postal"),
    country:stringFrom(item,"country","countryCode")||"US",
    county:stringFrom(item,"county"),
  };
}

/**
 * Read old Site JSONB shapes without silently changing persisted records.
 * Persist only the canonical structure on an explicit authorized edit.
 */
export function readSitePhysicalAddress(value:unknown):{
  value:PhysicalSiteAddress|null;
  status:"missing"|"church_supplied"|"legacy_needs_review"|"invalid_needs_correction";
} {
  if(!value||typeof value!=="object"||Array.isArray(value))
    return {value:null,status:"missing"};
  const item=value as Record<string,unknown>;
  const legacyKeys=["line1","address1","streetAddress","addressLine1","zip","zipCode","region","regionCode","stateCode","countryCode"];
  const legacy=legacyKeys.some(key=>item[key]!==undefined);
  const candidate=siteAddressEditorDraft(item);
  const parsed=physicalSiteAddressSchema.safeParse(candidate);
  if(!parsed.success)return {value:null,status:"invalid_needs_correction"};
  return {value:parsed.data,status:legacy?"legacy_needs_review":"church_supplied"};
}

export function samePhysicalSiteAddress(current:unknown,next:PhysicalSiteAddress):boolean {
  const read=readSitePhysicalAddress(current);
  if(!read.value||read.status==="legacy_needs_review")return false;
  return (["street1","street2","city","state","postalCode","country","county"] as const)
    .every(key=>(read.value?.[key]??"")===(next[key]??""));
}

export function sameDraftSiteContact(current:unknown,next:DraftSiteContact):boolean {
  const parsed=draftSiteContactSchema.safeParse(current);
  if(!parsed.success)return false;
  return (["displayName","email","phone","website"] as const)
    .every(key=>parsed.data[key]===next[key]);
}

export function hasEnteredSiteAddress(address:Record<string,string>):boolean {
  return Object.entries(address).some(([key,value])=>key!=="country"&&value.trim().length>0);
}

export function nextSiteConfigurationRevision(previous:Date,now=new Date()):Date {
  return new Date(Math.max(now.getTime(),previous.getTime()+1));
}
