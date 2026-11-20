import { Checkbox } from "@/components/ui/choice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ClassOfferingTerms } from "@/domain/unified-class";

type Method=ClassOfferingTerms["enrollmentMethods"][number];
type CreditMode=ClassOfferingTerms["allowedCreditModes"][number];
const methodOptions: {value:Method;label:string}[]=[
  {value:"self",label:"Self-enrollment"},{value:"assignment",label:"Assignment"},
  {value:"invitation",label:"Invitation (verified adults)"},
  {value:"approval",label:"Approval required (verified adults)"},
];
const creditOptions: {value:CreditMode;label:string}[]=[
  {value:"not_applicable",label:"No academic credit"},
  {value:"audit",label:"Audit"},
  // For-credit participation needs institutional eligibility and issuer approval.
];

function toggle<T extends string>(list: T[], name: T): T[] {
  return list.includes(name) ? list.filter(value => value !== name) : [...list, name];
}

export type ClassOfferingTermsForm = {
  visibility: ClassOfferingTerms["visibility"];
  methods: ClassOfferingTerms["enrollmentMethods"];
  creditModes: ClassOfferingTerms["allowedCreditModes"];
  opensAt: string;
  closesAt: string;
  capacity: string;
  consentVersion: string;
  consentText: string;
};

export const initialClassOfferingTermsForm: ClassOfferingTermsForm = {
  visibility: "private",
  methods: ["assignment"],
  creditModes: ["not_applicable"],
  opensAt: "",
  closesAt: "",
  capacity: "",
  consentVersion: "",
  consentText: "",
};

/** Controlled V6.1 Class Offering terms. Parent retains command authority,
 * and the server independently validates publication and admission policy.
 */
export function ClassOfferingTermsFields({
  value, onChange, siteTimeZone,
}: {
  value: ClassOfferingTermsForm;
  onChange: (next: ClassOfferingTermsForm) => void;
  siteTimeZone: string | null;
}) {
  const patch = (values: Partial<ClassOfferingTermsForm>) => onChange({ ...value, ...values });
  return <div className="mt-4">
            <h3 className="text-base font-semibold">Class Offering terms</h3>
            <p className="mt-1 text-sm text-muted-foreground">Availability and admission methods do not change the Course or Class identity.</p>
            <div className="mt-4">
              <Label htmlFor="native-class-visibility" className="block text-sm font-semibold">Visibility</Label>
              <Select id="native-class-visibility" value={value.visibility}
                onChange={e=>patch({visibility:e.target.value as ClassOfferingTerms["visibility"]})}
                className="mt-2 min-h-11">
                <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
              </Select>
            </div>
            <fieldset className="mt-4">
              <legend className="text-sm font-semibold">Allowed enrollment methods</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{methodOptions.map(method=><Label key={method.value} className="flex items-center gap-2 text-sm">
                <Checkbox checked={value.methods.includes(method.value)}
                  onChange={()=>patch({methods:toggle(value.methods,method.value)})}/> {method.label}
              </Label>)}</div>
            </fieldset>
            <fieldset className="mt-4">
              <legend className="text-sm font-semibold">Allowed credit participation</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{creditOptions.map(mode=><Label key={mode.value} className="flex items-center gap-2 text-sm">
                <Checkbox checked={value.creditModes.includes(mode.value)}
                  onChange={()=>patch({creditModes:toggle(value.creditModes,mode.value)})}/> {mode.label}
              </Label>)}</div>
              <p className="mt-2 text-xs text-muted-foreground">For-credit participation does not award credit without separate institutional approval and an earned outcome.</p>
            </fieldset>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div><Label htmlFor="native-class-open" className="block text-sm font-semibold">Opens</Label>
                <Input id="native-class-open" type="datetime-local" value={value.opensAt}
                  onChange={e=>patch({opensAt:e.target.value})} className="mt-2 min-h-11"/>
              </div>
              <div><Label htmlFor="native-class-close" className="block text-sm font-semibold">Closes</Label>
                <Input id="native-class-close" type="datetime-local" value={value.closesAt}
                  onChange={e=>patch({closesAt:e.target.value})} className="mt-2 min-h-11"/>
              </div>
              <div><Label htmlFor="native-class-capacity" className="block text-sm font-semibold">Capacity</Label>
                <Input id="native-class-capacity" type="number" min={1} value={value.capacity} placeholder="Unlimited"
                  onChange={e=>patch({capacity:e.target.value})} className="mt-2 min-h-11"/>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Registration times use the hosting Site time zone:
              {" "}{siteTimeZone??"select an authorized Site with a configured time zone"}.
              Missing or ambiguous daylight-saving times cannot be submitted.
            </p>
            {value.methods.includes("self")&&<div className="mt-4 space-y-3">
              <p className="text-sm font-semibold">Self-enrollment consent terms</p>
              <div><Label htmlFor="native-class-consent-version" className="block text-xs font-semibold">Version</Label>
                <Input id="native-class-consent-version" value={value.consentVersion} required minLength={3}
                  onChange={e=>patch({consentVersion:e.target.value})} placeholder="participation-v1"
                  className="mt-1 min-h-11"/></div>
              <div><Label htmlFor="native-class-consent-text" className="block text-xs font-semibold">Participation and data-use terms</Label>
                <Textarea id="native-class-consent-text" value={value.consentText} required minLength={25} maxLength={10000} rows={4}
                  onChange={e=>patch({consentText:e.target.value})}
                  className="mt-1"/></div>
            </div>}
            </div>;
}
