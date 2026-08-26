import { Loader2 } from 'lucide-react';
import { STAGE_TONE, type Stage } from '../constants';
import type { Lead } from '../types/crm';
import { lastContactLabel, followUpLabel } from './queues';

const COLUMNS = ['Owner', 'Filings', 'Doors', 'Stage', 'Last contact', 'Next follow-up', 'Assigned', ''];

export function PipelineTable({
  leads,
  loading,
  onOpen,
}: {
  leads: Lead[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="rounded border bg-card overflow-x-auto">
      <table className="data-table w-full">
        <thead>
          <tr>{COLUMNS.map((c, i) => <th key={c || `action-${i}`}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={COLUMNS.length} className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
          )}

          {!loading && leads.map((lead) => {
            const overdue = followUpLabel(lead.nextFollowUpAt).endsWith('overdue');
            return (
              <tr key={lead.id} className="cursor-pointer" onClick={() => onOpen(lead.id)}>
                <td className="font-medium">{lead.name}</td>
                <td className="record">{lead.filingCount}</td>
                <td className="record">{lead.addressCount}</td>
                <td>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${STAGE_TONE[lead.contactStage as Stage] || 'bg-muted text-muted-foreground'}`}>
                    {lead.contactStage}
                  </span>
                </td>
                <td className="record text-muted-foreground">{lastContactLabel(lead.lastContactedAt)}</td>
                <td className={`record ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {followUpLabel(lead.nextFollowUpAt)}
                </td>
                <td className="text-muted-foreground">{lead.assignedTo?.username || '—'}</td>
                <td>
                  <button
                    type="button"
                    aria-label={`Open ${lead.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(lead.id);
                    }}
                    className="label rounded border px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span aria-hidden="true">Open</span>
                  </button>
                </td>
              </tr>
            );
          })}

          {!loading && !leads.length && (
            <tr><td colSpan={COLUMNS.length} className="py-12 text-center text-muted-foreground">Nothing in this queue.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
