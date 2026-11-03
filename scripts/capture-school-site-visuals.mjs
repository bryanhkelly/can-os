import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { renderPublicSiteHtml, availablePublicSitePaths } from "../src/domain/public-site-html.ts";

// These are illustrative, fictional fixtures only. No student or church-source data.
const academic=(id,title,onsiteDaysPerWeek)=>({programId:id,title,typeLabel:"Hybrid learning",
  summary:"A fictional published program example for visual review, not an enrollment commitment.",
  grades:{min:"K",max:"8"},delivery:{onsite:true,liveOnline:false,asynchronous:true,
  onsiteDaysPerWeek},availability:"planned"});
const activity=(id,title)=>({seasonId:id,title,programName:"Enrichment",
  season:"Fall 2027",startsOn:"2027-09-01",endsOn:"2027-11-15",feeAmountCents:0,
  seatsRemaining:null,registrationOpen:false,firstMeeting:null,meetingTimezone:null,packages:[]});
const fixtures=[
  ["heritage","Heritage Academy","Heritage Community Church","heritage","traditional",
    [academic("heritage-program","Heritage Academy Hybrid",3)],[activity("art","Arts and service")]],
  ["microschool","Modern Microschool and Community Center","Modern Fellowship","coastal","contemporary",
    [academic("micro-program","Community Hybrid Learning",2)],[]],
  ["enrichment","Community Enrichment School","Community Neighbors Church","copper","editorial",
    [],[activity("robotics","Robotics exploration"),activity("art","Neighborhood arts")]],
];
const widths=[1440,768,375,320],root="artifacts/site-visuals";
await fs.mkdir(root,{recursive:true});
const browser=await chromium.launch({headless:true});const results=[];
try{
 for(const [key,name,organizationName,paletteId,typographyId,academicPrograms,offerings] of fixtures){
  const page={host:key+".can-os.com",site:{name,organizationName},academicPrograms,offerings,
   localContent:{welcomeMessage:"Rooted in local relationships.",localDescription:"Our fictional community values meaningful learning and neighborhood service.",
    churchHistory:"An illustrative congregation history for visual QA only.",
    schoolVision:"Families and educators helping young people grow.",
    statementOfFaith:"",spiritualFormation:"",denomination:"",
    branding:{theme:"classic",paletteId,typographyId,heroImage:null}}};
  const paths=availablePublicSitePaths(page),interior=paths.find(p=>p!=="/")??"/";
  for(const pathname of paths){for(const width of widths){
   if(width!==1440 && pathname!=="/" && pathname!==interior)continue;
   const tab=await browser.newPage({viewport:{width,height:900}});
   try{
    await tab.setContent(renderPublicSiteHtml(page,{path:pathname}),{waitUntil:"load"});
    const metrics=await tab.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,
      hasSkipLink:!!document.querySelector(".skip-link"),
      scriptCount:document.querySelectorAll("script").length}));
    const file=`${key}-${pathname==="/"?"home":pathname.slice(1)}-${width}.png`;
    await tab.screenshot({path:path.join(root,file),fullPage:true});
    results.push({school:key,page:pathname,width,file,...metrics,overflow:metrics.scrollWidth>width});
   }finally{await tab.close();}
  }}
 }
}finally{await browser.close();}
await fs.writeFile(path.join(root,"report.json"),JSON.stringify(results,null,2)+"\n");
console.log(`Captured ${results.length} fictional visual screenshots`);
if(results.some(r=>r.overflow||r.scriptCount||!r.hasSkipLink))process.exitCode=1;
