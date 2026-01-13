import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { TabNavigation, TabType } from '@/components/layout/TabNavigation';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { PropertiesView } from '@/components/properties/PropertiesView';
import { TasksView } from '@/components/tasks/TasksView';
import { UploadView } from '@/components/upload/UploadView';
import { FileHistory } from '@/components/files/FileHistory';
import { PreForeclosureView } from '@/components/preforeclosure/PreForeclosureView';

// Get initial tab from URL hash, default to dashboard
const getInitialTab = (): TabType => {
  const hash = window.location.hash.slice(1); // Remove the #
  const validTabs: TabType[] = ['dashboard', 'properties', 'tasks', 'upload', 'files', 'preforeclosure'];
  return validTabs.includes(hash as TabType) ? (hash as TabType) : 'dashboard';
};

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Update URL hash when tab changes
  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  // Listen for hash changes (e.g., browser back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      const newTab = getInitialTab();
      setActiveTab(newTab);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulate refresh
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsRefreshing(false);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onFilterChange={() => setActiveTab('properties')} />;
      case 'properties':
        return <PropertiesView />;
      case 'tasks':
        return <TasksView />;
      case 'upload':
        return <UploadView />;
      case 'files':
        return <FileHistory />;
      case 'preforeclosure':
        return <PreForeclosureView />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} />
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="container mx-auto animate-fade-in overflow-x-hidden">
        {renderContent()}
      </main>
    </div>
  );
};

export default Index;
