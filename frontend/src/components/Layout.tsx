import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Menu, X, MessageSquare, Briefcase, Users, User, ShieldAlert, ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from './AuthProvider';

export default function Layout() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      setDropdownOpen(false);
      setMobileMenuOpen(false);
      navigate('/login', { replace: true });
    } catch (error: any) {
      console.error('Sign out failed:', error?.message || error);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Sticky Header with Glassmorphism */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo & Middle Menu Section */}
          <div className="flex items-center gap-8">
            <Link to="/" className="nav-logo" aria-label="TradieHubAU home">
              <img src="/assets/tradiehubau-logo-nav-clean.png" alt="TradieHubAU" className="nav-logo-img" />
            </Link>

            {/* Desktop Middle Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              <NavLink
                to="/how-it-works"
                className={({ isActive }) =>
                  `text-sm font-semibold hover:text-primary transition-colors flex items-center gap-1.5 ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`
                }
              >
                How It Works
              </NavLink>

              <NavLink
                to="/jobs"
                className={({ isActive }) =>
                  `text-sm font-semibold hover:text-primary transition-colors flex items-center gap-1.5 ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`
                }
              >
                <Briefcase className="h-4 w-4" />
                Browse Jobs
              </NavLink>
              
              <NavLink
                to="/browse-tradies"
                className={({ isActive }) =>
                  `text-sm font-semibold hover:text-primary transition-colors flex items-center gap-1.5 ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`
                }
              >
                <Users className="h-4 w-4" />
                Browse Tradies
              </NavLink>

              {user && (
                <NavLink
                  to="/messages"
                  className={({ isActive }) =>
                    `text-sm font-semibold hover:text-primary transition-colors flex items-center gap-1.5 ${
                      isActive ? 'text-primary' : 'text-muted-foreground'
                    }`
                  }
                >
                  <MessageSquare className="h-4 w-4" />
                  Messages
                </NavLink>
              )}
            </nav>
          </div>

          {/* Right Action & Account Area */}
          <div className="flex items-center gap-4">
            
            {/* Primary Action Button */}
            <Link
              to="/post-job"
              className="hidden sm:inline-flex items-center justify-center bg-primary hover:bg-primary/95 text-primary-foreground text-sm font-bold h-10 px-5 rounded-xl transition-all shadow-md active:scale-95"
            >
              Post a Job
            </Link>

            {/* User Account / Authentication Buttons */}
            {user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-all focus:outline-none"
                >
                  <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-sm border border-primary/20 shadow-sm overflow-hidden">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (profile?.display_name || user.email || 'U').charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="hidden lg:inline-block max-w-[120px] truncate">
                    {profile?.display_name || user.email?.split('@')[0]}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Account Dropdown Overlay */}
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-border bg-card shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-4 py-2 text-left">
                      <p className="font-extrabold text-foreground truncate text-sm">
                        {profile?.display_name || 'User'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate font-medium mt-0.5">
                        {user.email}
                      </p>
                    </div>
                    
                    <hr className="my-1.5 border-border" />

                    <div className="space-y-0.5">
                      <Link
                        to="/profile"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                      >
                        <User className="h-4 w-4 text-primary" />
                        My Profile
                      </Link>

                      {profile?.is_admin && (
                        <Link
                          to="/admin"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                        >
                          <ShieldAlert className="h-4 w-4 text-red-500" />
                          Admin Dashboard
                        </Link>
                      )}
                    </div>

                    <hr className="my-1.5 border-border" />

                    <button
                      onClick={() => void handleSignOut()}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-500 hover:bg-red-500/5 transition-colors text-left"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="text-sm font-bold text-muted-foreground hover:text-foreground px-3 py-2 transition-all"
                >
                  Sign In
                </Link>
                <Link
                  to="/login"
                  className="hidden sm:inline-flex items-center justify-center border hover:bg-muted text-foreground text-sm font-bold h-9 px-4 rounded-xl transition-all"
                >
                  Join
                </Link>
              </div>
            )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-muted-foreground hover:text-foreground outline-none rounded-lg focus:bg-muted"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden bg-background/95 backdrop-blur-md pt-20 px-6 space-y-4 flex flex-col items-center">
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground rounded-lg"
          >
            <X className="h-6 w-6" />
          </button>
          
          <div className="w-full max-w-sm flex flex-col gap-3">
            <Link
              to="/how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 bg-card border rounded-xl hover:border-primary/40 text-base font-bold text-foreground transition-all"
            >
              How It Works
            </Link>

            <Link
              to="/jobs"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 bg-card border rounded-xl hover:border-primary/40 text-base font-bold text-foreground transition-all"
            >
              <Briefcase className="h-5 w-5 text-primary" />
              Browse Jobs
            </Link>

            <Link
              to="/browse-tradies"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 bg-card border rounded-xl hover:border-primary/40 text-base font-bold text-foreground transition-all"
            >
              <Users className="h-5 w-5 text-primary" />
              Browse Tradies
            </Link>

            {user && (
              <Link
                to="/messages"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 bg-card border rounded-xl hover:border-primary/40 text-base font-bold text-foreground transition-all"
              >
                <MessageSquare className="h-5 w-5 text-primary" />
                Messages
              </Link>
            )}

            <Link
              to="/post-job"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full inline-flex items-center justify-center bg-primary hover:bg-primary/95 text-primary-foreground font-bold py-3.5 rounded-xl shadow-lg mt-4"
            >
              Post a Job
            </Link>

            {user ? (
              <div className="mt-4 border-t pt-4 space-y-3 w-full">
                <div className="flex items-center gap-3 px-4 py-2">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-base border overflow-hidden">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (profile?.display_name || user.email || 'U').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-foreground">{profile?.display_name || user.email?.split('@')[0]}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>

                <Link
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full border text-foreground font-bold py-3.5 rounded-xl hover:bg-muted transition-all"
                >
                  <User className="h-4.5 w-4.5 text-primary" />
                  My Profile
                </Link>

                {profile?.is_admin && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-2 w-full border text-red-500 border-red-500/20 bg-red-500/5 font-bold py-3.5 rounded-xl hover:bg-red-500/10 transition-all"
                  >
                    <ShieldAlert className="h-4.5 w-4.5 text-red-500" />
                    Admin Dashboard
                  </Link>
                )}

                <button
                  onClick={() => void handleSignOut()}
                  className="w-full inline-flex items-center justify-center border border-border bg-muted/40 text-muted-foreground font-bold py-3.5 rounded-xl hover:bg-muted transition-all"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="mt-4 border-t pt-4 grid grid-cols-2 gap-3 w-full">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex items-center justify-center border hover:bg-muted text-foreground font-bold py-3 rounded-xl"
                >
                  Sign In
                </Link>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex items-center justify-center bg-primary hover:bg-primary/95 text-primary-foreground font-bold py-3 rounded-xl shadow-md"
                >
                  Join
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t bg-card py-8 text-center text-sm text-muted-foreground font-medium">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} TradieHubAU. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:justify-end">
            <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-primary transition-colors">Terms of Service</a>
            <Link to="/how-it-works" className="hover:text-primary transition-colors">How It Works</Link>
            <Link to="/protected-payments" className="hover:text-primary transition-colors">Protected Payments</Link>
            <Link to="/trust-and-safety" className="hover:text-primary transition-colors">Trust &amp; Safety</Link>
            <Link to="/support" className="hover:text-primary transition-colors">Contact Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
