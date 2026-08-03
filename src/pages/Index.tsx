import { useState, useEffect, useRef } from 'react';
import { Header } from '@/components/layout/Header';
import { TabNavigation, TabType } from '@/components/layout/TabNavigation';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { PropertiesView } from '@/components/properties/PropertiesView';
import { TasksView } from '@/components/tasks/TasksView';
import { UploadView } from '@/components/upload/UploadView';
import { FileHistory } from '@/components/files/FileHistory';
import { PreForeclosureView } from '@/components/preforeclosure/PreForeclosureView';
import { ForeclosureView } from '@/components/foreclosure/ForeclosureView';
import { CrmView } from '@/components/crm/CrmView';
import { DrivingView } from '@/components/driving/DrivingView';
import { CalendarView } from '@/components/calendar/CalendarView';
import EvictionLeadsView from '@/crm/views/EvictionLeadsView';
import { useAuth } from '@/contexts/AuthContext';
import { LoginModal } from '@/components/auth/LoginModal';
import { SignupModal } from '@/components/auth/SignupModal';
import { Building2, LogIn, UserPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PhoneSearchModal } from '@/components/phone/PhoneSearchModal';
import { PropertyDetailsModal } from '@/components/properties/PropertyDetailsModal';
import { Property } from '@/types/property';
import { EvictionsCrmWorkspace } from '@/crm-evictions/shell/EvictionsCrmWorkspace';
import { PasswordGateDialog } from '@/crm-evictions/auth/PasswordGateDialog';
import { useCrmGrant } from '@/crm-evictions/auth/useCrmGrant';

// Get initial tab from URL hash, default to dashboard
const getInitialTab = (): TabType => {
  const hash = window.location.hash.slice(1); // Remove the #
  const validTabs: TabType[] = ['dashboard', 'calendar', 'properties', 'tasks', 'upload', 'files', 'preforeclosure', 'foreclosure', 'crm', 'driving', 'evictions'];
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
  const [isCrmOpen, setIsCrmOpen] = useState(() => window.location.hash.slice(1) === 'evictions-crm');
  const [isGateOpen, setIsGateOpen] = useState(false);
  const { hasGrant, grant } = useCrmGrant();
  // Set by onGranted just before it closes the dialog, so the onOpenChange
  // handler below can tell "closed because granted" apart from "dismissed" —
  // component state (isCrmOpen/hasGrant) hasn't re-rendered yet at that point,
  // so it can't be used to distinguish the two.
  const justGrantedRef = useRef(false);

  // The workspace only ever renders when both are true; gate every hash/UI
  // decision on that, not on isCrmOpen alone, so a stale isCrmOpen with no
  // grant (e.g. a bookmark or a refresh inside the workspace) can't freeze
  // hash syncing or strand the user on a route that renders nothing.
  const isCrmVisible = isCrmOpen && hasGrant;

  const openEvictionsCrm = () => {
    if (hasGrant) { setIsCrmOpen(true); window.location.hash = 'evictions-crm'; }
    else setIsGateOpen(true);
  };

  // Route back to the (already-valid) 'evictions' tab through activeTab rather
  // than writing the hash directly — the tab-to-hash effect below is the only
  // hash writer for real tabs, so this avoids a two-writer race against it.
  const exitEvictionsCrm = () => { setIsCrmOpen(false); setActiveTab('evictions'); };

  // If the page loads (or is refreshed) with #evictions-crm in the address bar
  // but no live grant, prompt for the password instead of silently dropping
  // the user on the dashboard with a dead URL. Gated on isAuthenticated so this
  // can't arm the dialog while logged out — it would otherwise sit primed and
  // pop open, unexplained, the instant login completes (the dialog only
  // renders in the authenticated branch below). Re-runs when isAuthenticated
  // flips to true so a hash present before auth resolves still gets picked up.
  useEffect(() => {
    if (isAuthenticated && isCrmOpen && !hasGrant) {
      setIsGateOpen(true);
    }
    // isCrmOpen/hasGrant intentionally excluded: this should reflect state at
    // load/auth-resolution time, not become a live subscription that reopens
    // the dialog after the user closes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Update URL hash when tab changes. This is the single writer for
  // activeTab-driven hash values; the CRM routes ('evictions-crm') are
  // written directly at their call sites and never flow through activeTab.
  useEffect(() => {
    if (isCrmVisible) return;
    window.location.hash = activeTab;
  }, [activeTab, isCrmVisible]);

  // Listen for hash changes (e.g., browser back/forward). Ignore the CRM hash
  // here: entering the workspace (openEvictionsCrm / onGranted) writes
  // '#evictions-crm' directly, which fires this same listener. getInitialTab()
  // doesn't recognize that hash and would fall back to 'dashboard', clobbering
  // whatever tab the user was actually on. Reading window.location.hash
  // directly (rather than closing over isCrmVisible) matters because this
  // effect has an empty dependency array and would otherwise capture a stale
  // value.
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash.slice(1) === 'evictions-crm') return;
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
      case 'foreclosure':
        return <ForeclosureView />;
      case 'crm':
        return <CrmView />;
      case 'driving':
        return <DrivingView />;
      case 'evictions':
        return <EvictionLeadsView />;
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
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} onTabChange={setActiveTab} onOpenEvictionsCrm={openEvictionsCrm} />
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="container mx-auto animate-fade-in overflow-x-hidden">
        {renderContent()}
      </main>
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
      <PasswordGateDialog
        open={isGateOpen}
        onOpenChange={(open) => {
          setIsGateOpen(open);
          if (open) return;
          if (justGrantedRef.current) {
            justGrantedRef.current = false;
            return;
          }
          // Dismissed without granting. If this dialog was covering a stale
          // #evictions-crm route (mount/refresh case), don't strand the user
          // there. Just flip isCrmOpen off — isCrmVisible drops to false and
          // the tab-to-hash effect (the single hash writer) takes it from
          // there, syncing the hash back to the already-valid activeTab.
          // This only works because isCrmVisible was already false (and the
          // tab-to-hash effect had already overwritten '#evictions-crm' with
          // activeTab's hash) back at mount, before the gate ever opened —
          // setIsCrmOpen(false) here is a no-op for that effect's dependency
          // and doesn't itself trigger a hash rewrite. A future fix for the
          // address-bar flicker that defers that initial rewrite until the
          // gate resolves must make dismissal correct the hash itself.
          if (isCrmOpen && !hasGrant) {
            setIsCrmOpen(false);
          }
        }}
        onGranted={() => {
          justGrantedRef.current = true;
          grant();
          setIsCrmOpen(true);
          window.location.hash = 'evictions-crm';
        }}
      />
    </div>
  );
};

export default Index;
