import { useEffect, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { fmtDate, fmtMoney, type MlsLead } from './MlsLeadsView';

type Props = {
  lead: MlsLead | null;
  onClose: () => void;
  onSaveNotes: (notes: string) => Promise<void>;
};

// Blank fields render an explicit em dash rather than being omitted, so
// missing source data reads differently from a field the screen forgot.
function Field({ label, value, record = false }: { label: string; value?: ReactNode; record?: boolean }) {
  const isBlank = value === null || value === undefined || value === '';
  return <div>
    <p className="label">{label}</p>
    <p className={record ? 'record' : ''}>{isBlank ? '—' : value}</p>
  </div>;
}

export default function MlsLeadDetails({ lead, onClose, onSaveNotes }: Props) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setNotes(lead?.notes ?? ''); }, [lead?.id]);

  const saveNotes = async () => {
    if (!lead || notes === lead.notes) return;
    setSaving(true);
    try { await onSaveNotes(notes); } finally { setSaving(false); }
  };

  return <Dialog open={!!lead} onOpenChange={(v) => !v && onClose()}><DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">{lead && <>
    <DialogHeader>
      <p className="label">MLS #<span className="record ml-1">{lead.mlsNumber || '—'}</span>{lead.hidden && <span className="ml-2">HIDDEN</span>}</p>
      <DialogTitle className="pr-8">{lead.address || '—'}</DialogTitle>
    </DialogHeader>

    <section className="rounded border bg-card p-3.5 space-y-3">
      <h3 className="text-base font-semibold">Property</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Address" value={lead.address} record/>
        <Field label="Street #" value={lead.streetNumber} record/>
        <Field label="Direction" value={lead.streetDir}/>
        <Field label="Street Name" value={lead.streetName} record/>
        <Field label="Zip" value={lead.zip} record/>
        <Field label="Zip+4" value={lead.zipPlus} record/>
        <Field label="County" value={lead.county}/>
        <Field label="State" value={lead.state}/>
        <Field label="Area" value={lead.areaCode} record/>
        <Field label="Status" value={<>
          {lead.status || '—'}
          {lead.previousStatus && <span className="block text-xs text-muted-foreground">was {lead.previousStatus} as of <span className="record">{fmtDate(lead.statusChangedAt)}</span></span>}
        </>}/>
        <Field label="Units" value={lead.totalUnits ?? undefined} record/>
        <Field label="Square Feet" value={lead.squareFeet ?? undefined} record/>
        <Field label="Year Built" value={lead.yearBuilt ?? undefined} record/>
        <Field label="Type" value={lead.propertyType}/>
        <Field label="Construction" value={lead.construction}/>
        <Field label="Builder" value={lead.builderName}/>
        <Field label={lead.status === 'SLD' ? 'Sale Price' : 'List Price'} value={fmtMoney(lead.price)} record/>
        <Field label="Days on Market" value={lead.daysOnMarket ?? undefined} record/>
      </div>
    </section>

    <section className="rounded border bg-card p-3.5 space-y-3">
      <h3 className="text-base font-semibold">County</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Legal Description" value={lead.legalDescription}/>
        <Field label="Legal Lot" value={lead.legalLot} record/>
        <Field label="County Account #" value={lead.countyAccountNumber} record/>
        <Field label="Tax Property ID" value={lead.taxPropId} record/>
        <Field label="County Tax" value={lead.countyTax} record/>
      </div>
    </section>

    <section className="rounded border bg-card p-3.5 space-y-3">
      <h3 className="text-base font-semibold">Agents</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="List Agent" value={lead.listAgent}/>
        <Field label="List Agent Phone" value={lead.listAgentPhone} record/>
        <Field label="Selling Agent" value={lead.sellingAgent}/>
        <Field label="Selling Agent Phone" value={lead.sellingAgentPhone} record/>
        <Field label="LREA/LREB" value={lead.lreaLreb} record/>
      </div>
    </section>

    <section className="rounded border bg-card p-3.5 space-y-3">
      <h3 className="text-base font-semibold">Owner</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="MLS Owner (raw)" value={lead.mlsOwnerRaw}/>
      </div>
      {!lead.contacts.length && <p className="text-sm text-muted-foreground">No contact record — the owner text above didn't classify as a person or entity.</p>}
      {lead.contacts.map((c) => (
        <div key={c.id} className="rounded bg-muted p-2.5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Name" value={c.name}/>
          <Field label="Kind" value={c.nameKind}/>
          <Field label="Search Name" value={c.searchName}/>
        </div>
      ))}
    </section>

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
  </>}</DialogContent></Dialog>;
}
