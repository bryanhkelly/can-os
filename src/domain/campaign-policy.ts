export const campaignRecipientLimit=1000;
export function parseCampaignRecipients(raw:string){
 const values=[...new Set(raw.split(/[;,\s]+/).filter(Boolean).map(v=>v.toLowerCase()))];
 const invalid=values.filter(v=>v.length>254||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(v)||v.includes("..")||/\.(test|invalid|example|localhost)$/.test(v)||/@example\.(com|net|org)$/.test(v));
 return {recipients:values,invalid,tooMany:values.length>campaignRecipientLimit};
}
export function campaignOwnerScope(owner:{ownerKind:string;organizationId:string|null;siteId:string|null;programId:string|null}){
 const id=owner.ownerKind==="organization"?owner.organizationId:owner.ownerKind==="site"?owner.siteId:owner.ownerKind==="program"?owner.programId:null;
 if(owner.ownerKind!=="platform"&&!id)throw new Error("Invalid campaign owner");
 return {ownerScope:owner.ownerKind+":"+(id??"platform"),senderScope:owner.organizationId?"organization:"+owner.organizationId:"platform:platform"};
}
export function campaignRetryable(attempts:number,firstAttemptAt:string|Date,now=Date.now()){
 return attempts<4 && now-new Date(firstAttemptAt).getTime()<20*60*60*1000;
}

/** Preserve ambiguous prior sends until authenticated provider evidence resolves them. */
export function campaignRetryAfterMs(value:string|null,now=Date.now()){
 if(!value)return 0;
 const ms=/^\d+$/.test(value)?Number(value)*1000:Date.parse(value)-now;
 return Number.isFinite(ms)?Math.min(20*60*60*1000,Math.max(0,ms)):0;
}

/** Import a single email column, optional email header, optional CSV quoting.
 * Other columns are rejected rather than guessing which field is an address. */
export function parseCampaignRecipientCsv(raw:string){
 const lines=raw.replace(/^\uFEFF/,"").split(/\r\n|\n|\r/).map(v=>v.trim()).filter(Boolean);
 const cells=lines.map(line=>{
   const quoted=/^"([^"\r\n]*)"$/.exec(line);
   if(quoted)return (quoted[1]??"").trim();
   if(/[,"]/.test(line))throw new Error("Use a single email column with no other fields.");
   return line;
 });
 if(/^email(?: address)?$/i.test(cells[0]??""))cells.shift();
 if(cells.some(cell=>!cell||/[,;\s]/.test(cell)))throw new Error("Use one email address per row.");
 const parsed=parseCampaignRecipients(cells.join("\n"));
 if(!parsed.recipients.length||parsed.invalid.length||parsed.tooMany)throw new Error("CSV must contain 1 to 1,000 valid email addresses.");
 return parsed.recipients.join("\n");
}
