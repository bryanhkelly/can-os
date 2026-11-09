#!/usr/bin/env node
/** Real R2-backed photographic QA of fictional template previews only. */
import fs from "node:fs/promises";
import path from "node:path";
import {chromium} from "playwright";
import {renderPublicSiteHtml} from "../src/domain/public-site-html.ts";
import {emptySiteLocalContent} from "../src/domain/site-local-content.ts";

const base="https://can-os.bryanhkelly.workers.dev";
const templates=["heritage","community","modern","bright-futures","summit","classic","campus"];
const cases=[
  {pathname:"/",width:1440,height:900},
  {pathname:"/",width:768,height:1024},
  {pathname:"/",width:375,height:812},
  {pathname:"/academics",width:1440,height:900},
  {pathname:"/student-life",width:375,height:812},
];
const root="artifacts/template-photo-visuals";
process.env.CAN_TEMPLATE_PHOTO_RESPONSIVE_ENABLED="true";
process.env.CAN_TEMPLATE_PHOTO_EXTRA_SECTIONS_ENABLED="true";
await fs.mkdir(root,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[],failures=[];
try{
  for(const template of templates){
    const page={
      host:"fictional.preview.can-os.example",
      site:{name:template.toUpperCase()+" Demonstration School",
        organizationName:"Fictional CAN OS Example"},
      offerings:[],demonstration:true,
      localContent:{...emptySiteLocalContent,
        schoolVision:"An illustrative school design, not a real campus or student program.",
        localDescription:"This is fictional starter copy for testing website layouts.",
        branding:{...emptySiteLocalContent.branding,templateId:template}},
    };
    for(const {pathname,width,height} of cases){
      const html=renderPublicSiteHtml(page,{path:pathname,
        localPreview:true,sampleTemplate:template})
        .replaceAll("/template-photo/",base+"/template-photo/");
      const tab=await browser.newPage({
        viewport:{width,height},deviceScaleFactor:1,
      });
      const errors=[];
      try{
        await tab.setContent(html,{waitUntil:"load",timeout:30000});
        const media=await tab.evaluate(async()=>{
          const els=[...document.querySelectorAll('img[src*="/template-photo/"]')];
          await Promise.all(els.map(async img=>{
            img.loading="eager";
            try{await img.decode()}catch{}
          }));
          return els.map(img=>({
            currentSrc:img.currentSrc,loaded:img.naturalWidth>0,
            width:img.naturalWidth,height:img.naturalHeight,
          }));
        });
        if(media.length===0)errors.push("No R2-backed template photographs in the rendered page");
        const missing=media.filter(img=>!img.loaded);
        if(missing.length)errors.push(missing.length+" failed to load: "+missing.map(x=>x.currentSrc).join(", "));
        const dimensions=await tab.evaluate(()=>({
          scrollWidth:document.documentElement.scrollWidth,
          viewport:innerWidth,headingCount:document.querySelectorAll("h1").length,
          sourceCount:document.querySelectorAll('picture source').length,
        }));
        if(dimensions.scrollWidth>width+1)
          errors.push("Horizontal overflow: "+dimensions.scrollWidth+" > "+width);
        if(dimensions.headingCount!==1)errors.push("Page has "+dimensions.headingCount+" h1 elements");
        if(pathname==="/" && dimensions.sourceCount<2)
          errors.push("Missing mobile/tablet <picture> sources");
        if(pathname==="/" && width===375){
          const hero=media.find(x=>x.currentSrc.includes("/hero"));
          if(!hero||!hero.currentSrc.includes("c=mobile"))
            errors.push("Mobile browser did not select the 4:5 hero crop");
        }
        const filename=`${template}-${pathname==="/"
          ?"home":pathname.slice(1)}-${width}.png`;
        await tab.screenshot({path:path.join(root,filename),fullPage:true});
        results.push({template,pathname,width,filename,dimensions,media,errors});
      }catch(error){
        errors.push(error instanceof Error?error.message:"unknown rendering error");
        results.push({template,pathname,width,errors});
      }finally{
        if(errors.length)failures.push({template,pathname,width,errors});
        await tab.close();
      }
      console.log(errors.length?"FAIL":"PASS",template,pathname,width,errors.join(" | "));
    }
  }
}finally{await browser.close();}
await fs.writeFile(path.join(root,"report.json"),JSON.stringify({
  checkedAt:new Date().toISOString(),purpose:"Illustrative school templates only",
  cases:results.length,failed:failures.length,results,failures,
},null,2)+"\n");
console.log("Visual snapshots:",results.length," failures:",failures.length);
if(failures.length)process.exitCode=1;
