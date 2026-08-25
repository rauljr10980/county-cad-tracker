import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { listLeads, getPipelineCounts } from '../api/evictionsCrm';
import type { Lead, PipelineCounts } from '../types/crm';
import { ErrorBanner } from '../components/ErrorBanner';
import { LeadProfile } from '../leads/LeadProfile';
import { QueueTabs } from './QueueTabs';
import { PipelineTable } from './PipelineTable';
import type { QueueId } from './queues';

export function PipelinePage() {
  const [queue, setQueue] = useState<QueueId>('needsContact');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counts, setCounts] = useState<PipelineCounts | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setLoading(true);
    setError('');
    try {
      const params = { queue, search, corporate: 'all' as const, page: 1, pageSize: 100 };
      const [rows, tallies] = await Promise.all([listLeads(params), getPipelineCounts(params)]);
      if (requestSeq.current !== requestId) return; // superseded by a newer request
      setLeads(rows.items);
      setTotal(rows.total);
      setCounts(tallies);
    } catch (e) {
      if (requestSeq.current !== requestId) return;
      setError(e instanceof Error ? e.message : 'Unable to load the pipeline');
    } finally {
      if (requestSeq.current === requestId) setLoading(false);
    }
  }, [queue, search]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label mb-1">Bexar County · Eviction filings</p>
          <h1 className="text-2xl font-semibold">Pipeline</h1>
        </div>
        <p className="record text-sm text-muted-foreground">
          {counts ? `${counts.all.toLocaleString()} owners` : ' '}
        </p>
      </div>

      <QueueTabs active={queue} counts={counts} onChange={setQueue} />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto] md:items-center">
        <Input
          placeholder="Search owner or mailing address"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <p className="record text-sm text-muted-foreground md:justify-self-end">
          {loading ? ' ' : `${leads.length.toLocaleString()} of ${total.toLocaleString()}`}
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      <PipelineTable leads={leads} loading={loading} onOpen={setOpenId} />

      {openId && <LeadProfile leadId={openId} onClose={() => setOpenId(null)} onSaved={load} />}
    </div>
  );
}
