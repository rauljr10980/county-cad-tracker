import { Building2, RefreshCw, Settings, LogIn, LogOut, User, Menu, X, Upload, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { LoginModal } from '@/components/auth/LoginModal';
import { SignupModal } from '@/components/auth/SignupModal';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onTabChange?: (tab: 'upload' | 'files') => void;
}

export function Header({ onRefresh, isRefreshing, onTabChange }: HeaderProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSignupOpen, setIsSignupOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      setIsMobileMenuOpen(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <>
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            <div className="p-2 rounded-lg bg-primary/10 glow-primary flex-shrink-0">
              <Building2 className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm md:text-lg font-semibold tracking-tight truncate">
                Real Estate Acquisitions
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block truncate">
                Bexar County Tax Delinquent Manager
              </p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {isAuthenticated ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                      <User className="h-4 w-4 mr-2" />
                      {user?.username}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium">{user?.username}</p>
                        {user?.email && (
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        )}
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {onTabChange && (
                      <>
                        <DropdownMenuItem onClick={() => onTabChange('upload')}>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onTabChange('files')}>
                          <FileText className="h-4 w-4 mr-2" />
                          Files
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                  <Settings className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <LogIn className="h-4 w-4 mr-2" />
                    Login
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onTabChange && (
                    <>
                      <DropdownMenuItem onClick={() => onTabChange('upload')}>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onTabChange('files')}>
                        <FileText className="h-4 w-4 mr-2" />
                        Files
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={() => setIsLoginOpen(true)}>
                    <LogIn className="h-4 w-4 mr-2" />
                    Login
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="text-muted-foreground hover:text-foreground mobile-touch-target"
            >
              <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground mobile-touch-target"
                >
                  {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] sm:w-[320px]">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-4 mt-6">
                  {isAuthenticated ? (
                    <>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                        <User className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{user?.username}</p>
                          {user?.email && (
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          )}
                        </div>
                      </div>
                      {onTabChange && (
                        <>
                          <Button
                            variant="ghost"
                            className="justify-start mobile-touch-target"
                            onClick={() => {
                              setIsMobileMenuOpen(false);
                              onTabChange('upload');
                            }}
                          >
                            <Upload className="h-5 w-5 mr-3" />
                            Upload
                          </Button>
                          <Button
                            variant="ghost"
                            className="justify-start mobile-touch-target"
                            onClick={() => {
                              setIsMobileMenuOpen(false);
                              onTabChange('files');
                            }}
                          >
                            <FileText className="h-5 w-5 mr-3" />
                            Files
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        className="justify-start mobile-touch-target"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <Settings className="h-5 w-5 mr-3" />
                        Settings
                      </Button>
                      <Button
                        variant="ghost"
                        className="justify-start text-destructive hover:text-destructive hover:bg-destructive/10 mobile-touch-target"
                        onClick={handleLogout}
                      >
                        <LogOut className="h-5 w-5 mr-3" />
                        Logout
                      </Button>
                    </>
                  ) : (
                    <>
                      {onTabChange && (
                        <>
                          <Button
                            variant="ghost"
                            className="justify-start mobile-touch-target"
                            onClick={() => {
                              setIsMobileMenuOpen(false);
                              onTabChange('upload');
                            }}
                          >
                            <Upload className="h-5 w-5 mr-3" />
                            Upload
                          </Button>
                          <Button
                            variant="ghost"
                            className="justify-start mobile-touch-target"
                            onClick={() => {
                              setIsMobileMenuOpen(false);
                              onTabChange('files');
                            }}
                          >
                            <FileText className="h-5 w-5 mr-3" />
                            Files
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        className="justify-start mobile-touch-target"
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          setIsLoginOpen(true);
                        }}
                      >
                        <LogIn className="h-5 w-5 mr-3" />
                        Login
                      </Button>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
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
    </>
  );
}
