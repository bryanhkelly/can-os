import {z} from "zod";

/** One church-selected folder, with no individual image choices in setup.
 * File names/folder names supply only tentative categorization, NEVER rights.
 * Publication requires authenticated Site review of canonical Documents.
 */
export const siteMediaUploadSchema=z.object({
  siteId:z.string().uuid(),
  fileName:z.string().trim().min(1).max(160)
    .refine(name=>!/[\\/<>\x00-\x1f]/.test(name),"Invalid media file name"),
  folderPath:z.string().max(300).default(""),
  mimeType:z.enum(["image/jpeg","image/png"]),
  size:z.number().int().min(16).max(8*1024*1024),
  width:z.number().int().min(160).max(12000),
  height:z.number().int().min(160).max(12000),
}).strict();
export type SiteMediaUploadInput=z.infer<typeof siteMediaUploadSchema>;

export const siteMediaSubjectReleaseSchema=z.enum([
  "no_identifiable_people","all_identifiable_people_cleared",
]);
export const siteMediaReviewSchema=z.object({
  siteId:z.string().uuid(),
  documentIds:z.array(z.string().uuid()).min(1).max(40)
    .refine(items=>new Set(items).size===items.length,"Duplicate media"),
  /** A single explicit confirmation applies to all submitted files. */
  rightsConfirmed:z.literal(true),
  subjectRelease:siteMediaSubjectReleaseSchema,
  confirmEachFileCovered:z.literal(true),
  reason:z.string().trim().min(10).max(500),
}).strict();

export const siteMediaRevokeSchema=z.object({
  siteId:z.string().uuid(),documentIds:z.array(z.string().uuid()).min(1).max(40),
  reason:z.string().trim().min(10).max(500),
}).strict();

const categories=["school","community","students","classroom","campus","learning",
  "church","leadership","gathering","science","stem","teacher","books",
  "activities","arts","sports","service","building","outdoors","facilities",
  "family","events","welcome"] as const;
const vocabulary:Readonly<Record<string,string[]>>={
  school:["school","academy"],community:["community","fellowship","neighbors"],
  students:["students","pupils","kids"],classroom:["classroom","class","lesson"],
  campus:["campus","schoolyard"],learning:["learning","study","reading"],
  church:["church","chapel"],leadership:["leadership","pastor","director"],
  gathering:["gathering","assembly","meeting"],science:["science","laboratory","lab"],
  stem:["stem","robotics","engineering","coding"],teacher:["teacher","instructor"],
  books:["books","library","book"],activities:["activities","clubs","club"],
  arts:["arts","art","music","painting"],sports:["sports","athletics","soccer","basketball"],
  service:["service","volunteer","outreach"],building:["building","exterior","entrance"],
  outdoors:["outdoors","garden","outside","courtyard"],facilities:["facilities","rooms","gym"],
  family:["family","families","parents"],events:["events","event","celebration"],
  welcome:["welcome","arrival","entrance"],
};

/** Fixed vocabulary prevents filename text from turning into arbitrary public
 * captions, HTML, URLs, or false claims. A classifier may suggest later, but
 * a media reviewer still owns the result. */
export function suggestSiteMediaTags(folderPath:string,fileName:string):string[] {
  const words=(folderPath+" "+fileName).toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const match=new Set(words);
  return categories.filter(category=>vocabulary[category]?.some(word=>match.has(word)));
}

export function siteMediaDecorativeAlt(tags:readonly string[]):string {
  const first=tags.find(tag=>categories.some(category=>category===tag));
  return first ? `Decorative school-supplied photograph tagged ${first}`
    : "Decorative photograph supplied by the school";
}
