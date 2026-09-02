import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

export type PublicSubmission = {
  id: string;
  sourcePage: string;
  name: string;
  email: string;
  phone: string;
  propertyAddress: string;
  message: string;
  status: string;
  notes: string;
  userAgent: string;
  createdAt: string;
  updatedAt: string;
};

const STATUSES = ['new', 'contacted', 'converted', 'spam'];

// Same four funnel pages the public marketing site's forms POST from — see
// functions/src/lib/publicIntake.js's SOURCE_PAGES, which the backend
// enforces as an allow-list. Kept in sync by hand: this is a display map on
// the frontend, that one is validation on the backend.
const SOURCE_PAGE_LABELS: Record<string, string> = {
  'sell-property': 'Sell Property',
  'distressed-property': 'Distressed Property',
  'inherited-property': 'Inherited Property',
  'landlord-help': 'Landlord Help',
};
const sourcePageLabel = (page: string) => SOURCE_PAGE_LABELS[page] ?? page;

// Source page is the intent signal — someone from distressed-property is a
// different conversation than someone from landlord-help — so each page
// gets its own distinct, consistent tone rather than one flat badge.
const SOURCE_PAGE_TONE: Record<string, string> = {
  'sell-property': 'blue',
  'distressed-property': 'danger',
  'inherited-property': 'warn',
  'landlord-help': 'success',
};
const STATUS_TONE: Record<string, string> = { new: 'blue', contacted: 'warn', converted: 'success', spam: 'grey' };

const PILL_BASE = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold';
const PILL_TONE_CLASSES: Record<string, string> = {
  grey: 'bg-muted text-muted-foreground',
  blue: 'bg-primary/15 text-primary',
  warn: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
  success: 'bg-success/15 text-success',
};
const pill = (tone: string) => `${PILL_BASE} ${PILL_TONE_CLASSES[tone] ?? PILL_TONE_CLASSES.grey}`;

const fmtDateTime = (value: string) => (value ? new Date(value).toLocaleString() : '—');

const request = async (path: string, init?: RequestInit) => {
  const headers = { ...getAuthHeaders(), ...(init?.headers || {}) } as Record<string, string>;
  const res = await fetch(`${API_BASE_URL}/api/public${path}`, { ...init, headers });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    if (text) body = JSON.parse(text);
  } catch {
    body = { error: text || `Request failed (${res.status})` };
  }
  if (!res.ok) throw new Error((body.error as string) || `Request failed (${res.status})`);
  return body;
};

type Updates = { status?: string; notes?: string };

function SubmissionDetails({ submission, onClose, onSave }: {
  submission: PublicSubmission | null;
  onClose: () => void;
  onSave: (id: string, updates: Updates) => Promise<void>;
}) {
  const [status, setStatus] = useState('new');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(submission?.status ?? 'new');
    setNotes(submission?.notes ?? '');
  }, [submission?.id]);

  if (!submission) {
    return <Dialog open={false} onOpenChange={() => {}}><DialogContent/></Dialog>;
  }

  const changeStatus = async (next: string) => {
    setStatus(next);
    setSaving(true);
    try { await onSave(submission.id, { status: next }); } finally { setSaving(false); }
  };

  const saveNotes = async () => {
    if (notes === submission.notes) return;
    setSaving(true);
    try { await onSave(submission.id, { notes }); } finally { setSaving(false); }
  };

  return <Dialog open={!!submission} onOpenChange={(v) => !v && onClose()}>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <p className="label">RECEIVED <span className="record ml-1">{fmtDateTime(submission.createdAt)}</span></p>
        <DialogTitle className="pr-8 flex flex-wrap items-center gap-2">
          <span>{submission.name || '—'}</span>
          <span className={pill(SOURCE_PAGE_TONE[submission.sourcePage] ?? 'grey')}>{sourcePageLabel(submission.sourcePage)}</span>
        </DialogTitle>
      </DialogHeader>

      <section className="rounded border bg-card p-3.5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <p className="label">PHONE</p>
            <p className="record">{submission.phone || '—'}</p>
          </div>
          <div>
            <p className="label">EMAIL</p>
            <p className="record">{submission.email || '—'}</p>
          </div>
        </div>
        <div>
          <p className="label">PROPERTY ADDRESS</p>
          <p className="record">{submission.propertyAddress || '—'}</p>
        </div>
      </section>

      <section className="rounded border bg-card p-3.5 space-y-2">
        <h3 className="text-base font-semibold">Message</h3>
        {submission.message
          ? <p className="whitespace-pre-wrap text-sm">{submission.message}</p>
          : <p className="text-sm text-muted-foreground">No message left.</p>}
      </section>

      <section className="rounded border bg-card p-3.5 space-y-3">
        <label className="grid gap-1.5">
          <span className="label">STATUS</span>
          <select
            className="h-10 w-full rounded border bg-card px-3 text-sm"
            value={status}
            onChange={(e) => changeStatus(e.target.value)}
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="label">NOTES</span>
          <textarea
            className="min-h-[96px] w-full resize-y rounded border bg-card px-3 py-2 text-sm"
            placeholder="Notes about this lead"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
          />
        </label>
        {saving && <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin"/>Saving…</span>}
      </section>
    </DialogContent>
  </Dialog>;
}

export default function InboxView() {
  const [items, setItems] = useState<PublicSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [status, setStatus] = useState('');
  const [sourcePage, setSourcePage] = useState('');

  const [selected, setSelected] = useState<PublicSubmission | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (status) params.set('status', status);
    if (sourcePage) params.set('sourcePage', sourcePage);
    try {
      const data = await request(`/submissions?${params}`);
      setItems((data.items as PublicSubmission[]) || []);
      setTotal((data.total as number) || 0);
      setPages((data.pages as number) || 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load submissions');
    } finally {
      setLoading(false);
    }
  }, [page, status, sourcePage]);
  useEffect(() => { load(); }, [load]);

  const save = async (id: string, updates: Updates) => {
    await request(`/submissions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, ...updates } : prev));
  };

  return <div className="min-h-full p-6 md:p-8 text-sm">
    <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
      <div>
        <p className="label">PUBLIC LEAD INTAKE</p>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="mt-1 text-muted-foreground"><span className="record">{total.toLocaleString()}</span> submissions from the public site</p>
      </div>
    </div>

    <div className="rounded border bg-card grid grid-cols-1 sm:grid-cols-2 gap-[11px] p-4 mb-[18px] items-end">
      <label className="grid gap-1.5">
        <span className="label">SOURCE PAGE</span>
        <select
          className="h-10 w-full rounded border bg-card px-3 text-sm"
          value={sourcePage}
          onChange={(e) => { setSourcePage(e.target.value); setPage(1); }}
        >
          <option value="">All pages</option>
          {Object.entries(SOURCE_PAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="grid gap-1.5">
        <span className="label">STATUS</span>
        <select
          className="h-10 w-full rounded border bg-card px-3 text-sm"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
    </div>

    {error && <div className="mb-[18px] rounded-r-md border-l-[3px] border-destructive bg-destructive/10 px-3.5 py-3 text-destructive">{error}</div>}

    <div className="rounded border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead><tr>{['Received', 'Source', 'Name', 'Phone', 'Email', 'Property Address', 'Status'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-[45px] px-2.5 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className="cursor-pointer" onClick={() => setSelected(item)}>
                <td className="record whitespace-nowrap">{fmtDateTime(item.createdAt)}</td>
                <td><span className={pill(SOURCE_PAGE_TONE[item.sourcePage] ?? 'grey')}>{sourcePageLabel(item.sourcePage)}</span></td>
                <td className="min-w-[140px]">{item.name || '—'}</td>
                <td className="record">{item.phone || '—'}</td>
                <td className="record">{item.email || '—'}</td>
                <td className="min-w-[200px]">{item.propertyAddress || '—'}</td>
                <td><span className={pill(STATUS_TONE[item.status] ?? 'grey')}>{item.status || '—'}</span></td>
              </tr>
            ))}
            {!loading && !items.length && <tr><td colSpan={7} className="py-[45px] px-2.5 text-center text-muted-foreground">No submissions match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>

    <div className="flex items-center justify-between pt-3.5 text-xs text-muted-foreground">
      <span>Page {page} of {pages}</span>
      <span className="flex gap-2">
        <button className="inline-flex items-center gap-1.5 rounded border bg-card px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50 disabled:pointer-events-none" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4"/></button>
        <button className="inline-flex items-center gap-1.5 rounded border bg-card px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50 disabled:pointer-events-none" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4"/></button>
      </span>
    </div>

    <SubmissionDetails submission={selected} onClose={() => setSelected(null)} onSave={save}/>
  </div>;
}
