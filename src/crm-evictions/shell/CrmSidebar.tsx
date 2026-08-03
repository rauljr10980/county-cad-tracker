import { ArrowLeft, Gavel, KanbanSquare, LayoutDashboard, Users } from 'lucide-react';

export type CrmSection = 'dashboard' | 'pipeline' | 'leads';

const ITEMS: { id: CrmSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pipeline', label: 'Pipeline', icon: KanbanSquare },
  { id: 'leads', label: 'Leads', icon: Users },
];

type Props = { section: CrmSection; onSectionChange: (s: CrmSection) => void; onExit: () => void };

export function CrmSidebar({ section, onSectionChange, onExit }: Props) {
  return (
    <aside className="w-56 shrink-0 border-r bg-card/40 flex flex-col p-3 gap-1">
      <div className="flex items-center gap-2 px-2 py-3 mb-2">
        <div className="h-8 w-8 rounded-lg bg-primary/15 grid place-items-center">
          <Gavel className="h-4 w-4 text-primary" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Evictions CRM</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Workspace</p>
        </div>
      </div>

      {ITEMS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onSectionChange(id)}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors ${
            section === id ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}

      <button
        onClick={onExit}
        className="mt-auto flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to platform
      </button>
    </aside>
  );
}
