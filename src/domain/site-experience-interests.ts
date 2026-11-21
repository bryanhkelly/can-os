import type { SiteProgramsAudiencesV61 } from "./site-launch-preferences";

/** Guided Site vision, never an approved Solution, Course, Class or Offering. */
export const siteExperienceGroups = [
  {id:"academic",title:"Academic & Lifelong Learning",description:"Build knowledge at every stage of life"},
  {id:"stem",title:"Science, Technology & Math",description:"Discover, experiment, design and solve problems"},
  {id:"digital",title:"Digital Life & AI",description:"Use everyday technology with confidence"},
  {id:"money",title:"Money & Financial Wellbeing",description:"Make informed everyday financial decisions"},
  {id:"civic",title:"Civic Life & Democracy",description:"Understand institutions and participate in community life"},
  {id:"careers",title:"Careers & Entrepreneurship",description:"Explore careers, skills and business ownership"},
  {id:"health",title:"Health & Wellness",description:"Move, learn and care for personal wellbeing"},
  {id:"arts",title:"Arts, Culture & Expression",description:"Create, perform and share experiences"},
  {id:"recreation",title:"Sports, Recreation & Exploration",description:"Play, explore and discover the world"},
  {id:"family",title:"Family & Social Connection",description:"Build relationships across generations"},
  {id:"life",title:"Everyday Life & Independence",description:"Strengthen practical skills for daily living"},
  {id:"service",title:"Service & Community Leadership",description:"Contribute, lead and serve neighbors"},
] as const;
export type SiteExperienceGroupId = typeof siteExperienceGroups[number]["id"];
export type SiteExperienceAudienceId = SiteProgramsAudiencesV61["audienceIds"][number];
export type SiteExperienceProgramId = SiteProgramsAudiencesV61["interestIds"][number];

/** Topic IDs retain all 14 V1 values. The remaining topics extend the catalog;
 * group membership never changes or replaces a Site's saved topic ID. */
const rows = [
  ["academic","study-support","Tutoring & Study Support","Homework help|Study groups|Reading practice|Test preparation|Learning strategies"],
  ["academic","languages-cultures","Languages & Culture","Conversation clubs|Language basics|Cultural traditions|Bilingual storytelling|World cultures"],
  ["academic","reading-literacy","Reading & Literacy","Reading circles|Early literacy|Reading practice|Library discovery|Reading together"],
  ["academic","writing-storytelling","Writing & Storytelling","Creative writing|Journaling|Story circles|Public speaking|Personal storytelling"],
  ["academic","mathematics","Mathematics","Math games|Everyday math|Algebra practice|Math challenges|Problem solving"],
  ["academic","ged-adult-learning","Adult Education & GED","Foundational skills|GED preparation|High school completion|Learning workshops|Study coaching"],
  ["academic","college-readiness","College Readiness","College exploration|Applications|Study planning|Scholarship awareness|College success skills"],
  ["stem","science-makers","STEM & Making","Hands-on science|Building challenges|Maker workshops|Design projects|Science demonstrations"],
  ["stem","science-experiments","Science Experiments","Kitchen science|Lab demonstrations|Nature experiments|Scientific observations|Science fairs"],
  ["stem","applied-math","Applied Mathematics","Financial math|Everyday measurements|Data games|Math puzzles|Practical problem solving"],
  ["stem","coding","Coding & Computing","Coding basics|Creative coding|Website building|App projects|Programming challenges"],
  ["stem","robotics","Robotics","Build robots|Program robots|Robotics competitions|Sensors & circuits|Team design challenges"],
  ["stem","engineering-design","Engineering & Design","Bridge challenges|Design thinking|Simple machines|Product prototyping|Engineering teamwork"],
  ["stem","data-science","Data & Analytics","Data storytelling|Charts & graphs|Data projects|Statistics basics|Community data"],
  ["stem","space-science","Space & Astronomy","Space exploration|Star observation|Solar system|Space missions|Astronomy projects"],
  ["digital","digital-confidence","Digital Confidence","Smartphones & tablets|Online safety|Connect with family|Access online services|Everyday AI tools|Digital banking"],
  ["digital","ai-everyday","Everyday AI","AI basics|Practical AI tools|Prompting practice|AI safety|Creative AI projects"],
  ["digital","online-safety","Online Safety","Recognize scams|Password security|Privacy settings|Safe browsing|Digital wellbeing"],
  ["digital","digital-services","Digital Services","Email essentials|Online appointments|Public services online|Video calls|Online forms"],
  ["digital","digital-creativity","Digital Creativity","Photo editing|Podcasting basics|Digital storytelling|Video projects|Digital art"],
  ["money","financial-literacy","Financial Literacy","Creating a budget|Building credit|Banking basics|Protecting against scams|Saving & investing|Retirement planning"],
  ["money","budgeting","Budgeting & Money Management","Household budgets|Spending plans|Debt reduction|Needs versus wants|Saving goals"],
  ["money","banking-credit","Banking & Credit","Opening accounts|Understanding credit|Credit reports|Borrowing responsibly|Digital banking"],
  ["money","saving-investing","Saving & Investing","Emergency savings|Investing basics|Compound growth|Savings goals|Investment risk"],
  ["money","taxes-benefits","Taxes & Benefits","Tax basics|Filing readiness|Benefit awareness|Record keeping|Financial paperwork"],
  ["money","retirement-finances","Retirement Finances","Retirement budgets|Savings options|Income planning|Fraud prevention|Retirement questions"],
  ["money","homeownership","Homeownership","Renting versus owning|Mortgage basics|Home maintenance budgets|First-time buyers|Housing decisions"],
  ["money","fraud-protection","Financial Fraud Prevention","Spot scams|Protect personal data|Identity theft prevention|Safe payments|Reporting fraud"],
  ["civic","voting-elections","Voting & Elections","First-time voting|Understanding the ballot|Voter registration education|Local elections|Election volunteering|Voting accessibility"],
  ["civic","local-government","Local Government","Meet local government|City services|Public meetings|School boards|How budgets work"],
  ["civic","civic-rights","Civic Rights & Responsibilities","Know your rights|Civic responsibilities|Community history|Rights discussions|Public participation"],
  ["civic","media-literacy","Media Literacy","Evaluate sources|Spot misinformation|News discussions|Fact checking|Digital citizenship"],
  ["civic","community-dialogue","Community Dialogue","Listening circles|Issue discussions|Civil disagreement|Community forums|Facilitated conversation"],
  ["civic","public-service","Public Service","Community councils|Public service careers|Local projects|Civic volunteering|Community research"],
  ["civic","civic-leadership","Civic Leadership","Youth councils|Leadership workshops|Town hall practice|Community organizing basics|Public speaking"],
  ["careers","career-skills","Career & Job Skills","Career exploration|Resume support|Interview practice|Workplace readiness|Professional growth"],
  ["careers","resume-interviews","Resumes & Interviews","Resume workshops|Interview practice|Job search skills|Professional profiles|Application coaching"],
  ["careers","trades-certifications","Trades & Certifications","Trade careers|Apprenticeship exploration|Credential pathways|Workplace safety basics|Hands-on skills"],
  ["careers","entrepreneurship","Entrepreneurship","Business ideas|Customer discovery|Simple business plans|Pricing basics|Market days"],
  ["careers","workplace-skills","Workplace Skills","Team communication|Time management|Digital office tools|Customer service|Professional teamwork"],
  ["careers","small-business","Small Business Ownership","Bookkeeping basics|Sales skills|Business registration overview|Marketing basics|Business operations"],
  ["health","wellness-movement","Health & Wellness","Gentle fitness|Walking groups|Nutrition basics|Mental wellbeing|Healthy aging|Balance & mobility"],
  ["health","fitness-mobility","Fitness & Mobility","Stretching|Low-impact exercise|Balance practice|Strength basics|Movement games"],
  ["health","healthy-eating","Healthy Eating","Healthy cooking|Meal planning|Nutrition labels|Food choices|Community recipes"],
  ["health","mental-wellness","Mental Wellbeing","Mindfulness|Stress management|Creative relaxation|Wellbeing conversations|Healthy habits"],
  ["health","healthy-aging","Healthy Aging","Staying active|Fall prevention awareness|Healthy routines|Social wellbeing|Mobility confidence"],
  ["health","first-aid-safety","First Aid & Safety","First aid awareness|CPR awareness|Home safety|Emergency planning|Safety workshops"],
  ["health","caregiving-health","Caregiving & Health Literacy","Caregiver support|Health information skills|Appointment preparation|Care conversations|Community resources"],
  ["arts","arts-creativity","Arts & Creativity","Painting|Photography|Music|Writing|Crafts|Cultural arts"],
  ["arts","music-performing","Music & Performing Arts","Choir & singing|Instruments|Dance|Theater|Performance showcases"],
  ["arts","visual-arts","Visual Arts & Crafts","Drawing|Painting|Sculpture|Craft making|Community exhibitions"],
  ["arts","photography-media","Photography & Media","Phone photography|Photography walks|Photo stories|Video storytelling|Community portraits"],
  ["arts","creative-writing","Creative Writing","Poetry|Short stories|Memoir writing|Writing circles|Story readings"],
  ["arts","cultural-heritage","Cultural Heritage","Local history|Cultural celebrations|Oral histories|Heritage workshops|Traditions & food"],
  ["recreation","trips-excursions","Trips & Excursions","Museums|Nature outings|Local history|Cultural events|Day trips"],
  ["recreation","outdoor-discovery","Outdoors & Nature","Gardening|Nature walks|Parks & trails|Birdwatching|Outdoor exploration"],
  ["recreation","sports-recreation","Sports & Recreation","Team sports|Fitness games|Recreational leagues|Skills clinics|Active play"],
  ["recreation","gardening-nature","Gardening & Nature","Community gardens|Planting projects|Nature observation|Urban gardening|Garden-to-table"],
  ["recreation","museums-places","Museums & Places","Museum visits|Historic sites|Local landmarks|Cultural tours|Community walks"],
  ["recreation","games-hobbies","Games & Hobbies","Board games|Chess|Puzzles|Hobby clubs|Friendly tournaments"],
  ["family","social-connection","Social & Community","Social gatherings|Discussion groups|Shared hobbies|Friendship circles|Community connections"],
  ["family","family-learning","Family Learning","Family workshops|Intergenerational learning|Shared activities|Family projects|Parent-child learning"],
  ["family","parenting","Parenting & Family Life","Parenting conversations|Family routines|Learning at home|Family communication|Parent networks"],
  ["family","caregiving-family","Family Caregiving","Caregiver circles|Supportive conversations|Resource navigation|Respite awareness|Family planning"],
  ["family","intergenerational","Intergenerational Connection","Youth-elder projects|Story sharing|Family history|Shared technology learning|Community gatherings"],
  ["family","clubs-social","Clubs & Social Groups","Interest clubs|Book circles|Coffee gatherings|Game clubs|Conversation groups"],
  ["life","independent-living","Independent Living","Daily routines|Organizing at home|Community navigation|Self-advocacy|Independent decision making"],
  ["life","cooking-food","Cooking & Food Skills","Meal preparation|Kitchen safety|Budget meals|Food storage|Family recipes"],
  ["life","transportation","Transportation & Mobility","Transit basics|Travel planning|Road safety awareness|Getting around town|Accessible travel"],
  ["life","benefits-navigation","Benefits & Community Resources","Finding local services|Understanding forms|Benefits awareness|Resource directories|Help seeking"],
  ["life","emergency-preparedness","Emergency Preparedness","Household plans|Emergency kits|Community readiness|Weather preparedness|Safety drills"],
  ["life","personal-safety","Personal Safety","Home safety|Online safety|Fraud awareness|Safe travel|Recognizing risks"],
  ["service","community-service","Service & Volunteering","Community service days|Volunteer projects|Neighbor support|Food drives|Community improvement"],
  ["service","clubs-leadership","Clubs & Leadership","Student clubs|Peer leadership|Service clubs|Group projects|Leadership practice"],
  ["service","volunteering","Volunteering","Volunteer matching|Service days|Community partnerships|Team volunteering|Local causes"],
  ["service","mentoring","Mentoring & Peer Support","Peer mentoring|Career mentoring|Learning buddies|Intergenerational mentoring|Support circles"],
  ["service","environment-action","Environmental Stewardship","Clean-up days|Recycling projects|Community gardens|Nature restoration|Sustainability skills"],
  ["service","neighborhood-projects","Neighborhood Improvement","Community beautification|Neighbor outreach|Local problem solving|Public space projects|Community mapping"],
] as const;
export type SiteExperienceId = typeof rows[number][1];
export const siteExperienceIds = rows.map(row => row[1]) as [SiteExperienceId, ...SiteExperienceId[]];

export const siteExperienceOutcomes = [
  {id:"confidence",label:"Build confidence",copy:"build confidence"},
  {id:"independence",label:"Gain independence",copy:"gain greater independence"},
  {id:"connection",label:"Make connections",copy:"connect with others"},
  {id:"knowledge",label:"Learn something new",copy:"learn something new"},
  {id:"wellbeing",label:"Improve wellbeing",copy:"support their wellbeing"},
  {id:"career",label:"Prepare for work",copy:"prepare for work"},
  {id:"financial",label:"Build financial security",copy:"strengthen financial wellbeing"},
  {id:"civic",label:"Participate in civic life",copy:"participate in civic life"},
  {id:"service",label:"Serve the community",copy:"serve their community"},
  {id:"family",label:"Strengthen family",copy:"strengthen family ties"},
  {id:"creativity",label:"Express creativity",copy:"express their creativity"},
  {id:"safety",label:"Stay safer",copy:"build practical safety skills"},
  {id:"credentials",label:"Explore credentials",copy:"explore future credentials"},
] as const;
export type SiteExperienceOutcomeId = typeof siteExperienceOutcomes[number]["id"];
export const siteExperienceOutcomeIds = siteExperienceOutcomes.map(item=>item.id)
  as [SiteExperienceOutcomeId,...SiteExperienceOutcomeId[]];
const outcomesByGroup: Record<SiteExperienceGroupId,readonly SiteExperienceOutcomeId[]> = {
  academic:["knowledge","confidence","credentials"],stem:["knowledge","creativity","confidence"],
  digital:["independence","confidence","safety"],money:["financial","confidence","independence"],
  civic:["civic","knowledge","service"],careers:["career","confidence","credentials"],
  health:["wellbeing","independence","connection"],arts:["creativity","connection","confidence"],
  recreation:["wellbeing","connection","knowledge"],family:["family","connection","confidence"],
  life:["independence","confidence","safety"],service:["service","connection","civic"],
};
const programsByGroup: Record<SiteExperienceGroupId,readonly SiteExperienceProgramId[]> = {
  academic:["grades-6-8","grades-9-12","afterschool","summer","adult"],
  stem:["grades-6-8","grades-9-12","afterschool","summer","adult"],
  digital:["grades-9-12","afterschool","summer","adult","senior"],
  money:["grades-9-12","adult","senior"],civic:["grades-9-12","adult","senior"],
  careers:["grades-9-12","summer","adult"],health:["afterschool","summer","adult","senior"],
  arts:["grades-6-8","grades-9-12","afterschool","summer","adult","senior"],
  recreation:["afterschool","summer","adult","senior"],
  family:["afterschool","summer","adult","senior"],
  life:["grades-9-12","adult","senior"],
  service:["grades-6-8","grades-9-12","afterschool","summer","adult","senior"],
};
const audiencesByGroup: Record<SiteExperienceGroupId,readonly SiteExperienceAudienceId[]> = {
  academic:["children","teens","adults"],stem:["children","teens","adults"],
  digital:["teens","adults","older_adults"],money:["teens","adults","older_adults"],
  civic:["teens","adults","older_adults"],careers:["teens","adults"],
  health:["children","teens","adults","older_adults"],
  arts:["children","teens","adults","older_adults"],
  recreation:["children","teens","adults","older_adults"],
  family:["children","teens","adults","older_adults"],
  life:["teens","adults","older_adults"],
  service:["children","teens","adults","older_adults"],
};
const crossGroup: Partial<Record<SiteExperienceId,readonly SiteExperienceGroupId[]>> = {
  "mathematics":["stem"],"applied-math":["academic"],"media-literacy":["digital"],
  "ai-everyday":["stem"],"gardening-nature":["service"],
  "caregiving-health":["family"],"online-safety":["life"],
  "small-business":["money"],"intergenerational":["service"],
  "civic-leadership":["service"],"financial-literacy":["life"],
};
const audienceOverrides: Partial<Record<SiteExperienceId, readonly SiteExperienceAudienceId[]>> = {
  "study-support":["children","teens"],"college-readiness":["teens"],
  "ged-adult-learning":["adults","older_adults"],
  "healthy-aging":["older_adults"],"retirement-finances":["adults","older_adults"],
};
const programOverrides: Partial<Record<SiteExperienceId, readonly SiteExperienceProgramId[]>> = {
  "study-support":["grades-6-8","grades-9-12","afterschool","summer"],
  "ged-adult-learning":["adult","senior"],
  "digital-confidence":["adult","senior","afterschool","summer"],
};

/** Curated chips are identified by topic and stable slug; never generated with
 * an LLM or treated as evidence of actual Site delivery. */
const slug = (label:string) => label.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
export type SiteExperienceCategory = {
  id:SiteExperienceId; title:string; description:string;
  groupIds:readonly SiteExperienceGroupId[];
  activities:readonly {id:string;label:string}[];
  recommendedOutcomeIds:readonly SiteExperienceOutcomeId[];
  programs:readonly SiteExperienceProgramId[];audiences:readonly SiteExperienceAudienceId[];
};
export const siteExperienceCatalog:readonly SiteExperienceCategory[] = rows.map(([group,id,title,chipText])=>({
  id,title,groupIds:[group,...(crossGroup[id]??[])],
  description:"Explore "+title.toLowerCase()+" through guided learning, participation and community activities.",
  activities:chipText.split("|").map(label=>({id:slug(label),label})),
  recommendedOutcomeIds:outcomesByGroup[group],
  programs:programOverrides[id]??programsByGroup[group],
  audiences:audienceOverrides[id]??audiencesByGroup[group],
}));
export const siteExperienceById = new Map(siteExperienceCatalog.map(item=>[item.id,item] as const));

export const siteExperienceAudienceNames:Record<SiteExperienceAudienceId,string> = {
  children:"Children",teens:"Teens",adults:"Adults",older_adults:"Older adults",
};
export const siteExperienceProgramNames:Record<SiteExperienceProgramId,string> = {
  "grades-6-8":"Grades 6–8","grades-9-12":"Grades 9–12",
  afterschool:"After-school",summer:"Summer & Breaks",
  adult:"Adult Learning",senior:"Older Adult Learning",
};
export const siteExperienceLimit = 5;
export const siteExperienceActivityLimit = 4;
export const siteExperienceOutcomeLimit = 3;

export function validCustomExperienceName(value:string):boolean {
  const name=value.trim();
  return name.length>=2 && name.length<=100 &&
    ![...name].some(character=>character.charCodeAt(0)<32 || character==="<" || character===">");
}
export function suggestedSiteExperiences(
  intent:Pick<SiteProgramsAudiencesV61,"interestIds"|"audienceIds">,
):SiteExperienceCategory[]{
  return siteExperienceCatalog.filter(item=>
    (!intent.interestIds.length || item.programs.some(id=>intent.interestIds.includes(id))) &&
    (!intent.audienceIds.length || item.audiences.some(id=>intent.audienceIds.includes(id))));
}
/**
 * A small, intentionally diversified recommendation shortlist for Establish.
 * The broad suggestedSiteExperiences() catalog matcher is too permissive for
 * "Recommended" badges: it may match most topics for adult/senior Sites.
 * Recommendations never write preferences or consume one of the five slots.
 */
export function recommendedSiteExperiences(
  intent:Pick<SiteProgramsAudiencesV61,"interestIds"|"audienceIds">,
):SiteExperienceCategory[]{
  const preferred:SiteExperienceId[]=[];
  const add=(...ids:SiteExperienceId[])=>{preferred.push(...ids);};
  if(intent.interestIds.includes("senior")||intent.audienceIds.includes("older_adults"))
    add("digital-confidence","healthy-aging","financial-literacy","social-connection",
      "voting-elections","trips-excursions");
  if(intent.interestIds.includes("adult")||intent.audienceIds.includes("adults"))
    add("career-skills","financial-literacy","digital-confidence","voting-elections",
      "entrepreneurship","wellness-movement");
  if(intent.interestIds.some(id=>id==="grades-9-12"||id==="grades-6-8")||
     intent.audienceIds.includes("teens"))
    add("study-support","robotics","mathematics","coding","career-skills","clubs-leadership");
  if(intent.interestIds.some(id=>id==="afterschool"||id==="summer")||
     intent.audienceIds.includes("children"))
    add("arts-creativity","science-makers","sports-recreation","outdoor-discovery",
      "study-support","family-learning");
  add("digital-confidence","financial-literacy","science-makers","arts-creativity",
    "wellness-movement","community-service","voting-elections","career-skills");
  const eligible=new Set(suggestedSiteExperiences(intent).map(item=>item.id));
  const unique=[...new Set(preferred)];
  return unique.filter(id=>eligible.has(id)).slice(0,7)
    .flatMap(id=>{const item=siteExperienceById.get(id);return item?[item]:[];});
}

export function describeSiteExperience(
  topic:SiteExperienceCategory,
  detail?:{activityIds:readonly string[];outcomeIds:readonly SiteExperienceOutcomeId[]},
):string{
  const actions=topic.activities.filter(item=>detail?.activityIds.includes(item.id)).map(item=>item.label);
  const outcomes=siteExperienceOutcomes.filter(item=>detail?.outcomeIds.includes(item.id)).map(item=>item.copy);
  if(!actions.length&&!outcomes.length)return topic.description;
  const actionText=actions.length?"We are exploring activities such as "+actions.join(", ").replace(/, ([^,]*)$/," and $1")+". ":"";
  const outcomeText=outcomes.length?"Our hope is to help participants "+
    outcomes.join(", ").replace(/, ([^,]*)$/," and $1")+".":"";
  return (actionText+outcomeText).trim();
}
