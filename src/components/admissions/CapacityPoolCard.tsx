export interface CapacityPoolSummary {
 id:string;name:string;yearName:string;enrolled:number;offered:number;
 remaining:number;capacity:number;status:string;
}
export function CapacityPoolCard({pool,value,busy,onChange,onSave}:{
 pool:CapacityPoolSummary;value:string;busy:boolean;
 onChange:(value:string)=>void;onSave:()=>void;
}) {
 return <article className="rounded-xl border p-5">
  <h2 className="font-serif text-xl">{pool.name} · {pool.yearName}</h2>
  <p className="mt-2 text-sm">Active enrollments: <strong>{pool.enrolled}</strong> · Held offers: <strong>{pool.offered}</strong> · Remaining: <strong>{pool.remaining}</strong></p>
  <p className="mt-1 text-sm">Configured seats: {pool.capacity} · <strong className="capitalize">{pool.status}</strong></p>
  <div className="mt-4 flex flex-wrap items-end gap-2">
   <label className="text-xs">Adjust capacity
    <input aria-label={`Seat capacity for ${pool.name} ${pool.yearName}`} className="mt-1 block w-32 rounded-lg border bg-background p-2 text-sm"
     type="number" min={1} max={100000} step={1} value={value} onChange={event=>onChange(event.target.value)}/>
   </label>
   <button type="button" className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy} onClick={onSave}>Save capacity</button>
  </div>
 </article>;
}
