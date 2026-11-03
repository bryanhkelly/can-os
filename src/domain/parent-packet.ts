import type { PublicClaim, PublicParentSchoolProfile } from "./parent-information";

/** A transient, print-only view of the same approved public projection.
 * Never persist a second packet or include household/student information. */
function escape(value:string):string {
  return value.replace(/[&<>"']/g, ch=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
  })[ch]!);
}
function shown<T>(claim:PublicClaim<T>):T|null {
  return claim.canDisplay && claim.audience==="public" &&
    (claim.status==="verified"||claim.status==="available")
    ? claim.value : null;
}
export function renderParentPacket(profile:PublicParentSchoolProfile, generatedAt:Date):string {
  if(!Number.isFinite(generatedAt.getTime()))throw new Error("Invalid packet generation date");
  const identity=shown(profile.site.name);
  const school=identity?escape(identity):"School information";
  const organization=shown(profile.site.organizationName);
  const sections:{title:string;body:string}[]=[];
  const add=(title:string, value:string|null|undefined)=>{
    if(value?.trim())sections.push({title,body:escape(value.trim())});
  };
  add("Church and community",shown(profile.churchStory));
  add("Statement of faith",shown(profile.faith));
  add("Spiritual formation",shown(profile.spiritualFormation));
  for(const program of profile.academics){
    const title=shown(program.title),summary=shown(program.summary),grades=shown(program.grades);
    if(title&&summary) add(title,summary+(grades?`\nGrades ${grades.min}–${grades.max}`:""));
  }
  const days=shown(profile.schoolDay.days);
  const start=shown(profile.schoolDay.startTime);
  const end=shown(profile.schoolDay.endTime);
  if(days && start && end){
    const weekday=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    add("School day",`${days.map(day=>weekday[day]).filter(Boolean).join(", ")} · ${start}–${end}`);
  }
  for(const service of profile.services)
    add(service.category.replaceAll("_"," "),shown(service.description));
  add("Tuition",shown(profile.tuition.description) ??
    "Request institution-approved tuition and fee details from admissions.");
  add("Financial assistance",shown(profile.tuition.financialAid));
  add("Admissions",shown(profile.admissions.description) ??
    "Please contact school admissions about current application availability.");
  for(const disclosure of profile.disclosures)
    add(disclosure.category,shown(disclosure.statement));
  add("Public contact",shown(profile.site.contact));
  const body=sections.map(section=>`<section><h2>${escape(section.title)}</h2><p>${section.body.replaceAll("\n","<br>")}</p></section>`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${school} · Parent information</title>
<style>body{font-family:system-ui,sans-serif;color:#213047;max-width:760px;margin:36px auto;padding:0 20px;line-height:1.55}
h1{font-family:Georgia,serif;font-size:2rem}h2{font-size:1.07rem;margin-bottom:6px}
section{margin:22px 0;break-inside:avoid;border-top:1px solid #d7dfe8;padding-top:12px}
p{white-space:normal;overflow-wrap:anywhere;margin:5px 0}header{border-bottom:2px solid #213047;padding-bottom:18px}
small{color:#586778}@media print{body{margin:0;max-width:none}section{break-inside:avoid}}</style></head>
<body><header><h1>${school}</h1>
${organization?`<p>${escape(organization)}</p>`:""}
<small>Public parent overview · Generated ${escape(generatedAt.toISOString().slice(0,10))}</small></header>
<main>${body}</main><footer><small>Information may change. This packet does not certify authorization, admissions, fees or enrollment.</small></footer>
</body></html>`;
}
