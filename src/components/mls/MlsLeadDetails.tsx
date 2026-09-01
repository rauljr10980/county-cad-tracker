import { useEffect, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building, Building2, ChevronDown, Landmark, Loader2, MapPin, Search, User } from 'lucide-react';
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';
import { truePeopleSearchUrl, taxAssessorUrl, landRecordsUrl } from '@/lib/researchLinks';
import { fmtDate, fmtMoney, pillClass, statusTone, type MlsContact, type MlsLead } from './MlsLeadsView';

type Props = {
  lead: MlsLead | null;
  onClose: () => void;
  onSaveNotes: (notes: string) => Promise<void>;
};

// The Comptroller search can come back with more than one taxpayer of the
// same name — the route refuses to guess and hands the whole list back.
type EntityCandidate = {
  taxpayerNumber: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  fileNumber: string;
  status: string;
};

const iconButtonClass =
  'inline-flex items-center gap-1.5 rounded border bg-card px-3 py-2 text-xs hover:bg-muted disabled:opacity-50 disabled:pointer-events-none disabled:hover:bg-card';

async function mlsLeadsRequest(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE_URL}/api/mls-leads${path}`, {
    ...init,
    headers: { ...getAuthHeaders(), ...(init?.headers || {}) },
  });
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || `Request failed (${res.status})` };
  }
}

// Blank fields render an explicit em dash rather than being omitted, so
// missing source data reads differently from a field the screen forgot.
function Field({ label, value, record = false }: { label: string; value?: ReactNode; record?: boolean }) {
  const isBlank = value === null || value === undefined || value === '';
  return <div>
    <p className="label">{label}</p>
    <p className={record ? 'record' : ''}>{isBlank ? '—' : value}</p>
  </div>;
}

function CollapsibleSection({ title, expanded, onToggle, children }: { title: string; expanded: boolean; onToggle: () => void; children: ReactNode }) {
  return <section className="rounded border bg-card p-3.5 space-y-3">
    <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
      <h3 className="text-base font-semibold">{title}</h3>
      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`}/>
    </div>
    {expanded && children}
  </section>;
}

// Nothing here is persisted — there's no route to record which candidate the
// user picked, so this is a plain reference list, not a picker.
function EntityCandidateList({ candidates }: { candidates: EntityCandidate[] }) {
  return <div className="space-y-1.5">
    <p className="text-xs text-muted-foreground">
      {candidates.length} possible matches at the Comptroller — nothing is saved automatically, so check each by hand:
    </p>
    {candidates.map((c, i) => (
      <div key={`${c.taxpayerNumber || 'candidate'}-${i}`} className="rounded bg-muted p-2 text-xs space-y-0.5">
        <p className="font-medium">{c.name || '—'}</p>
        <p className="record text-muted-foreground">{[c.address, c.city, [c.state, c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'}</p>
        <p className="text-muted-foreground">Taxpayer # <span className="record">{c.taxpayerNumber || '—'}</span>{c.status && <> · {c.status}</>}</p>
      </div>
    ))}
  </div>;
}

export default function MlsLeadDetails({ lead, onClose, onSaveNotes }: Props) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // `lead` is the parent's copy, refreshed only on its own schedule. A CAD or
  // Comptroller lookup changes data this dialog is showing right now, so it
  // keeps its own copy and re-fetches it after either lookup completes.
  const [details, setDetails] = useState<MlsLead | null>(lead);

  const [cadLoading, setCadLoading] = useState(false);
  const [cadMessage, setCadMessage] = useState('');

  const [entityLoadingId, setEntityLoadingId] = useState<string | null>(null);
  const [entityMessage, setEntityMessage] = useState<Record<string, string>>({});
  const [entityCandidates, setEntityCandidates] = useState<Record<string, EntityCandidate[]>>({});

  const [propertyExpanded, setPropertyExpanded] = useState(true);
  const [countyExpanded, setCountyExpanded] = useState(false);
  const [agentsExpanded, setAgentsExpanded] = useState(false);

  useEffect(() => {
    setNotes(lead?.notes ?? '');
    setDetails(lead);
    setCadMessage('');
    setEntityMessage({});
    setEntityCandidates({});
  }, [lead?.id]);

  const saveNotes = async () => {
    if (!details || notes === details.notes) return;
    setSaving(true);
    try { await onSaveNotes(notes); } finally { setSaving(false); }
  };

  const refresh = async (id: string) => {
    const fresh = await mlsLeadsRequest(`/${id}`);
    if (fresh && fresh.id) setDetails(fresh);
  };

  const runCadLookup = async () => {
    if (!details || details.county !== 'Bexar') return;
    setCadLoading(true);
    setCadMessage('');
    try {
      const body = await mlsLeadsRequest(`/${details.id}/cad-lookup`, { method: 'POST' });
      setCadMessage(body.success ? 'Owner looked up from Bexar CAD.' : (body.error || `CAD lookup ${body.cadLookupStatus || 'failed'}.`));
      await refresh(details.id);
    } catch (e) {
      setCadMessage(e instanceof Error ? e.message : 'CAD lookup failed');
    } finally {
      setCadLoading(false);
    }
  };

  const runEntityLookup = async (contact: MlsContact) => {
    if (!details) return;
    setEntityLoadingId(contact.id);
    setEntityMessage((prev) => ({ ...prev, [contact.id]: '' }));
    setEntityCandidates((prev) => ({ ...prev, [contact.id]: [] }));
    try {
      const body = await mlsLeadsRequest(`/contacts/${contact.id}/entity-lookup`, { method: 'POST' });
      if (body.entityLookupStatus === 'ambiguous') {
        setEntityCandidates((prev) => ({ ...prev, [contact.id]: body.candidates || [] }));
      } else if (body.entityLookupStatus === 'not_found') {
        setEntityMessage((prev) => ({ ...prev, [contact.id]: 'No matching entity found in Texas Comptroller franchise-tax records.' }));
      } else if (body.entityLookupStatus === 'failed') {
        setEntityMessage((prev) => ({ ...prev, [contact.id]: body.error || 'Comptroller lookup failed.' }));
      }
      await refresh(details.id);
    } catch (e) {
      setEntityMessage((prev) => ({ ...prev, [contact.id]: e instanceof Error ? e.message : 'Comptroller lookup failed' }));
    } finally {
      setEntityLoadingId(null);
    }
  };

  if (!details) {
    return <Dialog open={!!lead} onOpenChange={(v) => !v && onClose()}><DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto"/></Dialog>;
  }

  // The CAD lookup upserts a `cad_owner` contact, or — when the CAD name
  // matches the MLS-listed owner — enriches that `mls_owner` contact instead
  // rather than creating a duplicate. Either way, this is the property's
  // current owner of record for the top-of-dialog mailing address.
  const cadOwnerContact =
    details.contacts.find((c) => c.role === 'cad_owner') ||
    details.contacts.find((c) => c.role === 'mls_owner' && c.mailingAddress);

  return <Dialog open={!!lead} onOpenChange={(v) => !v && onClose()}><DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <p className="label">MLS #<span className="record ml-1">{details.mlsNumber || '—'}</span>{details.hidden && <span className="ml-2">HIDDEN</span>}</p>
      <DialogTitle className="pr-8 flex flex-wrap items-center gap-2">
        <span>{details.address || '—'}</span>
        <span className={pillClass(statusTone(details.status))}>{details.status || '—'}</span>
      </DialogTitle>
      {details.previousStatus && (
        <p className="text-xs text-muted-foreground">was {details.previousStatus} as of <span className="record">{fmtDate(details.statusChangedAt)}</span></p>
      )}
    </DialogHeader>

    <section className="rounded border bg-card p-3.5 space-y-3">
      <h3 className="text-base font-semibold">Actions</h3>
      <div className="flex flex-wrap gap-2">
        <button className={iconButtonClass} title="Open in Google Maps"
          onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(details.address)}`, '_blank')}>
          <MapPin className="h-4 w-4"/>
        </button>
        <button className={iconButtonClass} title="People search by address"
          onClick={() => window.open(truePeopleSearchUrl(details), '_blank')}>
          <User className="h-4 w-4"/>
        </button>
        <button className={iconButtonClass} title="Land records"
          onClick={() => window.open(landRecordsUrl(details), '_blank')}>
          <Building className="h-4 w-4"/>
        </button>
        <button className={iconButtonClass} title="Tax assessor"
          onClick={() => window.open(taxAssessorUrl(), '_blank')}>
          <Landmark className="h-4 w-4"/>
        </button>
        <button
          className={iconButtonClass}
          title={details.county === 'Bexar' ? 'Look up owner from Bexar CAD' : 'CAD lookup only covers Bexar County'}
          disabled={details.county !== 'Bexar' || cadLoading}
          onClick={runCadLookup}
        >
          {cadLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>}
          Look up owner
        </button>
      </div>
      {details.county !== 'Bexar' && (
        <p className="text-xs text-warning">
          Look up owner is unavailable — CAD lookup only covers Bexar County, and this lead is in {details.county || 'an unrecorded county'}.
        </p>
      )}
      {cadMessage && <p className="text-xs text-muted-foreground">{cadMessage}</p>}
      {details.cadLookupStatus && !cadMessage && (
        <p className="text-xs text-muted-foreground">
          Last CAD lookup: <span className="record">{fmtDate(details.cadLookupAt)}</span> — {details.cadLookupStatus.replace(/_/g, ' ')}
        </p>
      )}
    </section>

    <section className="rounded border bg-card p-3.5 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="MLS Address" value={details.address} record/>
        <Field label="CAD Mailing Address" value={cadOwnerContact?.mailingAddress} record/>
      </div>
      {cadOwnerContact?.mailingAddress && (
        <p className="text-xs text-muted-foreground">
          The mailing address Bexar CAD has on file for the owner — not the property's own address.
        </p>
      )}
      <Field label="Legal Description" value={details.legalDescription}/>
    </section>

    <section className="rounded border bg-card p-3.5 space-y-3">
      <h3 className="text-base font-semibold">Owner</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="MLS Owner (raw)" value={details.mlsOwnerRaw}/>
      </div>
      {!details.contacts.length && <p className="text-sm text-muted-foreground">No contact record — the owner text above didn't classify as a person or entity.</p>}
      {details.contacts.map((c) => (
        <div key={c.id} className="rounded bg-muted p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <span className={pillClass('grey')}>
              {c.nameKind === 'entity' ? <Building2 className="h-3 w-3"/> : <User className="h-3 w-3"/>}
              {c.nameKind === 'entity' ? 'Entity' : 'Person'}
            </span>
            <span className={pillClass('grey')}>{c.role === 'cad_owner' ? 'CAD owner of record' : 'MLS listed owner'}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Name" value={c.name}/>
            <Field label="Search Name" value={c.searchName}/>
            <Field label="Mailing Address" value={c.mailingAddress} record/>
            {c.nameKind === 'entity' && <Field label="Entity Status" value={c.entityStatus}/>}
          </div>
          {c.nameKind === 'entity' && (c.entityTaxpayerNumber || c.entityFileNumber) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Taxpayer #" value={c.entityTaxpayerNumber} record/>
              <Field label="SOS File #" value={c.entityFileNumber} record/>
            </div>
          )}
          {c.mailingAddress && c.nameKind === 'entity' && (
            <p className="text-xs text-muted-foreground">
              Mailing address only — the Comptroller doesn't return an officer or registered-agent name.
            </p>
          )}
          {c.nameKind === 'entity' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className={iconButtonClass}
                disabled={entityLoadingId === c.id}
                onClick={() => runEntityLookup(c)}
                title="Look up this entity with the Texas Comptroller"
              >
                {entityLoadingId === c.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Building2 className="h-4 w-4"/>}
                Look up business
              </button>
              {c.entityLookupStatus && (
                <span className="text-xs text-muted-foreground">
                  Last lookup: <span className="record">{fmtDate(c.entityLookupAt)}</span> — {c.entityLookupStatus.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          )}
          {entityMessage[c.id] && <p className="text-xs text-muted-foreground">{entityMessage[c.id]}</p>}
          {!!entityCandidates[c.id]?.length && <EntityCandidateList candidates={entityCandidates[c.id]}/>}
        </div>
      ))}
    </section>

    <CollapsibleSection title="Property" expanded={propertyExpanded} onToggle={() => setPropertyExpanded((v) => !v)}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Street #" value={details.streetNumber} record/>
        <Field label="Direction" value={details.streetDir}/>
        <Field label="Street Name" value={details.streetName} record/>
        <Field label="Zip" value={details.zip} record/>
        <Field label="Zip+4" value={details.zipPlus} record/>
        <Field label="County" value={details.county}/>
        <Field label="State" value={details.state}/>
        <Field label="Area" value={details.areaCode} record/>
        <Field label="Units" value={details.totalUnits ?? undefined} record/>
        <Field label="Square Feet" value={details.squareFeet ?? undefined} record/>
        <Field label="Year Built" value={details.yearBuilt ?? undefined} record/>
        <Field label="Type" value={details.propertyType}/>
        <Field label="Construction" value={details.construction}/>
        <Field label="Builder" value={details.builderName}/>
        <Field label={details.status === 'SLD' ? 'Sale Price' : 'List Price'} value={fmtMoney(details.price)} record/>
        <Field label="Days on Market" value={details.daysOnMarket ?? undefined} record/>
      </div>
    </CollapsibleSection>

    <CollapsibleSection title="County" expanded={countyExpanded} onToggle={() => setCountyExpanded((v) => !v)}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Legal Lot" value={details.legalLot} record/>
        <Field label="County Account #" value={details.countyAccountNumber} record/>
        <Field label="Tax Property ID" value={details.taxPropId} record/>
        <Field label="County Tax" value={details.countyTax} record/>
      </div>
    </CollapsibleSection>

    <CollapsibleSection title="Agents" expanded={agentsExpanded} onToggle={() => setAgentsExpanded((v) => !v)}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="List Agent" value={details.listAgent}/>
        <Field label="List Agent Phone" value={details.listAgentPhone} record/>
        <Field label="Selling Agent" value={details.sellingAgent}/>
        <Field label="Selling Agent Phone" value={details.sellingAgentPhone} record/>
        <Field label="LREA/LREB" value={details.lreaLreb} record/>
      </div>
    </CollapsibleSection>

    <section className="rounded border bg-card p-3.5 space-y-2">
      <h3 className="text-base font-semibold">Notes</h3>
      <textarea
        className="min-h-[96px] w-full resize-y rounded border bg-card px-3 py-2 text-sm"
        placeholder="Notes about this lead"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={saveNotes}
      />
      {saving && <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin"/>Saving…</span>}
    </section>
  </DialogContent></Dialog>;
}
