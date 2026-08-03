import { STAGES } from '../constants';
import type { CrmStats } from '../types/crm';

export function StageDistribution({ stats, onSelectStage }: { stats: CrmStats; onSelectStage?: (stage: string) => void }) {
  const max = Math.max(1, ...STAGES.map((s) => stats.byStage[s] || 0));

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">Pipeline distribution</h3>
      <div className="space-y-1.5">
        {STAGES.map((stage) => {
          const count = stats.byStage[stage] || 0;
          return (
            <button
              key={stage}
              onClick={() => onSelectStage?.(stage)}
              className="w-full flex items-center gap-3 text-sm hover:bg-muted/40 rounded px-1 py-0.5"
            >
              <span className="w-40 shrink-0 text-left text-muted-foreground">{stage}</span>
              <span className="flex-1 h-2 rounded bg-muted overflow-hidden">
                <span className="block h-full bg-primary" style={{ width: `${(count / max) * 100}%` }} />
              </span>
              <span className="w-14 text-right font-medium">{count.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
