import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, MessageSquare, Briefcase, Users, User, ShieldAlert, ChevronDown, LogOut, Bell } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, getUnreadNotificationCount } from '../lib/notifications';
import type { NotificationRecord } from '../lib/notifications';
import { supabase } from '../lib/supabase';

export default function Layout() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMessagesPage = location.pathname === '/messages';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false);
      }
      if (bellRef.current && !bellRef.current.contains(target)) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Notifications live subscription
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    let active = true;

    const loadNotificationsData = async () => {
      const { data } = await fetchNotifications(15);
      const count = await getUnreadNotificationCount();
      if (active) {
        setNotifications(data || []);
        setUnreadCount(count.data || 0);
      }
    };

    loadNotificationsData();

    const channel = supabase
      .channel(`user-notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const newNotification = payload.new as NotificationRecord;
          if (active) {
            setNotifications(current => {
              if (current.some(n => n.id === newNotification.id)) return current;
              return [newNotification, ...current].slice(0, 15);
            });
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const updatedNotification = payload.new as NotificationRecord;
          if (active) {
            setNotifications(current =>
              current.map(n => n.id === updatedNotification.id ? updatedNotification : n)
            );
            const count = await getUnreadNotificationCount();
            if (active) {
              setUnreadCount(count.data || 0);
            }
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const handleNotificationClick = async (notif: NotificationRecord) => {
    setBellOpen(false);
    if (!notif.read_at) {
      await markNotificationRead(notif.id);
      setNotifications(current =>
        current.map(n => n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }

    if (notif.conversation_id) {
      navigate(`/messages?conversation=${notif.conversation_id}`);
    } else if (notif.job_id) {
      navigate(`/jobs?jobId=${notif.job_id}`);
    } else if (notif.event_type.startsWith('verification')) {
      navigate('/profile');
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications(current =>
      current.map(n => ({ ...n, read_at: new Date().toISOString() }))
    );
    setUnreadCount(0);
  };

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
    <div className={`flex flex-col bg-background text-foreground ${isMessagesPage ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      {/* Sticky Header with Glassmorphism */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[72px] flex items-center justify-between gap-3">
          
          {/* Logo & Middle Menu Section */}
          <div className="flex min-w-0 items-center gap-3 md:gap-4 lg:gap-6 xl:gap-8">
            <Link to="/" className="nav-logo shrink-0" aria-label="TradieHubAU home">
              <img src="/assets/tradiehubau-logo-nav-clean.png" alt="TradieHubAU" className="nav-logo-img" />
            </Link>

            {/* Desktop Middle Navigation */}
            <nav className="hidden md:flex items-center gap-1 lg:gap-2 xl:gap-3">
              <NavLink
                to="/jobs"
                className={({ isActive }) =>
                  `inline-flex min-h-11 lg:min-h-12 items-center gap-1.5 lg:gap-2 rounded-xl px-2 lg:px-3 text-sm xl:text-[15px] font-bold transition-colors hover:bg-muted/40 hover:text-primary whitespace-nowrap ${
                    isActive ? 'text-primary bg-primary/5' : 'text-foreground/75'
                  }`
                }
              >
                <Briefcase className="h-4 w-4" />
                Browse Jobs
              </NavLink>
              
              <NavLink
                to="/browse-tradies"
                className={({ isActive }) =>
                  `inline-flex min-h-11 lg:min-h-12 items-center gap-1.5 lg:gap-2 rounded-xl px-2 lg:px-3 text-sm xl:text-[15px] font-bold transition-colors hover:bg-muted/40 hover:text-primary whitespace-nowrap ${
                    isActive ? 'text-primary bg-primary/5' : 'text-foreground/75'
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
                    `inline-flex min-h-11 lg:min-h-12 items-center gap-1.5 lg:gap-2 rounded-xl px-2 lg:px-3 text-sm xl:text-[15px] font-bold transition-colors hover:bg-muted/40 hover:text-primary whitespace-nowrap ${
                      isActive ? 'text-primary bg-primary/5' : 'text-foreground/75'
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
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <NavLink
              to="/how-it-works"
              className={({ isActive }) =>
                `hidden xl:inline-flex min-h-12 items-center rounded-xl px-3 text-[15px] font-bold transition-colors hover:bg-muted/40 hover:text-primary whitespace-nowrap ${
                  isActive ? 'text-primary bg-primary/5' : 'text-foreground/75'
                }`
              }
            >
              How It Works
            </NavLink>
            
            {/* Primary Action Button */}
            <Link
              to="/post-job"
              className="inline-flex min-h-11 lg:min-h-12 items-center justify-center bg-primary hover:bg-primary/95 text-primary-foreground text-xs sm:text-sm font-bold px-3 lg:px-4 xl:px-5 rounded-xl transition-all shadow-md active:scale-95 whitespace-nowrap"
            >
              <span className="sm:hidden">Post Job</span>
              <span className="hidden sm:inline">Post a Job</span>
            </Link>

            {/* Notification Bell */}
            {user && (
              <div className="relative" ref={bellRef}>
                <button
                  type="button"
                  onClick={() => setBellOpen(!bellOpen)}
                  className="relative p-2.5 rounded-xl text-foreground/75 hover:bg-muted/40 hover:text-foreground transition-all focus:outline-none flex items-center justify-center min-h-11 min-w-11"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black text-primary-foreground">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {bellOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-border bg-card shadow-xl py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="flex items-center justify-between px-4 pb-2 border-b">
                      <span className="font-extrabold text-sm text-foreground">Notifications</span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllRead}
                          className="text-[11px] font-bold text-primary hover:underline"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    <div className="max-h-80 overflow-y-auto mt-2 divide-y divide-border/60">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-xs font-semibold text-muted-foreground">
                          No notifications yet
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <button
                            type="button"
                            key={notif.id}
                            onClick={() => void handleNotificationClick(notif)}
                            className={`w-full text-left px-4 py-3 flex items-start gap-2.5 hover:bg-muted/30 transition-colors ${
                              !notif.read_at ? 'bg-primary/[0.02]' : ''
                            }`}
                          >
                            <div className="flex-grow min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className={`text-xs truncate ${!notif.read_at ? 'font-black text-foreground' : 'font-bold text-foreground/80'}`}>
                                  {notif.title}
                                </span>
                                {!notif.read_at && (
                                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                )}
                              </div>
                              <p className={`text-xs mt-0.5 line-clamp-2 ${!notif.read_at ? 'font-bold text-muted-foreground/90' : 'font-medium text-muted-foreground'}`}>
                                {notif.body}
                              </p>
                              <span className="text-[10px] font-medium text-muted-foreground/60 mt-1 block">
                                {new Date(notif.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} at {new Date(notif.created_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                              </span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* User Account / Authentication Buttons */}
            {user ? (
              <div className="relative hidden xl:block" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex min-h-12 items-center gap-2 rounded-xl px-2 text-sm font-bold text-foreground/75 hover:bg-muted/40 hover:text-foreground transition-all focus:outline-none"
                >
                  <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-sm border border-primary/20 shadow-sm overflow-hidden">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (profile?.display_name || user.email || 'U').charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="hidden xl:inline-block max-w-[120px] truncate">
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
              <div className="hidden xl:flex items-center gap-2">
                <Link
                  to="/login"
                  className="inline-flex min-h-12 items-center rounded-xl px-3 text-sm font-bold text-foreground/75 hover:bg-muted/40 hover:text-foreground transition-all"
                >
                  Sign In
                </Link>
                <Link
                  to="/login"
                  className="inline-flex min-h-12 items-center justify-center border hover:bg-muted text-foreground text-sm font-bold px-4 rounded-xl transition-all"
                >
                  Join
                </Link>
              </div>
            )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => {
                setDropdownOpen(false);
                setMobileMenuOpen(!mobileMenuOpen);
              }}
              className="xl:hidden inline-flex h-12 w-12 items-center justify-center text-muted-foreground hover:text-foreground outline-none rounded-xl hover:bg-muted focus:bg-muted"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 xl:hidden bg-background/95 backdrop-blur-md pt-24 px-6 space-y-4 flex flex-col items-center overflow-y-auto">
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground rounded-lg"
          >
            <X className="h-6 w-6" />
          </button>
          
          <div className="w-full max-w-sm flex flex-col gap-3">
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
              to="/how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 bg-card border rounded-xl hover:border-primary/40 text-base font-bold text-foreground transition-all"
            >
              How It Works
            </Link>

            <Link
              to="/post-job"
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex sm:hidden w-full items-center justify-center bg-primary hover:bg-primary/95 text-primary-foreground font-bold py-3.5 rounded-xl shadow-lg mt-2"
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
      <main className={isMessagesPage
        ? "flex-grow w-full flex flex-col min-h-0"
        : "flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12"}>
        <Outlet />
      </main>

      {/* Footer */}
      {!isMessagesPage && (
        <footer className="border-t bg-card py-8 text-center text-sm text-muted-foreground font-medium">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>© {new Date().getFullYear()} TradieHubAU. All rights reserved.</p>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:justify-end">
              <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
              <Link to="/support" className="hover:text-primary transition-colors">Contact Support</Link>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
