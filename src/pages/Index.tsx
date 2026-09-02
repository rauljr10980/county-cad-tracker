import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { TabType } from '@/components/layout/navItems';
import { NavRail } from '@/components/layout/NavRail';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { PropertiesView } from '@/components/properties/PropertiesView';
import { TasksView } from '@/components/tasks/TasksView';
import { UploadView } from '@/components/upload/UploadView';
import { FileHistory } from '@/components/files/FileHistory';
import { PreForeclosureView } from '@/components/preforeclosure/PreForeclosureView';
import { CrmView } from '@/components/crm/CrmView';
import { DrivingView } from '@/components/driving/DrivingView';
import { CalendarView } from '@/components/calendar/CalendarView';
import EvictionLeadsView from '@/crm/views/EvictionLeadsView';
import MlsLeadsView from '@/components/mls/MlsLeadsView';
import InboxView from '@/components/inbox/InboxView';
import { useAuth } from '@/contexts/AuthContext';
import { LoginModal } from '@/components/auth/LoginModal';
import { SignupModal } from '@/components/auth/SignupModal';
import { Building2, LogIn, UserPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PhoneSearchModal } from '@/components/phone/PhoneSearchModal';
import { PropertyDetailsModal } from '@/components/properties/PropertyDetailsModal';
import { Property } from '@/types/property';
import { EvictionsCrmWorkspace } from '@/crm-evictions/shell/EvictionsCrmWorkspace';

// Get initial tab from URL hash, default to dashboard
const getInitialTab = (): TabType => {
  const hash = window.location.hash.slice(1); // Remove the #
  const validTabs: TabType[] = ['dashboard', 'calendar', 'properties', 'tasks', 'upload', 'files', 'preforeclosure', 'crm', 'driving', 'evictions', 'mls', 'inbox'];
  return validTabs.includes(hash as TabType) ? (hash as TabType) : 'dashboard';
};

const Index = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSignupOpen, setIsSignupOpen] = useState(false);
  const [isPhoneSearchOpen, setIsPhoneSearchOpen] = useState(false);
  const [phoneSearchResult, setPhoneSearchResult] = useState<Property | null>(null);
  // The Evictions CRM workspace is reached only by the '#evictions-crm' hash —
  // there is no menu entry and no password gate. It renders whenever that hash
  // is present and the user is authenticated like any other route.
  const [isCrmVisible, setIsCrmVisible] = useState(() => window.location.hash.slice(1) === 'evictions-crm');

  // Route back to the (already-valid) 'evictions' tab through activeTab rather
  // than writing the hash directly — the tab-to-hash effect below is the only
  // hash writer for real tabs, so this avoids a two-writer race against it.
  const exitEvictionsCrm = () => { setIsCrmVisible(false); setActiveTab('evictions'); };

  // Update URL hash when tab changes. This is the single writer for
  // activeTab-driven hash values; the CRM routes ('evictions-crm') are
  // written directly at their call sites and never flow through activeTab.
  useEffect(() => {
    if (isCrmVisible) return;
    window.location.hash = activeTab;
  }, [activeTab, isCrmVisible]);

  // Listen for hash changes (e.g., browser back/forward). '#evictions-crm' is
  // the only entry point to the workspace, so it is handled here rather than
  // routed through activeTab — getInitialTab() doesn't recognize that hash and
  // would fall back to 'dashboard'. Reading window.location.hash directly
  // (rather than closing over isCrmVisible) matters because this effect has an
  // empty dependency array and would otherwise capture a stale value.
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash.slice(1) === 'evictions-crm') {
        setIsCrmVisible(true);
        return;
      }
      setIsCrmVisible(false);
      setActiveTab(getInitialTab());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Global Shift+P → phone search. Skipped while the CRM workspace is visible:
  // PhoneSearchModal only renders in the main return below, so arming it here
  // would leave isPhoneSearchOpen true and spring the modal open later, the
  // moment the user exits back to the platform.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCrmVisible) return;
      if (e.shiftKey && e.key === 'P' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setIsPhoneSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCrmVisible]);

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
      case 'calendar':
        return <CalendarView />;
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
      case 'crm':
        return <CrmView />;
      case 'driving':
        return <DrivingView />;
      case 'evictions':
        return <EvictionLeadsView />;
      case 'mls':
        return <MlsLeadsView />;
      case 'inbox':
        return <InboxView />;
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

  if (isCrmVisible) {
    return <EvictionsCrmWorkspace onExit={exitEvictionsCrm} />;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <NavRail activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} onTabChange={setActiveTab} />
        <div className="flex-1 overflow-y-auto">
          <main className="container mx-auto animate-fade-in overflow-x-hidden">
            {renderContent()}
          </main>
        </div>
      </div>
      <PhoneSearchModal
        isOpen={isPhoneSearchOpen}
        onClose={() => setIsPhoneSearchOpen(false)}
        onSelectProperty={(p) => {
          setPhoneSearchResult(p);
          setIsPhoneSearchOpen(false);
        }}
      />
      <PropertyDetailsModal
        property={phoneSearchResult}
        isOpen={!!phoneSearchResult}
        onClose={() => setPhoneSearchResult(null)}
      />
    </div>
  );
};

export default Index;
