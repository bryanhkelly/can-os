import { test, expect, type Browser, type Page, type Locator } from "@playwright/test";
import { z } from "zod";

const base="http://localhost:5183";
const fixture=z.object({
  releaseId:z.string().uuid(),goCode:z.string().regex(/^[A-Za-z0-9_-]{12}$/),
  goActionLabel:z.string().min(1).optional(),
  trainingTitle:z.string().min(1),instructorTitle:z.string().min(1),
  lessons:z.array(z.string().min(1)).length(7),
  baselineAnswers:z.array(z.string().min(1)).length(5),
  finalAnswers:z.array(z.string().min(1)).length(5),
  surveyTitle:z.string().min(1),
}).strict().parse(JSON.parse(process.env.CAN_PILOT_QA_FIXTURE_JSON??"{}"));
if(new Set(fixture.lessons).size!==fixture.lessons.length)throw Error("QA lesson titles must be distinct");

async function actor(browser:Browser,key:string){
  const session=process.env[key];
  if(!session)throw Error("Missing verified isolated QA session");
  const context=await browser.newContext({baseURL:base});
  await context.addCookies([{name:"__Host-can_os_session",value:session,
    url:base,secure:true,httpOnly:true,sameSite:"Lax"}]);
  return context;
}
function assertLocal(page:Page){expect(new URL(page.url()).origin).toBe(base);}
async function open(page:Page,path:string){
  const response=await page.goto(path,{waitUntil:"domcontentloaded"});
  expect(response?.status()).toBeLessThan(500);
  assertLocal(page);
  await expect(page.getByRole("main")).toBeVisible();
}
async function knowledgeCheck(region:Locator,answers:string[]){
  await region.getByRole("button",{name:"Start knowledge check",exact:true}).click();
  const form=region.getByRole("form",{name:"Course knowledge questions"});
  const questions=form.locator("fieldset");
  await expect(questions).toHaveCount(answers.length);
  for(let i=0;i<answers.length;i++){
    await questions.nth(i).getByRole("radio",{name:answers[i],exact:true}).check();
  }
  await expect(region.getByText(/Your answers are saved and can be resumed/)).toBeVisible();
  await form.getByRole("button",{name:"Submit knowledge check",exact:true}).click();
  // This test requires the independently approved objective automatic
  // finalization policy. A provisional/scored-only result is not acceptance.
  await expect(region.getByText("Knowledge check result confirmed",{exact:true})).toBeVisible();
}

test("approved independent noncredit fixture: Go invitation to verified completion and evidence",async({browser})=>{
  const learner=await actor(browser,"CAN_PILOT_QA_LEARNER_SESSION");
  const other=await actor(browser,"CAN_PILOT_QA_OTHER_SESSION");
  const provider=await actor(browser,"CAN_PILOT_QA_PROVIDER_SESSION");
  try{
    const page=await learner.newPage();
    const unrelated=await other.newPage();
    const operator=await provider.newPage();
    let coursePath="";
    await test.step("Resolve public Go invitation to the exact authorized release",async()=>{
      const response=await page.goto("/go/"+fixture.goCode,{waitUntil:"domcontentloaded"});
      expect(response?.status()).toBeLessThan(500);
      assertLocal(page);
      if(fixture.goActionLabel)await page.getByRole("link",{name:fixture.goActionLabel,exact:true}).click();
      await expect(page).toHaveURL(/\/learn\/enroll/);
      assertLocal(page);
      const target=new URL(page.url());
      expect(target.searchParams.get("release")).toBe(fixture.releaseId);
      expect(target.searchParams.get("ref")).toBe(fixture.goCode);
      await expect(page.getByRole("heading",{name:fixture.trainingTitle,exact:true})).toBeVisible();
    });
    await test.step("Enroll with current participation terms",async()=>{
      await page.getByRole("checkbox",{name:/I have read and accept/i}).check();
      await page.getByRole("checkbox",{name:/I confirm I am 18 or older/i}).check();
      await page.getByRole("button",{name:"Confirm my registration",exact:true}).click();
      await expect(page.getByRole("link",{name:"Start learning",exact:true})).toBeVisible();
      await page.getByRole("link",{name:"Start learning",exact:true}).click();
      await expect(page).toHaveURL(/\/learn\/course\//);
      assertLocal(page);coursePath=new URL(page.url()).pathname;
      await expect(page.getByRole("heading",{name:"Your learning journey"})).toBeVisible();
    });
    await test.step("Deny a different verified Person access to the same Course Attempt",async()=>{
      await open(unrelated,coursePath);
      await expect(unrelated.getByRole("heading",{name:"Your learning journey"})).toHaveCount(0);
      await expect(unrelated.getByRole("main")).toContainText(/not authorized|missing required|unable|access/i);
    });
    await test.step("Record starting knowledge before instruction",async()=>{
      await knowledgeCheck(page.getByRole("region",{name:"Before-course diagnostic"}),fixture.baselineAnswers);
    });
    await test.step("Play and explicitly complete all seven approved short recordings",async()=>{
      const choice=page.getByRole("button",{name:fixture.instructorTitle,exact:true});
      const selected=page.getByRole("button",{name:fixture.instructorTitle+" (selected)",exact:true});
      await expect(choice.or(selected)).toBeVisible();
      if(await choice.isVisible())await choice.click();
      const outline=page.getByRole("region",{name:"Recorded instructor"});
      const progress=outline.getByRole("progressbar",{name:"Recorded course lesson completion"});
      await expect(progress).toHaveAttribute("aria-valuemax","7");
      await expect(progress).toHaveAttribute("aria-valuenow","0");
      for(const [index,title] of fixture.lessons.entries()){
        await outline.getByRole("button",{name:title,exact:true}).click();
        const media=outline.getByRole("region",{name:"Video: "+title+" recording",exact:true});
        await media.getByRole("button",{name:"Play video",exact:true}).click();
        const video=media.locator("video");
        await expect(video).toBeVisible();
        await expect.poll(()=>video.evaluate(v=>(v as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
        const duration=await video.evaluate(v=>(v as HTMLVideoElement).duration);
        expect(duration).toBeGreaterThan(0);
        expect(duration).toBeLessThanOrEqual(30); // short QA media, never the real one-hour content
        await video.evaluate(v=>(v as HTMLVideoElement).play());
        await expect.poll(()=>video.evaluate(v=>(v as HTMLVideoElement).ended),{timeout:40000}).toBe(true);
        await outline.getByRole("button",{name:"Mark lesson complete",exact:true}).click();
        await expect(progress).toHaveAttribute("aria-valuenow",String(index+1));
      }
      await page.reload();
      await expect(page.getByRole("progressbar",{name:"Recorded course lesson completion"})).toHaveAttribute("aria-valuenow","7");
    });
    await test.step("Complete the final assessment and submit invited feedback",async()=>{
      const final=page.getByRole("region",{name:"Noncredit knowledge check"});
      await knowledgeCheck(final,fixture.finalAnswers);
      await expect(final.getByText(/met the published threshold/)).toBeVisible();
      const survey=page.getByRole("form",{name:fixture.surveyTitle,exact:true});
      await expect(survey).toBeVisible();
      const ratings=survey.getByRole("combobox");
      await expect(ratings).toHaveCount(4);
      for(let i=0;i<4;i++)await ratings.nth(i).selectOption("5");
      await survey.getByRole("textbox").fill("Synthetic QA feedback: player and assessments exercised.");
      await survey.getByRole("button",{name:"Submit feedback",exact:true}).click();
      await expect(page.getByText("Your feedback has been submitted. Thank you.",{exact:true})).toBeVisible();
      await expect(page.getByRole("region",{name:"Course completion progress"}))
        .toContainText("Training completion recorded.");
    });
    await test.step("Reconcile source-owned provider reporting",async()=>{
      await open(operator,"/programs/noncredit/enrollment");
      const evidence=operator.getByRole("region",{name:"Noncredit program evidence"});
      const table=evidence.getByRole("table",{name:"Training participation and outcome counts"});
      const row=table.getByRole("row").filter({has:table.getByRole("rowheader",{name:fixture.trainingTitle,exact:true})});
      // The fixture training is fresh and belongs only to this run. A result
      // from another training, earlier run or an arbitrary first row cannot pass.
      await expect(row).toHaveCount(1);
      await expect(row.getByRole("cell")).toHaveText(["1","1","1","1"]);
      await expect(evidence.getByText(/percentage points from 1 valid baseline\/final pairs/)).toBeVisible();
    });
  }finally{
    await Promise.all([learner.close(),other.close(),provider.close()]);
  }
});
