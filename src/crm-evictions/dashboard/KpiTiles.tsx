import type { CrmStats } from '../types/crm';

const tile = (label: string, value: number, hint: string, tone = 'text-foreground') => ({ label, value, hint, tone });

export function KpiTiles({ stats }: { stats: CrmStats }) {
  const tiles = [
    tile('Total leads', stats.total, 'all eviction landlords'),
    tile('New leads', stats.byStage['New Lead'] || 0, 'not yet worked'),
    tile('Contacted', stats.byStage['Contacted'] || 0, 'reached at least once'),
    tile('Appointments', stats.byStage['Appointment Scheduled'] || 0, 'scheduled'),
    tile('Follow-ups', stats.followUpsDue.today + stats.followUpsDue.next7, `${stats.followUpsDue.overdue} overdue`, stats.followUpsDue.overdue ? 'text-warning' : 'text-foreground'),
    tile('Active opportunities', stats.activeOpportunities, 'interested or under contract', 'text-success'),
    tile('Closed', stats.closedDeals, 'deals closed', 'text-success'),
    tile('Unassigned', stats.unassigned, 'no owner yet'),
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border bg-card p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t.label}</p>
          <p className={`text-2xl font-semibold mt-1 ${t.tone}`}>{t.value.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t.hint}</p>
        </div>
      ))}
    </div>
  );
}
