import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getStats } from '../api/evictionsCrm';
import type { CrmStats } from '../types/crm';
import { KpiTiles } from './KpiTiles';
import { StageDistribution } from './StageDistribution';
import { ErrorBanner } from '../components/ErrorBanner';

export function DashboardPage({ onOpenPipeline }: { onOpenPipeline: () => void }) {
  const [stats, setStats] = useState<CrmStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getStats().then(setStats).catch((e) => setError(e instanceof Error ? e.message : 'Unable to load stats'));
  }, []);

  if (error) return <div className="p-6"><ErrorBanner message={error} /></div>;
  if (!stats) return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 space-y-4">
      <div>
        <p className="label mb-1">Command center</p>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Eviction landlord prospecting at a glance</p>
      </div>
      <KpiTiles stats={stats} />
      <div className="grid lg:grid-cols-2 gap-4">
        <StageDistribution stats={stats} onSelectStage={onOpenPipeline} />
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Assigned</h3>
          {stats.byAssignee.length === 0 && <p className="text-sm text-muted-foreground">No leads assigned yet.</p>}
          {stats.byAssignee.map((a) => (
            <div key={a.userId} className="flex justify-between text-sm py-1">
              <span>{a.username}</span>
              <span className="font-medium">{a.count.toLocaleString()}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm py-1 border-t mt-2 pt-2 text-muted-foreground">
            <span>Unassigned</span>
            <span className="font-medium">{stats.unassigned.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
