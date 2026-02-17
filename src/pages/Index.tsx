import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { TabNavigation, TabType } from '@/components/layout/TabNavigation';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { PropertiesView } from '@/components/properties/PropertiesView';
import { TasksView } from '@/components/tasks/TasksView';
import { UploadView } from '@/components/upload/UploadView';
import { FileHistory } from '@/components/files/FileHistory';
import { PreForeclosureView } from '@/components/preforeclosure/PreForeclosureView';
import { DrivingView } from '@/components/driving/DrivingView';
import { useAuth } from '@/contexts/AuthContext';
import { LoginModal } from '@/components/auth/LoginModal';
import { SignupModal } from '@/components/auth/SignupModal';
import { Building2, LogIn, UserPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Get initial tab from URL hash, default to dashboard
const getInitialTab = (): TabType => {
  const hash = window.location.hash.slice(1); // Remove the #
  const validTabs: TabType[] = ['dashboard', 'properties', 'tasks', 'upload', 'files', 'preforeclosure', 'driving'];
  return validTabs.includes(hash as TabType) ? (hash as TabType) : 'dashboard';
};

const Index = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSignupOpen, setIsSignupOpen] = useState(false);

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
      case 'driving':
        return <DrivingView />;
      default:
        return <Dashboard />;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="space-y-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Real Estate Acquisitions
            </h1>
            <p className="text-muted-foreground">
              Bexar County Tax Delinquent Manager
            </p>
          </div>
          <div className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={() => setIsLoginOpen(true)}
            >
              <LogIn className="h-4 w-4 mr-2" />
              Login
            </Button>
            <Button
              variant="outline"
              className="w-full"
              size="lg"
              onClick={() => setIsSignupOpen(true)}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Create Account
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            An invite code is required to create an account.
          </p>
        </div>
        <LoginModal
          isOpen={isLoginOpen}
          onClose={() => setIsLoginOpen(false)}
          onSwitchToSignup={() => {
            setIsLoginOpen(false);
            setIsSignupOpen(true);
          }}
        />
        <SignupModal
          isOpen={isSignupOpen}
          onClose={() => setIsSignupOpen(false)}
          onSwitchToLogin={() => {
            setIsSignupOpen(false);
            setIsLoginOpen(true);
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} onTabChange={setActiveTab} />
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="container mx-auto animate-fade-in overflow-x-hidden">
        {renderContent()}
      </main>
    </div>
  );
};

export default Index;
