import { useEffect, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building, Building2, ChevronDown, Landmark, Loader2, MapPin, Search, User } from 'lucide-react';
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';
import { truePeopleSearchUrl, taxAssessorUrl, landRecordsUrl, type ResearchAddress } from '@/lib/researchLinks';
import { normalizeContacts, type NormalizedContacts } from '@/lib/contactsModel';
import { ContactWorkspace } from '@/components/contacts/ContactWorkspace';
import { fmtDate, fmtMoney, ownerRoleLabels, pillClass, statusTone, type MlsContact, type MlsLead } from './MlsLeadsView';

// The Comptroller's Registered Office Street Address (and each officer's
// address) comes back as one formatted string ("797 CROWN JEWEL, BOERNE, TX
// 78006"), but the people search needs the street separate from
// city/state/zip. Splits on commas, then the trailing "STATE ZIP" pair on
// whitespace; falls back to putting the whole thing in `address` if it
// doesn't look like that shape.
function splitRegisteredOfficeAddress(combined: string): ResearchAddress {
  const parts = combined.split(',').map((p) => p.trim()).filter(Boolean);
  const [address, city, stateZip] = parts;
  const [state, zip] = (stateZip || '').split(/\s+/);
  return { address: address || combined, city, state, zip };
}

type Props = {
  lead: MlsLead | null;
  onClose: () => void;
  onSaveNotes: (notes: string) => Promise<void>;
};

// The Comptroller search can come back with more than one taxpayer of the
// same name — the route refuses to guess and hands the whole list back.
// The search endpoint only returns name/taxpayerId/zip; the rest of the
// entity's detail (registered agent, officers, etc.) comes from the
// follow-up detail lookup once a candidate is chosen.
type EntityCandidate = {
  name: string;
  taxpayerId: string;
  zip: string;
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

// Each candidate is a button: picking one calls /entity-select, which fetches
// that taxpayer's detail record (the registered agent included) and persists
// it on the contact — same as the automatic path when there's only one match.
function EntityCandidateList({ candidates, onSelect, loading }: {
  candidates: EntityCandidate[];
  onSelect: (candidate: EntityCandidate) => void;
  loading: boolean;
}) {
  return <div className="space-y-1.5">
    <p className="text-xs text-muted-foreground">
      {candidates.length} possible matches at the Comptroller — pick the right one to pull its registered agent:
    </p>
    {candidates.map((c, i) => (
      <button
        key={`${c.taxpayerId || 'candidate'}-${i}`}
        type="button"
        disabled={loading}
        onClick={() => onSelect(c)}
        className="w-full text-left rounded bg-muted p-2 text-xs space-y-0.5 hover:bg-muted/70 disabled:opacity-50 disabled:pointer-events-none"
      >
        <p className="font-medium">{c.name || '—'}</p>
        <p className="text-muted-foreground">Taxpayer ID <span className="record">{c.taxpayerId || '—'}</span>{c.zip && <> · ZIP <span className="record">{c.zip}</span></>}</p>
      </button>
    ))}
  </div>;
}

type PersonCardProps = {
  /** Card header label: "Seller" / "Buyer" / "Owner" / "Other party" for the
   *  two always-present boxes, or the officer's joined title(s) for a
   *  promoted officer. */
  label: string;
  /** null when this box has no MlsContact behind it yet — the always-present
   *  seller/buyer box before anything has been looked up or pasted. */
  contact: MlsContact | null;
  /** Role a not-yet-existing contact gets on first use. Required when
   *  contact is null, ignored otherwise. */
  pendingRole?: 'mls_owner' | 'cad_owner';
  /** 'owner' cards (seller/buyer) show name/search-name/mailing-address and,
   *  for an entity, the full Comptroller block. 'officer' cards are
   *  deliberately smaller — just the person and their own workspace. */
  variant: 'owner' | 'officer';
  propertyAddress: string;
  saving: boolean;
  onSaveContact: (contactId: string, next: NormalizedContacts) => Promise<void>;
  onCreateContact: (role: 'mls_owner' | 'cad_owner', next: NormalizedContacts) => Promise<void>;
  onCallError: (message: string) => void;
  callErrorMessage?: string;
  entityLoading?: boolean;
  entityMessage?: string;
  entityCandidates?: EntityCandidate[];
  onRunEntityLookup?: (contact: MlsContact) => void;
  onSelectEntityCandidate?: (contact: MlsContact, candidate: EntityCandidate) => void;
};

// One person's full contact box: identity, (for an owner/buyer) the
// Comptroller entity detail if there is one, and always their own
// ContactWorkspace — so a paste into Laura's card only ever lands on Laura.
// Declared at module scope, not nested inside MlsLeadDetails, so its
// identity is stable across renders; ContactWorkspace holds its own internal
// state (a freshness ref, the email-panel draft) that a remount would wipe.
function PersonCard({
  label,
  contact,
  pendingRole,
  variant,
  propertyAddress,
  saving,
  onSaveContact,
  onCreateContact,
  onCallError,
  callErrorMessage,
  entityLoading = false,
  entityMessage = '',
  entityCandidates = [],
  onRunEntityLookup,
  onSelectEntityCandidate,
}: PersonCardProps) {
  const isEntity = contact?.nameKind === 'entity';

  return <div className="rounded bg-muted p-2.5 space-y-2.5">
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={pillClass('grey')}>{label}</span>
      {contact && (
        <span className={pillClass('grey')}>
          {isEntity ? <Building2 className="h-3 w-3"/> : <User className="h-3 w-3"/>}
          {isEntity ? 'Entity' : 'Person'}
        </span>
      )}
    </div>

    {!contact ? (
      <>
        <p className="text-sm text-muted-foreground">No contact yet — paste a TruePeopleSearch result once you have one.</p>
        <ContactWorkspace
          key={`pending-${pendingRole}`}
          contacts={{ phoneRows: [], emailRows: [] }}
          onContactsChange={(next) => onCreateContact(pendingRole as 'mls_owner' | 'cad_owner', next)}
          ownerName={label}
          propertyAddress={propertyAddress}
          owner={label}
          onCallError={onCallError}
          saving={saving}
          compact
        />
      </>
    ) : (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" value={contact.name}/>
          {variant === 'owner' && <Field label="Search Name" value={contact.searchName}/>}
          {variant === 'owner' && (
            <Field label={isEntity ? "Entity's Mailing Address" : 'Mailing Address'} value={contact.mailingAddress} record/>
          )}
          {variant === 'officer' && <Field label="Title" value={contact.title}/>}
          {isEntity && <Field label="Entity Status" value={contact.entityStatus}/>}
        </div>

        {variant === 'officer' && contact.mailingAddress && (
          <div className="space-y-1.5">
            <p className="record text-xs text-muted-foreground">{contact.mailingAddress}</p>
            <button
              className={iconButtonClass}
              onClick={() => window.open(truePeopleSearchUrl(splitRegisteredOfficeAddress(contact.mailingAddress)), '_blank')}
              title={`People search for ${contact.name || 'this officer'}, by their address on file`}
            >
              <Search className="h-4 w-4"/> People search
            </button>
          </div>
        )}

        {isEntity && contact.registeredAgentName && (
          // The headline result of the Comptroller lookup: a named person,
          // not just an address.
          <div className="rounded border border-primary/30 bg-primary/5 p-2.5 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Registered agent</p>
            <p className="text-base font-semibold flex items-center gap-1.5">
              <User className="h-4 w-4"/>{contact.registeredAgentName}
            </p>
            <p className="record text-sm text-muted-foreground">{contact.registeredOfficeAddress || '—'}</p>
            {contact.registeredOfficeAddress && (
              <button
                className={iconButtonClass}
                onClick={() => window.open(truePeopleSearchUrl(splitRegisteredOfficeAddress(contact.registeredOfficeAddress)), '_blank')}
                title="People search for the registered agent, by their registered office address"
              >
                <Search className="h-4 w-4"/> People search
              </button>
            )}
          </div>
        )}

        {isEntity && (contact.entityTaxpayerNumber || contact.entityFileNumber) && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Taxpayer #" value={contact.entityTaxpayerNumber} record/>
            <Field label="SOS File #" value={contact.entityFileNumber} record/>
            <Field label="State of Formation" value={contact.stateOfFormation}/>
            <Field label="Right to Transact" value={contact.rightToTransact}/>
          </div>
        )}

        {isEntity && onRunEntityLookup && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className={iconButtonClass}
              disabled={entityLoading}
              onClick={() => onRunEntityLookup(contact)}
              title="Look up this entity with the Texas Comptroller"
            >
              {entityLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Building2 className="h-4 w-4"/>}
              Look up business
            </button>
            {contact.entityLookupStatus && (
              <span className="text-xs text-muted-foreground">
                Last lookup: <span className="record">{fmtDate(contact.entityLookupAt)}</span> — {contact.entityLookupStatus.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        )}
        {entityMessage && <p className="text-xs text-muted-foreground">{entityMessage}</p>}
        {!!entityCandidates.length && onSelectEntityCandidate && (
          <EntityCandidateList
            candidates={entityCandidates}
            onSelect={(candidate) => onSelectEntityCandidate(contact, candidate)}
            loading={entityLoading}
          />
        )}

        <ContactWorkspace
          key={contact.id}
          contacts={normalizeContacts(contact.contacts)}
          onContactsChange={(next) => onSaveContact(contact.id, next)}
          ownerName={contact.name || label}
          propertyAddress={propertyAddress}
          owner={contact.name || label}
          onCallError={onCallError}
          saving={saving}
          compact
        />
        {callErrorMessage && <p className="text-xs text-destructive">{callErrorMessage}</p>}
      </>
    )}
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

  // Which contact's ContactWorkspace is mid-save, so only that contact's
  // controls disable — a note on one owner shouldn't freeze another's. Uses
  // a contact id, or 'pending-mls_owner' / 'pending-cad_owner' for a box that
  // has no contact yet.
  const [savingContactId, setSavingContactId] = useState<string | null>(null);
  // Surfaces a ContactWorkspace call-recording failure per contact — MLS has
  // no activity log to fall back on, so this is the only feedback the user
  // gets if the attempt itself failed to save.
  const [callErrorMessage, setCallErrorMessage] = useState<Record<string, string>>({});

  const [propertyExpanded, setPropertyExpanded] = useState(true);
  const [countyExpanded, setCountyExpanded] = useState(false);
  const [agentsExpanded, setAgentsExpanded] = useState(false);

  useEffect(() => {
    setNotes(lead?.notes ?? '');
    setDetails(lead);
    setCadMessage('');
    setEntityMessage({});
    setEntityCandidates({});
    setCallErrorMessage({});
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

  // Persists one contact's phone/email workspace blob and folds the saved
  // value back into `details` immediately, so ContactWorkspace's own render
  // (which reads from the `contacts` prop, not its internal freshness ref)
  // doesn't revert to stale data on the next unrelated re-render of this
  // dialog (a CAD lookup on a different contact, a notes save, etc.).
  const saveContact = async (contactId: string, next: NormalizedContacts) => {
    setSavingContactId(contactId);
    try {
      const result = await mlsLeadsRequest(`/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: next }),
      });
      if (!result?.id) return;
      setDetails((prev) =>
        prev ? { ...prev, contacts: prev.contacts.map((c) => (c.id === contactId ? { ...c, contacts: result.contacts } : c)) } : prev
      );
    } finally {
      setSavingContactId(null);
    }
  };

  // Fires the first time the always-present seller/buyer box has something
  // to save and has no MlsContact behind it yet — creates one (with this
  // first extraction already on it, in the same call) and adds it to
  // `details.contacts`, so the box switches to the normal saveContact path
  // from here on.
  const createContact = async (role: 'mls_owner' | 'cad_owner', next: NormalizedContacts) => {
    if (!details) return;
    setSavingContactId(`pending-${role}`);
    try {
      const result = await mlsLeadsRequest(`/${details.id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, nameKind: 'person', contacts: next }),
      });
      if (!result?.id) return;
      setDetails((prev) => (prev && !prev.contacts.some((c) => c.id === result.id) ? { ...prev, contacts: [...prev.contacts, result] } : prev));
    } finally {
      setSavingContactId(null);
    }
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
      } else if (body.warning) {
        setEntityMessage((prev) => ({ ...prev, [contact.id]: body.warning }));
      }
      await refresh(details.id);
    } catch (e) {
      setEntityMessage((prev) => ({ ...prev, [contact.id]: e instanceof Error ? e.message : 'Comptroller lookup failed' }));
    } finally {
      setEntityLoadingId(null);
    }
  };

  // Fires when the user picks one row off an `ambiguous` candidate list —
  // fetches that taxpayer's detail record (registered agent included) the
  // same way the automatic single-match path does.
  const selectEntityCandidate = async (contact: MlsContact, candidate: EntityCandidate) => {
    if (!details) return;
    setEntityLoadingId(contact.id);
    setEntityMessage((prev) => ({ ...prev, [contact.id]: '' }));
    try {
      const body = await mlsLeadsRequest(`/contacts/${contact.id}/entity-select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate),
      });
      if (body.success) {
        setEntityCandidates((prev) => ({ ...prev, [contact.id]: [] }));
        if (body.warning) setEntityMessage((prev) => ({ ...prev, [contact.id]: body.warning }));
      } else {
        setEntityMessage((prev) => ({ ...prev, [contact.id]: body.error || 'Entity lookup failed.' }));
      }
      await refresh(details.id);
    } catch (e) {
      setEntityMessage((prev) => ({ ...prev, [contact.id]: e instanceof Error ? e.message : 'Entity lookup failed' }));
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

  const sellerContact = details.contacts.find((c) => c.role === 'mls_owner') || null;
  const buyerContact = details.contacts.find((c) => c.role === 'cad_owner') || null;
  const officerContacts = details.contacts.filter((c) => c.role === 'officer');
  const labels = ownerRoleLabels(details.status);

  const onCallErrorFor = (id: string) => (message: string) => setCallErrorMessage((prev) => ({ ...prev, [id]: message }));

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
      <h3 className="text-base font-semibold">Contacts</h3>
      <Field label="MLS Owner (raw)" value={details.mlsOwnerRaw}/>
      {/* Left-to-right, not stacked: three people's full contact blocks
          top-to-bottom made this dialog endless. Two columns on a wide
          screen, one on narrow — never wider than the dialog itself. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PersonCard
          label={labels.primary}
          contact={sellerContact}
          pendingRole="mls_owner"
          variant="owner"
          propertyAddress={details.address}
          saving={savingContactId === (sellerContact?.id ?? 'pending-mls_owner')}
          onSaveContact={saveContact}
          onCreateContact={createContact}
          onCallError={onCallErrorFor(sellerContact?.id ?? 'pending-mls_owner')}
          callErrorMessage={callErrorMessage[sellerContact?.id ?? 'pending-mls_owner']}
          entityLoading={sellerContact ? entityLoadingId === sellerContact.id : false}
          entityMessage={sellerContact ? entityMessage[sellerContact.id] : ''}
          entityCandidates={sellerContact ? entityCandidates[sellerContact.id] : []}
          onRunEntityLookup={runEntityLookup}
          onSelectEntityCandidate={selectEntityCandidate}
        />
        <PersonCard
          label={labels.secondary}
          contact={buyerContact}
          pendingRole="cad_owner"
          variant="owner"
          propertyAddress={details.address}
          saving={savingContactId === (buyerContact?.id ?? 'pending-cad_owner')}
          onSaveContact={saveContact}
          onCreateContact={createContact}
          onCallError={onCallErrorFor(buyerContact?.id ?? 'pending-cad_owner')}
          callErrorMessage={callErrorMessage[buyerContact?.id ?? 'pending-cad_owner']}
          entityLoading={buyerContact ? entityLoadingId === buyerContact.id : false}
          entityMessage={buyerContact ? entityMessage[buyerContact.id] : ''}
          entityCandidates={buyerContact ? entityCandidates[buyerContact.id] : []}
          onRunEntityLookup={runEntityLookup}
          onSelectEntityCandidate={selectEntityCandidate}
        />
        {officerContacts.map((officer) => (
          <PersonCard
            key={officer.id}
            label={officer.title || 'Officer'}
            contact={officer}
            variant="officer"
            propertyAddress={details.address}
            saving={savingContactId === officer.id}
            onSaveContact={saveContact}
            onCreateContact={createContact}
            onCallError={onCallErrorFor(officer.id)}
            callErrorMessage={callErrorMessage[officer.id]}
          />
        ))}
      </div>
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
