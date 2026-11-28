/** Independent minor review establishes an expiry boundary, not a new Person.
 * No date of birth is returned to the guardian or stored in Person metadata. */
export function reviewedMinorExpiry(birthDate:string,now:Date):Date|null {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)||!Number.isFinite(now.getTime()))return null;
 const [y,m,d]=birthDate.split("-").map(Number);
 const born=new Date(Date.UTC(y!,m!-1,d!));
 if(born.getUTCFullYear()!==y||born.getUTCMonth()!==m!-1||born.getUTCDate()!==d||
    born>now)return null;
 const expires=new Date(Date.UTC(y!+18,m!-1,d!));
 return expires>now?expires:null;
}
