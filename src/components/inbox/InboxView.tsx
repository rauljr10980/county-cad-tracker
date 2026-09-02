import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  ChevronDown, ChevronLeft, ChevronRight, Clock, Inbox as InboxIcon, Loader2, Mail, MapPin, Phone, X,
} from 'lucide-react';

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

const STATUSES = ['new', 'contacted', 'converted', 'spam'] as const;
type Status = typeof STATUSES[number];

const STATUS_LABELS: Record<Status, string> = {
  new: 'New',
  contacted: 'Contacted',
  converted: 'Converted',
  spam: 'Spam',
};

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
const STATUS_TONE: Record<Status, string> = { new: 'blue', contacted: 'warn', converted: 'success', spam: 'grey' };

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

// ---------------------------------------------------------------------------
// Waiting time — the signature element of this screen. A lead sitting
// untouched for an hour is a different situation than one sitting untouched
// for four days, and the row needs to say so at a glance. Pure and exported
// so the tier boundaries are testable without rendering anything.
// ---------------------------------------------------------------------------

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const THREE_DAYS_MS = 3 * ONE_DAY_MS;

export type WaitingTier = 'fresh' | 'aging' | 'stale';

export function getWaitingTier(createdAt: string, now: Date = new Date()): WaitingTier {
  const elapsed = now.getTime() - new Date(createdAt).getTime();
  if (elapsed >= THREE_DAYS_MS) return 'stale';
  if (elapsed >= ONE_DAY_MS) return 'aging';
  return 'fresh';
}

const WAITING_TIER_CLASS: Record<WaitingTier, string> = {
  fresh: 'text-muted-foreground',
  aging: 'text-warning',
  stale: 'text-destructive',
};

export function formatWaitingTime(createdAt: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(createdAt).getTime();
  if (elapsed < 60_000) return 'Just now';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

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

      <section className="rounded-lg border bg-card p-4 space-y-3">
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

      <section className="rounded-lg border bg-card p-4 space-y-2">
        <h3 className="text-base font-semibold">Message</h3>
        {submission.message
          ? <p className="whitespace-pre-wrap text-sm">{submission.message}</p>
          : <p className="text-sm text-muted-foreground">No message left.</p>}
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <label className="grid gap-1.5">
          <span className="label">STATUS</span>
          <select
            className="h-10 w-full rounded border bg-card px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            value={status}
            onChange={(e) => changeStatus(e.target.value)}
          >
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="label">NOTES</span>
          <textarea
            className="min-h-[96px] w-full resize-y rounded border bg-card px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
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

// ---------------------------------------------------------------------------
// Summary + tab counts. There's no aggregate-stats endpoint and this screen
// isn't allowed to add one, so counts come from the existing list endpoint
// two ways: an exact per-status `total` (cheap, unbounded by row count) for
// anything the user will act on — the tab counts and the new/converted
// tiles — and a single unfiltered fetch of the newest 100 rows for the two
// recency-window tiles (this week's arrivals, the longest an untouched
// "new" lead has waited). Those two are exact as long as fewer than 100
// submissions land in a week or sit untouched at once, which comfortably
// covers this business today; if that ever stops being true, this needs a
// real aggregate endpoint instead of a bigger page size.
// ---------------------------------------------------------------------------

type Stats = {
  counts: Record<Status, number>;
  weeklyArrivals: number;
  oldestNewCreatedAt: string | null;
};

async function fetchStatusTotal(status: Status): Promise<number> {
  const data = await request(`/submissions?status=${status}&page=1&pageSize=10`);
  return (data.total as number) || 0;
}

function RowSkeleton() {
  return (
    <li className="rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24 rounded-full" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-4 w-3/4 max-w-sm" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2.5">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </li>
  );
}

function SummaryTile({ label, value, valueClassName, title }: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  title?: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3.5">
      <p className="label">{label}</p>
      <p className={cn('record mt-1.5 text-xl font-semibold text-foreground', valueClassName)} title={title}>
        {value ?? '—'}
      </p>
    </div>
  );
}

function EmptyState({ kind, activeFilterLabels, onClearFilters }: {
  kind: 'loading' | 'none' | 'filtered';
  activeFilterLabels: string[];
  onClearFilters: () => void;
}) {
  if (kind === 'loading') {
    return (
      <div className="rounded-lg border border-dashed bg-card/50 px-6 py-14 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (kind === 'none') {
    return (
      <div className="rounded-lg border border-dashed bg-card/50 px-6 py-14 text-center">
        <InboxIcon className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 font-medium text-foreground">No submissions yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-muted-foreground">
          The inbox fills automatically from four forms on the marketing site — Sell Property,
          Distressed Property, Inherited Property, and Landlord Help. None of those forms are
          live on the site yet, so nothing has come in. Submissions will show up here as soon as
          they launch.
        </p>
      </div>
    );
  }

  const verb = activeFilterLabels.length > 1 ? 'are' : 'is';
  return (
    <div className="rounded-lg border border-dashed bg-card/50 px-6 py-14 text-center">
      <InboxIcon className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 font-medium text-foreground">No submissions match these filters</p>
      <p className="mx-auto mt-1.5 max-w-md text-muted-foreground">
        {activeFilterLabels.length
          ? `${activeFilterLabels.join(' and ')} ${verb} excluding everything here.`
          : 'The current filters are excluding everything here.'}
      </p>
      <button
        type="button"
        onClick={onClearFilters}
        className="mt-4 inline-flex items-center gap-1.5 rounded border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filters
      </button>
    </div>
  );
}

function SubmissionRow({ item, onOpen, onStatusChange }: {
  item: PublicSubmission;
  onOpen: (item: PublicSubmission) => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  const tier = getWaitingTier(item.createdAt);

  return (
    <li
      className="cursor-pointer rounded-lg border bg-card p-4 sm:p-5 transition-colors hover:border-primary/30 motion-reduce:transition-none"
      onClick={() => onOpen(item)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold leading-tight text-foreground">{item.name || 'Unnamed'}</h3>
            <span className={pill(SOURCE_PAGE_TONE[item.sourcePage] ?? 'grey')}>{sourcePageLabel(item.sourcePage)}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            {item.phone && (
              <a
                href={`tel:${item.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="record inline-flex items-center gap-1.5 rounded-sm text-foreground hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {item.phone}
              </a>
            )}
            {item.email && (
              <a
                href={`mailto:${item.email}`}
                onClick={(e) => e.stopPropagation()}
                className="record inline-flex items-center gap-1.5 rounded-sm text-foreground hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {item.email}
              </a>
            )}
            {!item.phone && !item.email && <span className="text-muted-foreground">No contact info left</span>}
          </div>

          {item.propertyAddress && (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="record">{item.propertyAddress}</span>
            </p>
          )}

          {item.message ? (
            <p className="mt-2.5 line-clamp-2 text-sm text-foreground/80">{item.message}</p>
          ) : (
            <p className="mt-2.5 text-sm italic text-muted-foreground">No message left.</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2.5">
          <span
            className={cn('inline-flex items-center gap-1.5 record text-base font-semibold', WAITING_TIER_CLASS[tier])}
            title={fmtDateTime(item.createdAt)}
          >
            <Clock className="h-4 w-4" aria-hidden="true" />
            {formatWaitingTime(item.createdAt)}
          </span>

          <span className="relative inline-block">
            <select
              aria-label={`Status for ${item.name || 'this submission'}`}
              className={cn(
                pill((STATUS_TONE as Record<string, string>)[item.status] ?? 'grey'),
                'cursor-pointer appearance-none border-0 py-1 pl-2.5 pr-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'
              )}
              value={item.status}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { e.stopPropagation(); onStatusChange(item.id, e.target.value); }}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2" aria-hidden="true" />
          </span>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(item); }}
            className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            View details <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}

export default function InboxView() {
  const [items, setItems] = useState<PublicSubmission[]>([]);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [status, setStatus] = useState('');
  const [sourcePage, setSourcePage] = useState('');

  const [selected, setSelected] = useState<PublicSubmission | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (status) params.set('status', status);
    if (sourcePage) params.set('sourcePage', sourcePage);
    try {
      const data = await request(`/submissions?${params}`);
      setItems((data.items as PublicSubmission[]) || []);
      setPages((data.pages as number) || 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load submissions');
    } finally {
      setLoading(false);
    }
  }, [page, status, sourcePage]);
  useEffect(() => { load(); }, [load]);

  const loadStats = useCallback(async () => {
    try {
      const [newTotal, contactedTotal, convertedTotal, spamTotal] = await Promise.all(
        STATUSES.map((s) => fetchStatusTotal(s))
      );
      const bulk = await request('/submissions?page=1&pageSize=100');
      const recent = (bulk.items as PublicSubmission[]) || [];
      const weekAgo = Date.now() - 7 * ONE_DAY_MS;
      const weeklyArrivals = recent.filter((i) => new Date(i.createdAt).getTime() >= weekAgo).length;
      const oldestNew = recent
        .filter((i) => i.status === 'new')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
      setStats({
        counts: { new: newTotal, contacted: contactedTotal, converted: convertedTotal, spam: spamTotal },
        weeklyArrivals,
        oldestNewCreatedAt: oldestNew ? oldestNew.createdAt : null,
      });
    } catch {
      // The summary strip is a nice-to-have; if it fails to load the tiles
      // just show "—" and the main list (with its own error banner) keeps working.
    } finally {
      setStatsLoading(false);
    }
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  const save = async (id: string, updates: Updates) => {
    await request(`/submissions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, ...updates } : prev));
    if (updates.status) void loadStats();
  };

  const quickUpdateStatus = (id: string, newStatus: string) => { void save(id, { status: newStatus }); };

  const clearFilters = () => { setStatus(''); setSourcePage(''); setPage(1); };

  const globalTotal = stats ? STATUSES.reduce((sum, s) => sum + stats.counts[s], 0) : null;

  const activeFilterLabels: string[] = [];
  if (status) activeFilterLabels.push(`Status “${STATUS_LABELS[status as Status]}”`);
  if (sourcePage) activeFilterLabels.push(`Source “${sourcePageLabel(sourcePage)}”`);

  const emptyKind: 'loading' | 'none' | 'filtered' =
    statsLoading || globalTotal === null ? 'loading' : globalTotal === 0 ? 'none' : 'filtered';

  const longestWaitTier = stats?.oldestNewCreatedAt ? getWaitingTier(stats.oldestNewCreatedAt) : null;

  return <div className="min-h-full p-6 md:p-8 text-sm">
    <div className="mb-6">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      <p className="mt-1.5 text-muted-foreground">
        Leads from your website — people who filled out a form and are waiting to hear back.
      </p>
    </div>

    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <SummaryTile label="New & unworked" value={stats ? stats.counts.new : null} />
      <SummaryTile
        label="Longest wait"
        value={stats ? (stats.oldestNewCreatedAt ? formatWaitingTime(stats.oldestNewCreatedAt) : 'None waiting') : null}
        valueClassName={longestWaitTier ? WAITING_TIER_CLASS[longestWaitTier] : undefined}
        title={stats?.oldestNewCreatedAt ? fmtDateTime(stats.oldestNewCreatedAt) : undefined}
      />
      <SummaryTile label="Arrived this week" value={stats ? stats.weeklyArrivals : null} />
      <SummaryTile label="Converted" value={stats ? stats.counts.converted : null} />
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <Tabs value={status || 'all'} onValueChange={(v) => { setStatus(v === 'all' ? '' : v); setPage(1); }}>
        <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-md border bg-card p-1">
          <TabsTrigger value="all">
            All <span className="record ml-1.5 text-[11px] opacity-60">{globalTotal ?? '—'}</span>
          </TabsTrigger>
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {STATUS_LABELS[s]} <span className="record ml-1.5 text-[11px] opacity-60">{stats ? stats.counts[s] : '—'}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <label className="grid gap-1.5">
        <span className="label">SOURCE PAGE</span>
        <select
          className="h-10 rounded border bg-card px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          value={sourcePage}
          onChange={(e) => { setSourcePage(e.target.value); setPage(1); }}
        >
          <option value="">All pages</option>
          {Object.entries(SOURCE_PAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>

    {error && <div className="mb-[18px] rounded-r-md border-l-[3px] border-destructive bg-destructive/10 px-3.5 py-3 text-destructive">{error}</div>}

    {loading ? (
      <ul className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)}
      </ul>
    ) : items.length ? (
      <ul className="space-y-3">
        {items.map((item) => (
          <SubmissionRow key={item.id} item={item} onOpen={setSelected} onStatusChange={quickUpdateStatus} />
        ))}
      </ul>
    ) : (
      <EmptyState kind={emptyKind} activeFilterLabels={activeFilterLabels} onClearFilters={clearFilters} />
    )}

    <div className="flex items-center justify-between pt-4 text-xs text-muted-foreground">
      <span>Page {page} of {pages}</span>
      <span className="flex gap-2">
        <button className="inline-flex items-center gap-1.5 rounded border bg-card px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4"/></button>
        <button className="inline-flex items-center gap-1.5 rounded border bg-card px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4"/></button>
      </span>
    </div>

    <SubmissionDetails submission={selected} onClose={() => setSelected(null)} onSave={save}/>
  </div>;
}
