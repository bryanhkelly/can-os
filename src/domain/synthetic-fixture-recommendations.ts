export type AdmissionsScenarioCounts={fresh:number;accepted:number;active:number;blocked:number};
export type FixtureCheck={key:string;count:number;minimum:number;ok:boolean};
export type FixtureRecommendation={key:string;title:string;detail:string;seed:string;critical:boolean};
const fixtureSeeds:Record<string,string>={
 identity:"scripts/seeds/gf2-admissions-test.sql (requires base identities)",
 admissions:"scripts/seeds/gf2-admissions-test.sql",
 seats:"scripts/seeds/gf2-admissions-test.sql",
 journeys:"scripts/seeds/gf2-admissions-test.sql",
 classes:"scripts/seeds/gf40-course-registration.sql",
 groups:"scripts/seeds/gf26-study-groups.sql",
 actions:"Verify synthetic action fixtures and their owners",
 notices:"Verify workflow-triggered notifications and synthetic recipients"
};
export function fixtureRecommendations(checks:FixtureCheck[],admissions:AdmissionsScenarioCounts):FixtureRecommendation[]{
 const recommendations=checks.filter(c=>!c.ok).map(c=>({
  key:c.key,
  title:`Missing ${c.key} fixtures`,
  detail:`Found ${c.count}; need at least ${c.minimum} matching records in this database.`,
  seed:fixtureSeeds[c.key]??"Consult synthetic seed manifest",
  critical:["identity","admissions","seats","journeys"].includes(c.key)
 }));
 const scenarios:[keyof AdmissionsScenarioCounts,string,string][]=[
  ["fresh","No fresh application","Seed an eligible synthetic application with a ready enrollment journey and no offer"],
  ["accepted","No accepted-offer example","Demonstrate the guardian acceptance flow on a disposable test database"],
  ["active","No activated enrollment example","Complete registrar activation and verify the student and guardian read models"],
  ["blocked","No declined-offer example","Provide a second synthetic application and exercise guardian decline"]
 ];
 for(const [key,title,detail] of scenarios){
  if(admissions[key]===0)recommendations.push({key:"scenario-"+key,title,detail,seed:"Complete this scenario through supported service commands; do not directly mutate shared database records",critical:key==="fresh"||key==="active"});
 }
 return recommendations;
}
