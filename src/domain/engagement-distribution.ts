import type { EngagementDefinition } from "./engagement-definition";
import { goCodeSchema } from "./site-go-links";

export type EngagementInvitation={subject:string;body:string;url:string};
/** Exact immutable public copy, no private Site notes, raw HTML or arbitrary destination. */
export function buildEngagementInvitation(definition:EngagementDefinition,code:string,origin:string):EngagementInvitation{
  goCodeSchema.parse(code);
  const base=new URL(origin);
  if(base.protocol!=="https:"||base.username||base.password||base.pathname!=="/"||base.search||base.hash)
    throw new Error("Approved HTTPS public origin required");
  const url=new URL("/go/"+code,base).href;
  const subject=definition.presentation.headline.replace(/[\r\n]+/g," ").trim();
  const action=definition.execution.mode==="page"?definition.execution.actionLabel:"View invitation";
  const body=[definition.presentation.summary,definition.presentation.detail,action+": "+url].filter(Boolean).join("\n\n");
  return {subject,body,url};
}
const validEmail=/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,63}$/i;
/** Small operator-mediated invitations only. No silent truncation, sending,
 * address uploads, or automatic marketing-list subscription. */
export function parseInvitationRecipients(raw:string){
  const parts=raw.split(/[;,\s]+/).filter(Boolean);
  const invalid=parts.filter(value=>value.length>254||!validEmail.test(value)||value.includes("..")||value.endsWith(".demo")||value.endsWith(".test"));
  const recipients=[...new Set(parts.map(value=>value.toLowerCase()))];
  return {recipients,invalid,tooMany:recipients.length>20};
}
export function buildInvitationMailto(draft:EngagementInvitation,recipients:readonly string[]):string{
  const checked=parseInvitationRecipients(recipients.join(","));
  if(!checked.recipients.length||checked.invalid.length||checked.tooMany)
    throw new Error("Enter 1 to 20 valid, authorized recipient addresses");
  return "mailto:?bcc="+checked.recipients.map(encodeURIComponent).join(",")+
    "&subject="+encodeURIComponent(draft.subject)+"&body="+encodeURIComponent(draft.body);
}
