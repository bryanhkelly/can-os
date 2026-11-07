import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { renderPublicSiteHtml, availablePublicSitePaths } from "../src/domain/public-site-html.ts";
import { valorReferenceSchool } from "./fixtures/valor-reference-school.mjs";
import { siteTemplateIds } from "../src/domain/site-theme.ts";

// Every scenario is an explicitly fictional visual-QA fixture, NOT a production
// Site preview. Real publication, institutional approval and DNS remain separate.
const academic=(id,title,onsiteDaysPerWeek)=>({programId:id,title,typeLabel:"Hybrid learning",
  summary:"A fictional published program example for visual review, not an enrollment commitment.",
  grades:{min:"K",max:"8"},delivery:{onsite:true,liveOnline:false,asynchronous:true,
  onsiteDaysPerWeek},availability:"planned",applicationOpen:false});
const activity=(id,title)=>({seasonId:id,title,programName:"Enrichment",
  season:"Fall 2027",startsOn:"2027-09-01",endsOn:"2027-11-15",feeAmountCents:0,
  seatsRemaining:null,registrationOpen:false,firstMeeting:null,meetingTimezone:null,packages:[]});
function fictionalSchool(key,name,organizationName,paletteId,typographyId,academicPrograms,offerings){
  return {key,host:key+".can-os.com",site:{name,organizationName},academicPrograms,offerings,
    localContent:{welcomeMessage:"Rooted in local relationships.",
      localDescription:"Our fictional community values meaningful learning and neighborhood service.",
      churchHistory:"An illustrative congregation history for visual QA only.",
      schoolVision:"Families and educators helping young people grow.",
      statementOfFaith:"",spiritualFormation:"",denomination:"",
      branding:{theme:"classic",templateId:key,paletteId,typographyId,heroImage:null}}};
}
const fixtures=[
  valorReferenceSchool,
  ...siteTemplateIds.map(id=>fictionalSchool(id,
    id==="bright-futures" ? "Bright Futures Academy" : id[0].toUpperCase()+id.slice(1)+" Academy",
    "Fictional Partner Community", "signature", "editorial",
    [academic(id+"-learning","Exploration & Discovery",3)],
    [activity(id+"-arts","Community Arts")],
  )),
];
const widths=[1440,1024,768,375,320];
const root=process.env.SCHOOL_VISUAL_DIR || "artifacts/site-visuals";
await fs.mkdir(root,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
try{
  for(const page of fixtures){
    const paths=availablePublicSitePaths(page);
    for(const pathname of paths){
      for(const width of widths){
        // Every page has desktop and mobile evidence. Home also covers the
        // intermediate tablet widths; selected navigation states get 320px.
        if(![1440,375].includes(width) && pathname!=="/")continue;
        const tab=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
        try{
          const html=renderPublicSiteHtml(page,{path:pathname});
          await tab.setContent(html,{waitUntil:"load"});
          const metrics=await tab.evaluate(()=>{
            const links=[...document.querySelectorAll('main a[href^="/"], header a[href^="/"]')]
              .map(a=>a.getAttribute("href"));
            const available=[...document.querySelectorAll('header .desktop-nav a')].map(a=>a.getAttribute("href"));
            return {
              scrollWidth:document.documentElement.scrollWidth,
              scriptCount:document.querySelectorAll("script").length,
              formCount:document.querySelectorAll("form").length,
              skipLink:!!document.querySelector('.skip-link[href="#main-content"]'),
              headingCount:document.querySelectorAll("h1").length,
              invalidLinks:links.filter(href=>!available.includes(href.split(/[?#]/)[0])),
              mobileMenuVisible:getComputedStyle(document.querySelector(".mobile-menu")).display!=="none",
              pageTitle:document.title,
            };
          });
          const filename=`${page.key}-${pathname==="/"?"home":pathname.slice(1)}-${width}.png`;
          await tab.screenshot({path:path.join(root,filename),fullPage:true});
          results.push({school:page.key,page:pathname,width,filename,menuOpen:false,...metrics,
            overflow:metrics.scrollWidth>width});
          if(pathname==="/" && (width===375||width===320)){
            await tab.locator(".mobile-menu summary").click();
            const menuOpen=await tab.locator(".mobile-menu").evaluate(element=>element.open);
            const openFile=`${page.key}-home-menu-open-${width}.png`;
            await tab.screenshot({path:path.join(root,openFile),fullPage:true});
            results.push({school:page.key,page:pathname,width,filename:openFile,menuOpen,
              overflow:(await tab.evaluate(()=>document.documentElement.scrollWidth))>width});
          }
        }finally{await tab.close();}
      }
    }
  }
}finally{await browser.close();}
const failures=results.filter(r=>r.overflow||r.scriptCount||r.formCount||r.skipLink===false||
  r.headingCount!==undefined&&r.headingCount!==1||
  r.invalidLinks?.length||r.menuOpen===false&&r.filename.includes("menu-open"));
await fs.writeFile(path.join(root,"report.json"),JSON.stringify({
  note:"Fictional fixtures only; not deployed/publication/host/authority verification.",
  widths,results,failures,
},null,2)+"\n");
console.log(`Captured ${results.length} fictional visual screenshots across ${fixtures.length} schools; ${failures.length} structural failures.`);
if(failures.length)process.exitCode=1;
