import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { listLeads } from '../api/evictionsCrm';
import { STAGES, STAGE_TONE, SERVICE_INTERESTS, type Stage } from '../constants';
import type { Lead } from '../types/crm';
import { LeadProfile } from './LeadProfile';
import { fmt } from '../format';
import { ErrorBanner } from '../components/ErrorBanner';

export function LeadsPage() {
  const [items, setItems] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [service, setService] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setLoading(true); setError('');
    try {
      const data = await listLeads({ page, pageSize: 25, search, stage, service, corporate: 'all' });
      if (requestSeq.current !== requestId) return; // superseded by a newer request
      setItems(data.items); setTotal(data.total); setPages(data.pages || 1);
    } catch (e) {
      if (requestSeq.current !== requestId) return;
      setError(e instanceof Error ? e.message : 'Unable to load leads');
    } finally {
      if (requestSeq.current === requestId) setLoading(false);
    }
  }, [page, search, stage, service]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <div className="p-6 space-y-4">
      <div>
        <p className="crm-kicker text-[10px] uppercase text-muted-foreground mb-1">Landlord directory</p>
        <h1 className="text-2xl font-semibold">Leads</h1>
        <p className="text-sm text-muted-foreground">{total.toLocaleString()} eviction landlords</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Landlord or address" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="h-10 rounded-md border bg-background px-2 text-sm" value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }}>
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="h-10 rounded-md border bg-background px-2 text-sm" value={service} onChange={(e) => { setService(e.target.value); setPage(1); }}>
          <option value="">All services</option>
          {SERVICE_INTERESTS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>{['Landlord', 'Stage', 'Owner', 'Filings', 'Properties', 'Latest Filing', 'Next Follow-up'].map((h) => (
              <th key={h} className="px-3 py-3 font-medium whitespace-nowrap">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr> : items.map((lead) => (
              <tr key={lead.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setOpenId(lead.id)}>
                <td className="px-3 py-3 font-medium">{lead.name}</td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STAGE_TONE[lead.contactStage as Stage] || 'bg-muted text-muted-foreground'}`}>
                    {lead.contactStage}
                  </span>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{lead.assignedTo?.username || '—'}</td>
                <td className="px-3 py-3">{lead.filingCount}</td>
                <td className="px-3 py-3">{lead.addressCount}</td>
                <td className="px-3 py-3 whitespace-nowrap">{fmt(lead.latestFilingDate)}</td>
                <td className="px-3 py-3 whitespace-nowrap">{fmt(lead.nextTask?.dueAt)}</td>
              </tr>
            ))}
            {!loading && !items.length && <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">No leads match these filters.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Page {page} of {pages}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {openId && <LeadProfile leadId={openId} onClose={() => setOpenId(null)} onSaved={load} />}
    </div>
  );
}
