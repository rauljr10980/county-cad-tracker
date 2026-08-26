import { useState } from 'react';
import { CrmSidebar, type CrmSection } from './CrmSidebar';
import { DashboardPage } from '../dashboard/DashboardPage';
import { PipelinePage } from '../pipeline/PipelinePage';
import { LeadsPage } from '../leads/LeadsPage';
import { MapPage } from '../map/MapPage';
import type { QueueId } from '../pipeline/queues';

export function EvictionsCrmWorkspace({ onExit }: { onExit: () => void }) {
  const [section, setSection] = useState<CrmSection>('dashboard');
  // The Dashboard's stage bars have no stage to hand the Pipeline (it has no
  // stage control), so the best they can do is land on `all` rather than
  // whatever queue the Pipeline would otherwise default to. Direct sidebar
  // navigation keeps defaulting to `needsContact`.
  const [pipelineInitialQueue, setPipelineInitialQueue] = useState<QueueId>('needsContact');

  const openSection = (s: CrmSection) => {
    if (s === 'pipeline') setPipelineInitialQueue('needsContact');
    setSection(s);
  };

  const openPipelineFromDashboard = () => {
    setPipelineInitialQueue('all');
    setSection('pipeline');
  };

  return (
    <div className="fixed inset-0 z-40 flex bg-background">
      <CrmSidebar section={section} onSectionChange={openSection} onExit={onExit} />
      <main className="flex-1 overflow-y-auto">
        {section === 'dashboard' && <DashboardPage onOpenPipeline={openPipelineFromDashboard} />}
        {section === 'pipeline' && <PipelinePage initialQueue={pipelineInitialQueue} />}
        {section === 'leads' && <LeadsPage />}
        {section === 'map' && <MapPage />}
      </main>
    </div>
  );
}
