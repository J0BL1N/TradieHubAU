import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
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
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAndSyncProfile = async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null);
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
        setProfile(existingProfile as UserProfile);
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
          setProfile(insertedProfile as UserProfile);
        } else {
          setProfile(newProfile as unknown as UserProfile);
        }
      }
    } catch (e: any) {
      console.error('Profile synchronization error:', e.message);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      const currentUser = initialSession?.user ?? null;
      setUser(currentUser);
      
      if (currentUser) {
        fetchAndSyncProfile(currentUser).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        const currentUser = currentSession?.user ?? null;
        setUser(currentUser);

        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          setLoading(true);
          await fetchAndSyncProfile(currentUser);
          setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setLoading(false);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchAndSyncProfile(user);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut, refreshProfile }}>
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
