import { ArrowLeft, Gavel, KanbanSquare, LayoutDashboard, MapPin, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CrmSection = 'dashboard' | 'pipeline' | 'leads' | 'map';

const ITEMS: { id: CrmSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pipeline', label: 'Pipeline', icon: KanbanSquare },
  { id: 'leads', label: 'Leads', icon: Users },
  { id: 'map', label: 'Map', icon: MapPin },
];

type Props = { section: CrmSection; onSectionChange: (s: CrmSection) => void; onExit: () => void };

/**
 * Navy sidebar against the workspace's light content — the same treatment as
 * NavRail (src/components/layout/NavRail.tsx), which solved this first. Its
 * colors are literal (hsl(var(--navy...)) tokens, plus literal white) rather
 * than the shared semantic Tailwind classes (bg-card, text-muted-foreground,
 * ...): this panel sits on navy while the rest of the workspace sits on
 * paper, so the semantic tokens would mean the wrong thing here.
 */
export function CrmSidebar({ section, onSectionChange, onExit }: Props) {
  return (
    <aside className="w-56 shrink-0 flex flex-col p-3 gap-1" style={{ backgroundColor: 'hsl(var(--navy))' }}>
      <div className="flex items-center gap-2 px-2 py-3 mb-3">
        <div className="h-9 w-9 rounded-lg grid place-items-center" style={{ backgroundColor: 'hsl(var(--navy-soft))' }}>
          <Gavel className="h-4 w-4 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">Evictions CRM</p>
          <p className="label text-white/70">Workspace</p>
        </div>
      </div>

      <nav aria-label="Sections" className="flex flex-col gap-1">
        {ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = section === id;
          return (
            <button
              key={id}
              onClick={() => onSectionChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                isActive ? 'text-white font-medium' : 'text-white/60 hover:text-white'
              )}
              style={isActive ? { backgroundColor: 'hsl(var(--navy-mid))' } : undefined}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </nav>

      <button
        onClick={onExit}
        className="mt-auto flex items-center gap-2 rounded-md px-3 py-2 pt-4 text-sm text-white/60 hover:text-white border-t"
        style={{ borderColor: 'hsl(var(--navy-soft))' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to platform
      </button>
    </aside>
  );
}
