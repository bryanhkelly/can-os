import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {canadianProvinces,isoCountryCodes,usStatesAndTerritories} from "@/domain/site-setup-configuration";
import type {LaunchSiteAddressDraft} from "./LaunchHostAndProviderFields";

const countryNames=new Intl.DisplayNames(["en"],{type:"region"});
const countryOptions=isoCountryCodes.map(code=>({code,label:countryNames.of(code)??code}))
  .sort((a,b)=>a.label.localeCompare(b.label));

/** Shared Site physical-address entry. All values remain private, church-supplied drafts. */
export function LaunchSiteAddressFields({
  address,onChange,
}:{
  address:LaunchSiteAddressDraft;
  onChange:(value:LaunchSiteAddressDraft)=>void;
}){
  const regions=address.country==="US"?usStatesAndTerritories:
    address.country==="CA"?canadianProvinces:null;
  return <div className="grid gap-2 sm:grid-cols-2">
    <Field label="Street address" required>
      <Input value={address.street1} onChange={e=>onChange({...address,street1:e.target.value})}/>
    </Field>
    <Field label="Suite or building (optional)">
      <Input value={address.street2} onChange={e=>onChange({...address,street2:e.target.value})}/>
    </Field>
    <Field label="City" required>
      <Input value={address.city} onChange={e=>onChange({...address,city:e.target.value})}/>
    </Field>
    <Field label="Country" required>
      <Select value={address.country} onChange={e=>onChange({...address,country:e.target.value,state:"",postalCode:""})}>
        <option value="">Confirm country…</option>
        {address.country && !isoCountryCodes.includes(address.country) &&
          <option value={address.country}>Review saved country: {address.country}</option>}
        {countryOptions.map(({code,label})=>
          <option key={code} value={code}>{label} ({code})</option>)}
      </Select>
    </Field>
    <Field label={address.country==="US"?"State or territory":address.country==="CA"?"Province or territory":"State or region"} required>
      {regions?<Select value={address.state}
        onChange={e=>onChange({...address,state:e.target.value})}>
        <option value="">Choose region…</option>
        {address.state && !(address.state in regions) &&
          <option value={address.state}>Review saved region: {address.state}</option>}
        {Object.entries(regions).map(([code,label])=>
          <option key={code} value={code}>{label} ({code})</option>)}
      </Select>:<Input value={address.state} onChange={e=>onChange({...address,state:e.target.value})}/>}
    </Field>
    <Field label={address.country==="US"?"ZIP code":"Postal code"} required>
      <Input value={address.postalCode} onChange={e=>onChange({...address,postalCode:e.target.value})}/>
    </Field>
    <Field label="County (optional)">
      <Input value={address.county} onChange={e=>onChange({...address,county:e.target.value})}/>
    </Field>
  </div>;
}
