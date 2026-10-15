export type CalendarItem={id:string;title:string;startsAt:string;endsAt:string;description?:string};
function escapeICS(value:string){return value.replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");}
function utc(value:string){return new Date(value).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");}
export function renderICS(items:CalendarItem[],name="CAN OS synthetic calendar"){
 const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//CAN OS//Synthetic Calendar//EN","CALSCALE:GREGORIAN","X-WR-CALNAME:"+escapeICS(name)];
 for(const e of items){if(!e.id||Number.isNaN(Date.parse(e.startsAt))||Number.isNaN(Date.parse(e.endsAt)))continue;lines.push("BEGIN:VEVENT","UID:"+escapeICS(e.id)+"@can-os.demo","DTSTAMP:"+utc(e.startsAt),"DTSTART:"+utc(e.startsAt),"DTEND:"+utc(e.endsAt),"SUMMARY:"+escapeICS(e.title),"DESCRIPTION:"+escapeICS(e.description??""),"END:VEVENT");}
 return [...lines,"END:VCALENDAR",""].join("\r\n");
}
