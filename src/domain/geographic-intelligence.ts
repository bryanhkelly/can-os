/** Geographic facts never confer organizational or regulatory authority. */
export const geographyKinds = ["country","state","region","county","place","tract","metro","micro","csa","congressional_district","state_legislative_upper","state_legislative_lower","school_district","urban_area"] as const;
export type GeographyKind = typeof geographyKinds[number];
export type GeographicAreaFact = {code:string;name:string;kind:GeographyKind;sourceId:string};
export type GeographicResolution = {
  source:"us-census-geocoder";benchmark:string;vintage:string;
  latitude:number;longitude:number;areas:GeographicAreaFact[];
  marketStatus:"metro"|"micro"|"outside_market"|"unknown";
};
export const entityGeographyRoles = {
  organization:["headquarters","operating_footprint"],site:["physical_delivery"],
  person:["residence"],program:["intended_service"],offering:["availability","delivery"],
  campaign:["target"],partner:["coverage"],funding_opportunity:["eligibility"],
  learning_activity:["delivery","participation"],
} as const;
export type GeographicEntityKind=keyof typeof entityGeographyRoles;
export type EntityGeographyReference = {[K in GeographicEntityKind]:{
  entityKind:K;entityId:string;role:(typeof entityGeographyRoles)[K][number];areaCode:string;
}}[GeographicEntityKind];
/** Pin both the geography source and the default ACS profile cohort to the
 * reviewed release dataset. A later year requires a deliberate version change. */
export const CENSUS_GEOGRAPHY_YEAR = 2024;

function isMarketArea(area: GeographicAreaFact): boolean {
  return area.kind === "metro" || area.kind === "micro";
}

export function marketArea(result: Pick<GeographicResolution, "areas">) {
  return result.areas.find(isMarketArea) ?? null;
}

/** Absence is evidence only when both market boundary layers are complete. */
export function classifyMarketStatus(
  areas: readonly GeographicAreaFact[],
  complete: boolean,
): GeographicResolution["marketStatus"] {
  const markets = areas.filter(isMarketArea);
  if (markets.length > 1) throw new Error("geography_provider_ambiguous_market");
  const kind = markets[0]?.kind;
  if (kind === "metro" || kind === "micro") return kind;
  return complete ? "outside_market" : "unknown";
}
export function communityArea(result:GeographicResolution) {
  return marketArea(result)??result.areas.find(area=>area.kind==="county")??null;
}
export const communityIndicators = {
  population:"B01003_001",medianHouseholdIncome:"B19013_001",
  povertyUniverse:"B17001_001",populationBelowPoverty:"B17001_002",
  households:"B28002_001",householdsWithBroadband:"B28002_004",
  populationUnder18:"B09001_001",civilianLaborForce:"B23025_003",
  unemployed:"B23025_005",languageUniverse:"B16001_001",englishOnly:"B16001_002",
  educationUniverse:"B15003_001",bachelors:"B15003_022",masters:"B15003_023",
  professionalDegree:"B15003_024",doctorate:"B15003_025",
} as const;
export type CommunityIndicatorKey=keyof typeof communityIndicators;
export type CommunityIndicator={estimate:number|null;marginOfError:number|null;variable:string};
export type CommunityProfile={areaCode:string;source:"acs5";year:number;indicators:Record<CommunityIndicatorKey,CommunityIndicator>};
export function censusEstimate(value:unknown):number|null {
  if(typeof value!=="string"||!/^\d+$/.test(value))return null;
  const number=Number(value);return Number.isSafeInteger(number)?number:null;
}
