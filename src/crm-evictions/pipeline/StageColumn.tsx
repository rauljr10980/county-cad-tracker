import { useCallback, useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Loader2 } from 'lucide-react';
import { listLeads } from '../api/evictionsCrm';
import type { Lead } from '../types/crm';
import { LeadCard } from './LeadCard';

const PAGE_SIZE = 25;

export function StageColumn({ stage, reloadKey }: { stage: string; reloadKey: number }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestSeq = useRef(0);
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  const load = useCallback(async (targetPage: number) => {
    const requestId = ++requestSeq.current;
    setLoading(true);
    setError(false);
    try {
      const data = await listLeads({ stage, page: targetPage, pageSize: PAGE_SIZE, corporate: 'all' });
      if (requestSeq.current !== requestId) return; // superseded by a newer request
      setLeads((prev) => (targetPage === 1 ? data.items : [...prev, ...data.items]));
      setTotal(data.total);
    } catch {
      if (requestSeq.current !== requestId) return;
      setError(true);
    } finally {
      if (requestSeq.current === requestId) setLoading(false);
    }
  }, [stage]);

  useEffect(() => { setPage(1); load(1); }, [load, reloadKey]);

  return (
    <div
      ref={setNodeRef}
      className={`w-64 shrink-0 rounded-lg border bg-card/40 flex flex-col max-h-full ${isOver ? 'ring-2 ring-primary' : ''}`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold">{stage}</span>
        <span className="text-[11px] text-muted-foreground">{total.toLocaleString()}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {leads.map((lead) => <LeadCard key={lead.id} lead={lead} stage={stage} />)}
        {loading && <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />}
        {!loading && error && (
          <p className="text-[11px] text-destructive text-center py-4">Couldn&apos;t load</p>
        )}
        {!loading && !error && leads.length < total && (
          <button
            onClick={() => { const next = page + 1; setPage(next); load(next); }}
            className="w-full text-[11px] text-primary py-1.5 hover:bg-muted/40 rounded"
          >
            Load {Math.min(PAGE_SIZE, total - leads.length)} more
          </button>
        )}
        {!loading && !error && total === 0 && <p className="text-[11px] text-muted-foreground text-center py-4">Empty</p>}
      </div>
    </div>
  );
}
