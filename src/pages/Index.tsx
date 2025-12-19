import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { TabNavigation, TabType } from '@/components/layout/TabNavigation';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { PropertiesView } from '@/components/properties/PropertiesView';
import { UploadView } from '@/components/upload/UploadView';
import { ComparisonView } from '@/components/comparison/ComparisonView';
import { FileHistory } from '@/components/files/FileHistory';

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      case 'upload':
        return <UploadView />;
      case 'comparison':
        return <ComparisonView />;
      case 'files':
        return <FileHistory />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} />
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="container mx-auto animate-fade-in">
        {renderContent()}
      </main>
    </div>
  );
};

export default Index;
