import { useEffect, useState } from 'react';
import { useCrmStore } from '@/crm/store/useCrmStore';
import { useAuth } from '@/contexts/AuthContext';
import ContactsView from '@/crm/views/ContactsView';
import OpportunitiesView from '@/crm/views/OpportunitiesView';
import CrmTasksView from '@/crm/views/CrmTasksView';
import RetailView from '@/crm/views/RetailView';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Users, Kanban, CheckSquare, Store, AlertTriangle } from 'lucide-react';

type CrmTab = 'contacts' | 'opportunities' | 'tasks' | 'retail';

const crmTabs: { id: CrmTab; label: string; icon: React.ElementType }[] = [
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'opportunities', label: 'Opportunities', icon: Kanban },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'retail', label: 'Retail', icon: Store },
];

export function CrmView() {
  const hydrate = useCrmStore((s) => s.hydrate);
  const hydrateError = useCrmStore((s) => s.hydrateError);
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<CrmTab>('contacts');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    hydrate(new Date(), user?.id).then(() => setLoaded(true));
  }, [hydrate, user?.id]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        Loading CRM…
      </div>
    );
  }

  // A failed load must never render as an empty-but-real CRM: the store was
  // deliberately left un-hydrated (see useCrmStore.hydrate) so nothing here
  // can be mistaken for the account's actual data, and so it can't be saved
  // over. Show the failure and let the user retry instead.
  if (hydrateError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium text-foreground">Couldn't load your CRM data</p>
        <p className="max-w-sm text-xs text-muted-foreground">{hydrateError}</p>
        <Button size="sm" onClick={() => hydrate(new Date(), user?.id)}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* CRM sub-navigation */}
      <div className="border-b border-border bg-card/20">
        <div className="flex gap-1 px-2 md:px-4 overflow-x-auto">
          {crmTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-xs md:text-sm font-medium transition-all relative whitespace-nowrap flex-shrink-0',
                'hover:text-foreground',
                activeTab === id ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
              {activeTab === id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* CRM content */}
      <div className="overflow-x-hidden">
        {activeTab === 'contacts' && <ContactsView />}
        {activeTab === 'opportunities' && <OpportunitiesView />}
        {activeTab === 'tasks' && <CrmTasksView />}
        {activeTab === 'retail' && <RetailView />}
      </div>
    </div>
  );
}
