import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, SkipForward } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';
import { truePeopleSearchUrl } from '@/lib/researchLinks';
import type { NormalizedContacts } from '@/lib/contactsModel';
import { ContactWorkspace } from '@/components/contacts/ContactWorkspace';
import { pillClass, statusTone } from './MlsLeadsView';

type QueueListing = { id: string; address: string; status: string };

type QueuePerson = {
  normalizedName: string;
  name: string;
  searchName: string;
  nameKind: string;
  contactIds: string[];
  listings: QueueListing[];
  representativeAddress: { address: string; state: string; zip: string };
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Same filter snapshot the list view and bulk lookup use, so the queue
   *  covers exactly what the MLS screen is currently showing. */
  filterParams: () => Record<string, string>;
};

async function request(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE_URL}/api/mls-leads${path}`, {
    ...init,
    headers: { ...getAuthHeaders(), ...(init?.headers || {}) },
  });
  const text = await res.text();
  let body: { error?: string; [key: string]: unknown } = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text || `Request failed (${res.status})` };
  }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const EMPTY_CONTACTS: NormalizedContacts = { phoneRows: [], emailRows: [] };

/**
 * One-paste-per-owner, as fast as possible: fetches the whole skip-trace
 * queue once on open, then walks it one person at a time. Every person here
 * is, by construction (see GET /skip-trace-queue), someone with no phone or
 * email on file yet — so ContactWorkspace always starts empty, and whatever
 * it extracts on the primary contact is entirely new. The PATCH the
 * workspace's save fires (see `save` below) already propagates that to
 * every other listing this person owns, on the backend (see mlsLeads.js's
 * PATCH /contacts/:contactId) — nothing extra to do here beyond advancing
 * to the next person once it resolves.
 *
 * ContactWorkspace itself is reused unmodified, not forked — its own
 * "Extract and save" button IS the save half of "Save and next"; `save`
 * below supplies the "and next" half (advancing once the PATCH resolves),
 * and `autoFocus` gets the paste box ready without a click. `skip` is a
 * separate control for "move on without saving."
 */
export default function SkipTraceQueue({ open, onClose, filterParams }: Props) {
  const [people, setPeople] = useState<QueuePerson[]>([]);
  const [index, setIndex] = useState(0);
  const [tracedCount, setTracedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [callError, setCallError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams(filterParams());
      const data = await request(`/skip-trace-queue?${params}`);
      setPeople((data.people as QueuePerson[]) || []);
      setIndex(0);
      setTracedCount(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load the skip-trace queue');
    } finally {
      setLoading(false);
    }
    // filterParams is a useCallback in the caller keyed on the filter bar's
    // own state, so this identity only changes when a filter actually does
    // — re-running load() then is what keeps a filter change made while the
    // queue is closed reflected the next time it's opened.
  }, [filterParams]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const current = people[index] || null;
  const total = people.length;
  const remaining = Math.max(0, total - index);

  const advance = () => setIndex((i) => i + 1);

  const save = async (next: NormalizedContacts) => {
    if (!current) return;
    setSaving(true);
    setError('');
    try {
      // The primary contact id — the backend shares whatever's new here
      // across every id in current.contactIds (and any sibling outside this
      // filtered view) on its own; see mlsLeads.js's PATCH
      // /contacts/:contactId.
      await request(`/contacts/${current.contactIds[0]}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: next }),
      });
      setTracedCount((n) => n + 1);
      advance();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save this contact');
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    setError('');
    advance();
  };

  const openTruePeopleSearch = () => {
    if (!current) return;
    window.open(truePeopleSearchUrl(current.representativeAddress), '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <p className="label">SKIP-TRACE QUEUE</p>
          <DialogTitle>{current ? current.name : loading ? 'Loading…' : 'All caught up'}</DialogTitle>
          {total > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="record">{tracedCount}</span> of <span className="record">{total}</span> traced —{' '}
              <span className="record">{remaining}</span> remaining
            </p>
          )}
        </DialogHeader>

        {loading && (
          <div className="py-10 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        {!loading && !current && !error && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {total === 0 ? 'No one currently needs tracing for these filters.' : "You're through the whole queue."}
          </p>
        )}

        {!loading && current && (
          <div className="space-y-4">
            <section className="rounded border bg-card p-3.5 space-y-2">
              <p className="label">
                LISTINGS (<span className="record">{current.listings.length}</span>)
              </p>
              <div className="space-y-1.5">
                {current.listings.map((listing) => (
                  <div key={listing.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="record">{listing.address || '—'}</span>
                    <span className={pillClass(statusTone(listing.status))}>{listing.status || '—'}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                onClick={openTruePeopleSearch}
                title={`Open TruePeopleSearch, prefilled for ${current.representativeAddress.address}`}
              >
                <ExternalLink className="h-4 w-4" /> Open TruePeopleSearch
              </button>
              <button
                className="inline-flex items-center gap-2 rounded border bg-card px-3 py-2 text-sm hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
                onClick={skip}
                disabled={saving}
                title="Move on without saving anything for this person"
              >
                <SkipForward className="h-4 w-4" /> Skip
              </button>
            </div>

            <ContactWorkspace
              key={current.contactIds.join(',')}
              contacts={EMPTY_CONTACTS}
              onContactsChange={save}
              ownerName={current.name}
              propertyAddress={current.representativeAddress.address}
              owner={current.name}
              onCallError={setCallError}
              saving={saving}
              autoFocus
            />
            {callError && <p className="text-xs text-destructive">{callError}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
