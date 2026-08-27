import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { getLead, patchLead } from '../api/evictionsCrm';
import { STAGES, SERVICE_INTERESTS } from '../constants';
import type { LeadDetail } from '../types/crm';
import { fmt } from '../format';
import { ErrorBanner } from '../components/ErrorBanner';
import { normalizeContacts } from '@/lib/contactsModel';

export function LeadProfile({ leadId, onClose, onSaved }: { leadId: string; onClose: () => void; onSaved: () => void }) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState('');
  // In-flight guard: save() reads the render-closure `lead` to compute the next
  // value (e.g. toggleService), so two edits fired before the first PATCH lands
  // both read the same stale base and the second overwrites the first. Disabling
  // the editable controls while a save is in flight closes that window.
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setError('');
    getLead(leadId)
      .then((detail) => setLead({ ...detail, contacts: normalizeContacts(detail.contacts) }))
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load this lead.'));
  }, [leadId]);

  const save = async (data: Record<string, unknown>) => {
    if (!lead) return;
    setSaving(true);
    try {
      await patchLead(lead.id, data);
      setLead({ ...lead, ...data } as LeadDetail);
      setError('');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const toggleService = (value: string) => {
    if (!lead) return;
    let next = lead.serviceInterests || ['Undecided'];
    if (value === 'Undecided') next = ['Undecided'];
    else {
      next = next.filter((x) => x !== 'Undecided');
      next = next.includes(value) ? next.filter((x) => x !== value) : [...next, value];
      if (!next.length) next = ['Undecided'];
    }
    save({ serviceInterests: next });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {!lead ? (
          error ? (
            <div className="my-12 flex flex-col items-center gap-4">
              <ErrorBanner message={error} />
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin mx-auto my-12" />
          )
        ) : <>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {lead.name}
              {lead.parkedAt && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  Parked
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              {lead.isCorporate ? 'Business entity' : 'Individual'} · {lead.filingCount} filings · {lead.addressCount} properties
            </DialogDescription>
          </DialogHeader>

          {error && <ErrorBanner message={error} />}

          <div className="grid md:grid-cols-2 gap-4">
            <section className="rounded-lg border p-3 space-y-3">
              <h3 className="text-sm font-semibold">Pipeline</h3>
              <div className="flex items-center gap-2">
                <select
                  className="h-10 flex-1 rounded-md border bg-background px-2 text-sm"
                  value={lead.contactStage}
                  disabled={saving}
                  onChange={(e) => save({ contactStage: e.target.value })}
                >
                  {STAGES.map((s) => <option key={s}>{s}</option>)}
                </select>
                {/* parkedAt is independent of contactStage — parking never touches the stage. */}
                <Button
                  type="button"
                  size="sm"
                  variant={lead.parkedAt ? 'default' : 'outline'}
                  disabled={saving}
                  onClick={() => save({ parkedAt: lead.parkedAt ? null : new Date().toISOString() })}
                >
                  {lead.parkedAt ? 'Unpark' : 'Park'}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {SERVICE_INTERESTS.map((s) => (
                  <Button key={s} size="sm" disabled={saving} variant={lead.serviceInterests?.includes(s) ? 'default' : 'outline'} onClick={() => toggleService(s)}>
                    {s}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Owner: {lead.assignedTo?.username || 'Unassigned'} · Next follow-up: {fmt(lead.nextFollowUpAt)}
              </p>
              <Textarea
                placeholder="Notes"
                value={lead.notes || ''}
                disabled={saving}
                onChange={(e) => setLead({ ...lead, notes: e.target.value })}
                onBlur={() => save({ notes: lead.notes })}
              />
            </section>

            <section className="rounded-lg border p-3 space-y-2">
              <h3 className="text-sm font-semibold">Contacts</h3>
              {(lead.contacts?.phoneRows || []).flatMap((r) => r.phones.map((p, i) => (
                <div key={`${r.name}-${i}`} className="text-sm flex gap-2">
                  <span className="font-medium">{r.name || lead.name}</span>
                  <a className="text-primary" href={`tel:${p.number}`}>{p.number}</a>
                </div>
              )))}
              {(lead.contacts?.emailRows || []).flatMap((r) => r.emails.map((e, i) => (
                <div key={`${r.name}-${i}`} className="text-sm"><a className="text-primary" href={`mailto:${e.address}`}>{e.address}</a></div>
              )))}
              {!lead.contacts?.phoneRows?.length && !lead.contacts?.emailRows?.length && (
                <p className="text-sm text-muted-foreground">No contacts captured yet.</p>
              )}
            </section>
          </div>

          <section className="rounded-lg border p-3">
            <h3 className="text-sm font-semibold mb-2">Properties</h3>
            <div className="grid md:grid-cols-2 gap-2">
              {lead.addresses.map((a) => (
                <div key={a.id} className="rounded bg-muted/40 p-2 text-sm">{a.address}, {a.city}, {a.state} {a.zip}</div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border p-3">
            <h3 className="text-sm font-semibold mb-2">Eviction filings</h3>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead><tr>{['Case', 'Filed', 'Status', 'Precinct', 'Disposition'].map((h) => <th key={h} className="text-left p-2 text-muted-foreground">{h}</th>)}</tr></thead>
                <tbody>
                  {lead.filings.map((f) => (
                    <tr key={f.id} className="border-t">
                      <td className="p-2">{f.caseNumber}</td>
                      <td className="p-2 whitespace-nowrap">{fmt(f.filedDate)}</td>
                      <td className="p-2">{f.caseStatus}</td>
                      <td className="p-2">{f.precinct}</td>
                      <td className="p-2">{f.disposition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border p-3">
            <h3 className="text-sm font-semibold mb-2">Activity</h3>
            {lead.activities.length === 0 && <p className="text-sm text-muted-foreground">No activity logged.</p>}
            {lead.activities.slice(0, 15).map((a) => (
              <div key={a.id} className="text-sm border-l-2 pl-2 mb-2">
                <span className="font-medium capitalize">{a.kind}</span> · {fmt(a.createdAt)}
                <div className="text-muted-foreground">{a.body}</div>
              </div>
            ))}
          </section>
        </>}
      </DialogContent>
    </Dialog>
  );
}
