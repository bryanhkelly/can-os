import { resolveSchoolBrand } from "./school-brand-identity";
import type { SiteLocalBranding } from "./site-local-content";
import type { SiteTemplateId } from "./site-theme";

/**
 * The supplied ZIP is visual reference material, not executable website or
 * email code. The canonical Site brand is the ONLY source of design tokens.
 * These seven family-facing visual systems share safe, bounded school facts.
 */
export type FamilyBrandContext = {
  siteName: string;
  branding: SiteLocalBranding;
  introduction?: string;
};
export type FamilyBrandEmailKind = "confirmation" | "update" | "survey";
export type FamilyBrandPageKind = "landing" | "survey";
export type FamilyBrandPreviewKind = FamilyBrandPageKind | `email-${FamilyBrandEmailKind}`;

const editorial: Record<SiteTemplateId,{headline:string;lead:string;tagline:string;eyebrow:string}> = {
  heritage:{headline:"The making of remarkable lives.",lead:"A considered approach to learning, character and community.",tagline:"Rooted in promise. Ready for possibility.",eyebrow:"The School Journal"},
  community:{headline:"Known by name. Growing together.",lead:"A place to belong, serve and grow with a caring community.",tagline:"A place to belong and grow.",eyebrow:"Community Bulletin"},
  modern:{headline:"Not one path. Your path.",lead:"Purposeful independent learning supported by people who know you.",tagline:"Discover your path.",eyebrow:"School Field Notes"},
  "bright-futures":{headline:"Big dreams start small.",lead:"A welcoming community for imagination, purpose and growth.",tagline:"Grow with possibility.",eyebrow:"Good Things Ahead"},
  summit:{headline:"Reach beyond.",lead:"An intentional learning journey, supported every step of the way.",tagline:"The journey ahead.",eyebrow:"Summit Dispatch"},
  classic:{headline:"An education of enduring purpose.",lead:"The lasting value of character, curiosity and careful thinking.",tagline:"Faith. Scholarship. Character.",eyebrow:"The Classical Review"},
  campus:{headline:"Every day tells a story.",lead:"Belonging, discovery and new possibilities for every learner.",tagline:"A school journal.",eyebrow:"Campus Notes"},
};

function escape(value: unknown): string {
  return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function safeHref(value: string): string {
  try {
    const u=new URL(value, "https://invalid.example");
    return u.protocol==="https:" || (value.startsWith("/") && !value.startsWith("//"))
      ? escape(value) : "#";
  } catch { return "#"; }
}
function design(context:FamilyBrandContext){
  const brand=resolveSchoolBrand(context.siteName,context.branding);
  const copy=editorial[brand.templateId];
  const shape=brand.templateId==="community"?"999px":brand.templateId==="bright-futures"?"20px":
    brand.templateId==="modern"?"4px":brand.templateId==="campus"?"14px":"0";
  return {brand,copy,shape};
}
const statusCopy="School in planning · Not accepting applications. No opening, admissions, tuition or authorization claims are made here.";
const learningCopy="Explore structured, often asynchronous instruction; connect with adults for questions and academic support; and build confident independent learning habits.";

function shell(context:FamilyBrandContext,title:string,body:string,preview:boolean,kind:FamilyBrandPageKind) {
  const {brand,copy,shape}=design(context);
  const ink=brand.theme.ink,canvas=brand.theme.canvas,accent=brand.accent;
  const css=`:root{--ink:${ink};--paper:${canvas};--accent:${accent};--radius:${shape};--display:${brand.theme.displayFont};--body:${brand.theme.bodyFont}}
  *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 var(--body)}
  h1,h2{font-family:var(--display);line-height:1.12;letter-spacing:-.025em}
  h1{font-size:clamp(2.6rem,7.3vw,5.8rem);margin:.5em 0}h2{font-size:clamp(1.6rem,3vw,2.5rem)}
  a{color:inherit}a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
  .skip{position:absolute;left:-9999px}.skip:focus{left:12px;top:8px;z-index:5;background:white;color:black;padding:8px}
  .status{padding:12px 5%;background:#fff3d8;color:#3e2d15;text-align:center;font-size:.83rem;font-weight:700}
  .preview{padding:12px 5%;background:#fef08a;color:#302b10;font-size:.84rem;text-align:center;font-weight:800}
  .top{padding:20px 6%;background:var(--ink);color:var(--paper);display:flex;justify-content:space-between;align-items:center;gap:20px}
  .brand{font-family:var(--display);font-weight:bold;letter-spacing:.08em;font-size:1.1rem;text-decoration:none}
  .mark{display:inline-grid;place-items:center;min-width:43px;height:43px;padding:5px;border:1px solid var(--accent);color:var(--accent);margin-right:12px;border-radius:var(--radius)}
  .eyebrow{text-transform:uppercase;font-size:.73rem;letter-spacing:.19em;font-weight:800}
  .hero{padding:clamp(45px,7vw,110px) 6%;max-width:1280px;margin:auto;display:grid;gap:40px;align-items:center;grid-template-columns:1.1fr .9fr}
  .hero .lead{font-size:clamp(1.1rem,2vw,1.4rem);max-width:46rem}
  .hero-art{min-height:330px;border:2px solid var(--ink);border-radius:var(--radius);display:grid;place-items:center;background:var(--ink);color:var(--paper);padding:36px;text-align:center}
  .hero-art strong{font:700 clamp(2.8rem,7vw,6rem)/1 var(--display);color:var(--accent)}
  .hero-art small{display:block;margin-top:20px;letter-spacing:.2em}
  .main{max-width:1130px;margin:auto;padding:20px 6% 75px}
  .panel{background:#ffffff;border:1px solid #00000024;border-radius:var(--radius);padding:clamp(24px,5vw,50px)}
  .row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
  .row article{border-top:3px solid var(--ink);padding-top:16px}
  .form{max-width:740px;margin:45px auto 0;padding:clamp(24px,5vw,45px);background:white;border:1px solid #00000032;border-radius:var(--radius)}
  label{display:block;font-weight:650;margin:1rem 0 .25rem}input:not([type=checkbox]),textarea,select{display:block;width:100%;padding:13px 14px;border:1px solid #617184;border-radius:7px;background:white;color:#112034;font:inherit}
  .choice{display:flex;align-items:flex-start;gap:10px;font-weight:400;margin:12px 0}
  .choice input{margin-top:5px}.group{margin:22px 0}.group strong{display:block}
  button,.button{display:inline-block;padding:15px 24px;background:var(--ink);color:var(--paper);border:2px solid var(--ink);border-radius:var(--radius);font-weight:800;font:700 .95rem var(--body);text-decoration:none;cursor:pointer}
  button:disabled{opacity:.55;cursor:not-allowed}
  .secondary{display:inline-block;margin:12px;color:var(--ink)}
  .fine{font-size:.83rem;color:#425164}
  footer{padding:38px 6%;background:var(--ink);color:var(--paper);font-size:.86rem}
  .visually-hidden{position:absolute;left:-9999px}
  body[data-design=community] .hero,body[data-design=campus] .hero{text-align:center;grid-template-columns:1fr}
  body[data-design=community] .hero-art,body[data-design=campus] .hero-art{min-height:210px}
  body[data-design=modern] .hero{max-width:none;background:var(--ink);color:var(--paper)}
  body[data-design=modern] .hero-art{border-color:var(--accent)}
  body[data-design=summit] .hero{max-width:none;background:linear-gradient(120deg,var(--ink),#183b54);color:var(--paper)}
  body[data-design=bright-futures] .hero-art{transform:rotate(-2deg);box-shadow:10px 10px 0 var(--accent)}
  body[data-design=classic] .hero-art{border:7px double var(--accent)}
  body[data-design=campus] .hero-art{border:4px solid var(--accent);box-shadow:8px 8px 0 #bbc5cf}
  @media(max-width:820px){.hero,.row{grid-template-columns:1fr}.hero-art{min-height:210px}.top{flex-wrap:wrap}}
  @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow"><title>${escape(title)} · ${escape(brand.schoolName)}</title>
    <style>${css}</style></head><body data-design="${brand.templateId}">
    <a class="skip" href="#main">Skip to content</a>
    ${preview?'<div class="preview" role="note">PRIVATE DESIGN PREVIEW · Forms do not submit or save data.</div>':""}
    <div class="status" role="note">${statusCopy}</div>
    <header class="top"><span class="brand"><span class="mark" aria-hidden="true">${escape(brand.monogram)}</span>${escape(brand.schoolName)}</span>
      <span class="eyebrow">${escape(copy.eyebrow)}</span></header>
    ${body}
    <footer><strong>${escape(brand.schoolName)}</strong> · ${escape(copy.tagline)}<p>${statusCopy} A response is not a school application or an enrollment offer.</p>
      ${preview?'<p>Preview only. Nothing is saved or sent.</p>':'<p>To stop future updates, contact the school and request removal.</p>'}
    </footer></body></html>`;
}

function inputs(context:FamilyBrandContext,params:FamilyPageParams){
 const formHidden=`<input type="hidden" name="requestId" value="${escape(params.requestId)}">
   <input type="hidden" name="invitationBatchId" value="${escape(params.batchId)}">
   <input type="hidden" name="invitationRecipientKey" value="${escape(params.recipientKey)}">`;
 const first=escape(params.firstName??""), last=escape(params.lastName??""),email=escape(params.email??"");
 return `${formHidden}<div class="row" style="grid-template-columns:1fr 1fr">
   <div><label for="first">First name</label><input id="first" name="firstName" required maxlength="80" autocomplete="given-name" value="${first}"></div>
   <div><label for="last">Last name</label><input id="last" name="lastName" required maxlength="80" autocomplete="family-name" value="${last}"></div>
   </div><label for="email">Your email</label><input id="email" type="email" name="email" autocomplete="email" required maxlength="254" readonly value="${email}">
   <div class="visually-hidden" aria-hidden="true"><label for="website">Website</label><input id="website" type="text" name="website" tabindex="-1" autocomplete="off"></div>`;
}

export type FamilyPageParams={
  preview:boolean; requestId:string;batchId:string;recipientKey:string;
  firstName?:string;lastName?:string;email?:string;
  landingHref:string;surveyHref:string;
};

/** Seven uniquely composed, responsive and accessible interest landing pages. */
export function renderFamilyBrandPage(context:FamilyBrandContext,kind:FamilyBrandPageKind,params:FamilyPageParams):string {
 const {brand,copy}=design(context);
 const intro=context.introduction?.trim().slice(0,600);
 const hero=kind==="landing"?`<section class="hero"><div><div class="eyebrow">Family interest · ${escape(copy.eyebrow)}</div><h1>${escape(copy.headline)}</h1>
   <p class="lead">${escape(intro||copy.lead)}</p><a class="button" href="#respond">${kind==="landing"?"Tell us what matters":"Take the survey"}</a></div>
   <div class="hero-art" aria-label="${escape(brand.schoolName)} identity"><div><strong>${escape(brand.monogram)}</strong><small>${escape(copy.tagline)}</small></div></div></section>`:
   `<section class="hero"><div><div class="eyebrow">Three-minute family survey</div><h1>Your perspective matters.</h1>
   <p class="lead">Tell us what you value in a school. Your feedback helps with planning; nothing here is an application.</p>
   <a class="secondary" href="${safeHref(params.landingHref)}">Return to school introduction</a></div>
   <div class="hero-art"><div><strong>03</strong><small>MINUTES · YOUR VOICE</small></div></div></section>`;
 const learning=`<section class="panel"><span class="eyebrow">How CAN learning works</span>
   <h2>Expert instruction. A community around every learner.</h2><p>${learningCopy}</p>
   <div class="row"><article><strong>01 · Learn</strong><p>Follow structured, independently paced instructional material.</p></article>
   <article><strong>02 · Ask</strong><p>Get support from designated adults and academic staff when needed.</p></article>
   <article><strong>03 · Grow</strong><p>Receive feedback and develop stronger learning habits.</p></article></div></section>`;
 const shared=inputs(context,params);
 const survey=`<div class="group"><strong>What grade levels are you interested in?</strong>
   <label class="choice"><input type="radio" name="grades" value="middle" required> Middle school (6–8)</label>
   <label class="choice"><input type="radio" name="grades" value="high"> High school (9–12)</label>
   <label class="choice"><input type="radio" name="grades" value="both"> Both / still exploring</label></div>
   <div class="group"><label for="priority">What is most important to you?</label><select id="priority" name="priority" required>
     <option value="">Select one</option><option value="academics">Strong academics</option>
     <option value="community">Community and belonging</option><option value="flexibility">Flexible learning pace</option>
     <option value="faith">Faith and character</option><option value="communication">Family communication</option>
     <option value="affordability">Affordability</option></select></div>
   <div class="group"><label for="learningPace">How comfortable is your family with independent, asynchronous learning?</label>
     <select id="learningPace" name="learningPace" required><option value="">Choose one</option>
     <option value="comfortable">Comfortable</option><option value="curious">Curious, with questions</option>
     <option value="support">Would want substantial support</option></select></div>
   <div class="group"><label for="contactPreference">Would you like any follow-up?</label>
     <select id="contactPreference" name="contactPreference" required><option value="">Choose one</option>
     <option value="email">Occasional email updates</option><option value="events">Information events</option>
     <option value="none">No updates after this response</option></select></div>
   <label for="comments">Anything else you would like the school to know? (optional)</label>
   <textarea id="comments" name="comments" maxlength="250" rows="3"></textarea>`;
 const interest=`<label for="message">What would you like to know? (optional)</label><textarea id="message" name="message" maxlength="500" rows="3"></textarea>`;
 const consent=`<label class="choice"><input type="checkbox" name="contactConsent" value="yes" required>
   <span>I am an adult and consent to this school receiving my response${kind==="survey"?", with follow-up only if I select it":" and contacting me about its plans"}. I can ask to stop updates at any time.</span></label>`;
 const form=`<form class="form" id="respond" method="post" action="/family/interest">
   <span class="eyebrow">${kind==="survey"?"Family feedback":"Stay in the conversation"}</span>
   <h2>${kind==="survey"?"Tell us what matters to your family.":"Share your interest."}</h2>
   ${shared}
   <input type="hidden" name="responseKind" value="${kind}">
   ${kind==="survey"?survey:interest}
   ${consent}
   <p class="fine">We do not ask for children's names or application information. Your answer is not enrollment.</p>
   <button type="submit"${params.preview?" disabled":""}>${kind==="survey"?"Submit family survey":"Request school updates"}</button>
   ${params.preview?'<p role="status" class="fine">This private design preview does not save responses.</p>':""}
   </form>`;
 const body=`<main id="main">${hero}<div class="main">${kind==="landing"?learning:""}
   <section style="margin:38px 0"><h2>What is available today?</h2>
     <p>You can explore the school's proposed approach and share feedback. Applications, confirmed tuition, opening dates and admission offers are not available through this invitation.</p>
   </section>${form}
   <p style="text-align:center;margin-top:30px"><a href="${safeHref(kind==="landing"?params.surveyHref:params.landingHref)}">
   ${kind==="landing"?"Prefer to share more? Take the three-minute family survey.":"Return to the school introduction."}</a></p></div></main>`;
 return shell(context,kind==="survey"?"Family Survey":"Family Interest",body,params.preview,kind);
}

export function familyBrandEmailSubject(kind:FamilyBrandEmailKind,schoolName:string):string {
 const name=schoolName.trim().slice(0,120);
 return kind==="confirmation"?`Thank you for your interest in ${name}`:
   kind==="update"?`An update from ${name}`:`Help shape ${name}: a family survey`;
}

/** Email-safe tables + inline styles; no remote sample logos, fonts or tracking. */
export function renderFamilyBrandEmail(context:FamilyBrandContext,kind:FamilyBrandEmailKind,params:{
  firstName?:string;actionUrl:string;preview?:boolean;
}):{subject:string;html:string;text:string} {
 const {brand,copy,shape}=design(context);
 const name=escape(brand.schoolName),first=escape(params.firstName||"there");
 const actionUrl=safeHref(params.actionUrl),subject=familyBrandEmailSubject(kind,brand.schoolName);
 const heading=kind==="confirmation"?`Thank you, ${first}.`:kind==="update"?"What we're working on.":"Help us plan with you.";
 const body=kind==="confirmation"
   ?`We're glad you reached out to ${name}. We have received your request and will share verified news as it becomes available.`
   :kind==="update"?`Here is what we're exploring as our school plan develops. Nothing here represents an approved opening, admission or tuition offer.`
   :`Your perspective helps shape a thoughtful school. Please tell us what matters most to your family in our three-minute survey.`;
 const cta=kind==="confirmation"?"Learn about the school":kind==="update"?"Read the school update":"Take the family survey";
 const bg=brand.theme.canvas,ink=brand.theme.ink,accent=brand.accent;
 const disclosure=`${statusCopy} Receiving this email alone does not opt you in to future updates.`;
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head>
 <body style="margin:0;padding:0;background:${bg};color:${ink};font-family:${brand.theme.bodyFont}">
 <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(copy.tagline)} · School planning update.</div>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${bg}"><tr><td align="center" style="padding:24px 10px">
 <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff">
 <tr><td style="padding:25px 30px;background:${ink};color:${bg}">
 <span style="display:inline-block;border:1px solid ${accent};color:${accent};padding:9px 12px;font-weight:700;font-size:20px">${escape(brand.monogram)}</span>
 <span style="font-size:18px;font-weight:700;letter-spacing:.06em"> &nbsp; ${name}</span>
 <p style="color:${accent};font-size:11px;letter-spacing:.13em;text-transform:uppercase;margin-bottom:0">${escape(copy.eyebrow)}</p></td></tr>
 <tr><td style="padding:35px 34px">
 <h1 style="font:700 35px/1.15 ${brand.theme.displayFont};color:${ink};margin:0 0 20px">${heading}</h1>
 <p style="font-size:16px;line-height:1.7;color:${ink}">${body}</p>
 ${context.introduction?.trim()?`<p style="font-size:16px;line-height:1.7;color:${ink}">${escape(context.introduction.trim().slice(0,1200))}</p>`:""}
 <p style="font-size:16px;line-height:1.7;color:${ink}">${escape(copy.lead)}</p>
 <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
 <td style="background:${ink};border-radius:${shape};padding:15px 23px"><a href="${actionUrl}"
   style="font-size:14px;font-weight:700;color:${bg};text-decoration:none">${cta}</a></td>
 </tr></table>
 <p style="font-size:14px;line-height:1.6;color:${ink};margin-top:30px">${escape(learningCopy)}</p></td></tr>
 <tr><td style="padding:25px 30px;background:${ink};color:${bg};font-size:12px;line-height:1.7">
 <strong>${name}</strong><p>${escape(copy.tagline)}</p>
 <p>${disclosure}</p>
 <p>${params.preview?"Private design preview · No email has been sent.":"To stop receiving school updates, reply to this email requesting removal."}</p>
 </td></tr></table></td></tr></table></body></html>`;
 const text=`${kind==="confirmation"?"Thank you":kind==="update"?"An update":"Your feedback matters"}, ${params.firstName||"there"}.

${body.replaceAll(/<[^>]*>/g,"")}

${context.introduction?.trim()??""}

${copy.lead}

${cta}: ${params.actionUrl}

${disclosure}

To stop receiving school updates, reply to this email requesting removal.`;
 return {subject,html,text};
}
