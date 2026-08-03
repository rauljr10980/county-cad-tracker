import { useState } from 'react';
import '../theme.css';
import { CrmSidebar, type CrmSection } from './CrmSidebar';
import { DashboardPage } from '../dashboard/DashboardPage';
import { PipelinePage } from '../pipeline/PipelinePage';
import { LeadsPage } from '../leads/LeadsPage';

export function EvictionsCrmWorkspace({ onExit }: { onExit: () => void }) {
  const [section, setSection] = useState<CrmSection>('dashboard');

  return (
    <div className="urg-crm fixed inset-0 z-40 flex bg-background">
      <CrmSidebar section={section} onSectionChange={setSection} onExit={onExit} />
      <main className="flex-1 overflow-y-auto">
        {section === 'dashboard' && <DashboardPage onOpenPipeline={() => setSection('pipeline')} />}
        {section === 'pipeline' && <PipelinePage />}
        {section === 'leads' && <LeadsPage />}
      </main>
    </div>
  );
}
