import {expect,test} from "@playwright/test";
import {withAuthenticatedPage} from "../helpers/authenticated-persona";

/**
 * NOT a fake green smoke test: a new adult with only the ONE CAN session must
 * enroll in a native Class without a prior native-v3 cookie, then see and exit
 * the same source record. Test-only QA Class/Person fixtures must be unused.
 * The fixture is intentionally not automatically created in production.
 */
const classId=process.env.CAN_WS00_QA_ONE_HOUR_CLASS_ID!;
const learner=process.env.CAN_WS00_QA_FRESH_LEARNER_CAN_SECRET!;
const baseURL=process.env.CAN_WS00_QA_BASE_URL!;

test("one verified CAN account completes native Class enroll, learn, Activity and withdrawal",async({browser})=>{
  await withAuthenticatedPage(browser,learner,async({page,context})=>{
    // Preconditions: the adult has never completed noncredit onboarding and
    // receives no native Class/learner cookie as a test shortcut.
    const initial=await context.cookies(baseURL);
    expect(initial.some(cookie=>cookie.name==="__Host-can_os_v3_session")).toBe(false);

    await page.goto("/class?classId="+encodeURIComponent(classId));
    await expect(page.getByRole("heading",{name:"My Classes"})).toBeVisible();
    const enroll=page.getByRole("button",{name:"Enroll in Class"});
    await expect(enroll).toBeDisabled();
    await page.getByLabel(/I confirm that I am at least 18 years old/i).check();
    await page.getByLabel(/I have read and accept these participation/i).check();
    await expect(enroll).toBeEnabled();
    await enroll.click();

    // Must be a real authoritative enrollment + canonical Course Attempt.
    // The current implementation requires a preexisting native cookie and
    // is expected to FAIL here until P0 #320 is implemented securely.
    await expect(page.getByText("Enrollment confirmed. Your Course Attempt is ready.")).toBeVisible();
    await expect(page.getByRole("link",{name:"Open Class"})).toBeVisible();

    await page.goto("/learn/my-activity");
    await expect(page.getByRole("heading",{name:"My Activity"})).toBeVisible();
    await expect(page.locator('[data-participation-key^="native_class:"]')).toHaveCount(1);

    await page.goto("/class");
    await page.getByRole("button",{name:"Withdraw from Class"}).click();
    await page.getByRole("button",{name:"Confirm withdrawal"}).click();
    await expect(page.getByText("Participation withdrawn. Your learning history is preserved.")).toBeVisible();

    await page.goto("/learn/my-activity");
    await page.getByRole("button",{name:/History/}).click();
    await expect(page.locator('[data-participation-key^="native_class:"]')).toHaveCount(1);
    await expect(page.getByRole("link",{name:"Open Class"})).toHaveCount(0);
  },baseURL);
});
