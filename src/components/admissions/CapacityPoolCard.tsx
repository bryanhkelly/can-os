import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
export interface CapacityPoolSummary {
 id:string;name:string;yearName:string;enrolled:number;offered:number;
 remaining:number;capacity:number;status:string;
}
export function CapacityPoolCard({pool,value,busy,onChange,onSave}:{
 pool:CapacityPoolSummary;value:string;busy:boolean;
 onChange:(value:string)=>void;onSave:()=>void;
}) {
 return <article className=" border p-5">
  <h2 className="font-serif text-xl">{pool.name} · {pool.yearName}</h2>
  <p className="mt-2 text-sm">Active enrollments: <strong>{pool.enrolled}</strong> · Held offers: <strong>{pool.offered}</strong> · Remaining: <strong>{pool.remaining}</strong></p>
  <p className="mt-1 text-sm">Configured seats: {pool.capacity} · <strong className="capitalize">{pool.status}</strong></p>
  <div className="mt-4 flex flex-wrap items-end gap-2">
   <Field label="Adjust capacity" className="text-xs">
    <Input aria-label={`Seat capacity for ${pool.name} ${pool.yearName}`} className="w-32"
     type="number" min={1} max={100000} step={1} value={value} onChange={event=>onChange(event.target.value)}/>
   </Field>
   <Button type="button" variant="outline" disabled={busy} onClick={onSave}>Save capacity</Button>
  </div>
 </article>;
}
