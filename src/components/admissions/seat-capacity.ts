/** UI guard only; the canonical capacity service enforces commitments and authorization. */
export function parseSeatCapacity(raw:string):number|null {
 if(!/^\d+$/.test(raw.trim()))return null;
 const value=Number(raw.trim());
 return Number.isSafeInteger(value)&&value>=1&&value<=100000?value:null;
}
