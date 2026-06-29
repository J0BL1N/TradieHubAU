import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  email: string;
  role: 'customer' | 'tradie' | 'dual';
  display_name: string;
  avatar_url: string | null;
  phone: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  trades: string[] | null;
  abn: string | null;
  license_number: string | null;
  verified: boolean;
  identity_verified: boolean;
  tradie_verified: boolean;
  show_location: boolean;
  address_rule: 'never' | 'afterAccepted' | 'afterJobStarts';
  is_admin: boolean;
  business_name: string | null;
  bio: string | null;
  years_experience: number | null;
  service_areas: string[] | null;
  website_url: string | null;
  application_restricted_until?: string | null;
  quote_restricted_until?: string | null;
  account_review_hold_until?: string | null;
  enforcement_status?: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfileState: (updates: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const authenticatedUserIdRef = useRef<string | null>(null);
  const profileUserIdRef = useRef<string | null>(null);
  const profileSyncRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);

  const fetchAndSyncProfile = async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null);
      profileUserIdRef.current = null;
      return;
    }

    try {
      // 1. Fetch profile from database
      const { data: existingProfile, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching profile:', fetchError.message);
        return;
      }

      if (existingProfile) {
        if (authenticatedUserIdRef.current === currentUser.id) {
          setProfile(existingProfile as UserProfile);
          profileUserIdRef.current = currentUser.id;
        }
      } else {
        // 2. If it does not exist, insert minimal profile row (bypassing verified/is_admin overrides)
        const defaultDisplayName = currentUser.user_metadata?.display_name || (currentUser.email ? currentUser.email.split('@')[0] : 'User');
        const newProfile = {
          id: currentUser.id,
          email: currentUser.email || '',
          role: 'customer',
          display_name: defaultDisplayName
        };

        const { data: insertedProfile, error: insertError } = await supabase
          .from('users')
          .insert(newProfile)
          .select('*')
          .maybeSingle();

        if (insertError) {
          console.error('Error creating public profile:', insertError.message);
        } else if (insertedProfile) {
          if (authenticatedUserIdRef.current === currentUser.id) {
            setProfile(insertedProfile as UserProfile);
            profileUserIdRef.current = currentUser.id;
          }
        } else {
          if (authenticatedUserIdRef.current === currentUser.id) {
            setProfile(newProfile as unknown as UserProfile);
            profileUserIdRef.current = currentUser.id;
          }
        }
      }
    } catch (e: any) {
      console.error('Profile synchronization error:', e.message);
    }
  };

  const syncProfile = (currentUser: User) => {
    if (profileSyncRef.current?.userId === currentUser.id) {
      return profileSyncRef.current.promise;
    }

    const promise = fetchAndSyncProfile(currentUser).finally(() => {
      if (profileSyncRef.current?.promise === promise) {
        profileSyncRef.current = null;
      }
    });
    profileSyncRef.current = { userId: currentUser.id, promise };
    return promise;
  };

  useEffect(() => {
    let disposed = false;

    const clearAuthState = () => {
      setSession(null);
      setUser(null);
      setProfile(null);
      authenticatedUserIdRef.current = null;
      profileUserIdRef.current = null;
      profileSyncRef.current = null;
    };

    const handleAuthSession = async (event: AuthChangeEvent | 'INITIAL_SESSION', currentSession: Session | null) => {
      if (disposed) return;

      setSession(currentSession);
      const currentUser = currentSession?.user ?? null;
      const previousUserId = authenticatedUserIdRef.current;
      const currentUserId = currentUser?.id ?? null;
      const identityChanged = previousUserId !== currentUserId;

      authenticatedUserIdRef.current = currentUserId;
      setUser(previousUser => previousUser?.id === currentUserId ? previousUser : currentUser);

      if (identityChanged) {
        setProfile(null);
        profileUserIdRef.current = null;
      }

      if (event === 'SIGNED_OUT' || !currentUser) {
        setProfile(null);
        profileUserIdRef.current = null;
        profileSyncRef.current = null;
        setLoading(false);
        return;
      }

      const profileMissing = profileUserIdRef.current !== currentUser.id;
      const shouldSyncProfile =
        event === 'INITIAL_SESSION' ||
        identityChanged ||
        event === 'USER_UPDATED' ||
        (event === 'SIGNED_IN' && profileMissing);

      if (shouldSyncProfile) {
        const syncAlreadyRunning = profileSyncRef.current?.userId === currentUser.id;
        if (!syncAlreadyRunning) setLoading(true);

        try {
          await syncProfile(currentUser);
        } finally {
          if (!disposed) {
            setLoading(false);
          }
        }
      } else {
        setLoading(false);
      }
    };

    // Get initial session
    supabase.auth.getSession()
      .then(({ data: { session: initialSession } }) => {
        void handleAuthSession('INITIAL_SESSION', initialSession);
      })
      .catch((error) => {
        console.error('Error loading Supabase session:', error.message);
        if (!disposed) {
          clearAuthState();
          setLoading(false);
        }
      });

    // Listen for auth changes. Supabase recommends not awaiting Supabase calls
    // inside this callback, so profile sync is deferred outside the callback.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        setTimeout(() => {
          void handleAuthSession(event, currentSession);
        }, 0);
      }
    );

    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Error signing out:', error.message);
      setLoading(false);
      throw error;
    }

    setSession(null);
    setUser(null);
    setProfile(null);
    authenticatedUserIdRef.current = null;
    profileUserIdRef.current = null;
    profileSyncRef.current = null;
    setLoading(false);
  };

  const refreshProfile = async () => {
    if (user) {
      await syncProfile(user);
    }
  };

  const updateProfileState = (updates: Partial<UserProfile>) => {
    setProfile(current => current ? { ...current, ...updates } : current);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut, refreshProfile, updateProfileState }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
