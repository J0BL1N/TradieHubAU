/**
 * Supabase Client - TradieHub
 * 
 * Centralized Supabase client instance and helper functions
 * for authentication, database queries, and storage.
 */

// Import Supabase client
// Using CDN for browser compatibility without bundler
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Safe environment variable access
const getEnv = (key) => {
  try {
    return import.meta.env?.[key];
  } catch (e) {
    return undefined;
  }
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL') || 'https://sbnthkwhygrrjjdyylgd.supabase.co';
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNibnRoa3doeWdycmpqZHl5bGdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMDM5NDYsImV4cCI6MjA4NDU3OTk0Nn0.bNzKm4Npa9DL8kIxesqtcavB2Z0CNUJgY1aDbgKGSbY';

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

// ============================================================================
// AUTHENTICATION HELPERS
// ============================================================================

/**
 * Sign in with email and password
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<{user, session, error}>}
 */
export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) {
    console.error('❌ Sign in error:', error.message);
    return { user: null, session: null, error };
  }
  
  console.log('✅ Signed in:', data.user.email);
  return { user: data.user, session: data.session, error: null };
}

/**
 * Sign up with email and password
 * @param {string} email 
 * @param {string} password 
 * @param {object} metadata - Additional user metadata (displayName, role, etc.)
 * @returns {Promise<{user, session, error}>}
 */
export async function signUpWithEmail(email, password, metadata = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata // Will be stored in auth.users.raw_user_meta_data
    }
  });
  
  if (error) {
    console.error('❌ Sign up error:', error.message);
    return { user: null, session: null, error };
  }
  
  console.log('✅ Signed up:', data.user.email);
  return { user: data.user, session: data.session, error: null };
}

/**
 * Sign in with Google OAuth
 * @returns {Promise<{error}>}
 */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
  
  if (error) {
    console.error('❌ Google sign in error:', error.message);
    return { error };
  }
  
  return { error: null };
}

/**
 * Sign out current user
 * @returns {Promise<{error}>}
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    console.error('❌ Sign out error:', error.message);
    return { error };
  }
  
  console.log('✅ Signed out');
  return { error: null };
}

/**
 * Get current user session
 * @returns {Promise<{session, error}>}
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  
  if (error) {
    console.error('❌ Get session error:', error.message);
    return { session: null, error };
  }
  
  return { session: data.session, error: null };
}

/**
 * Get current user
 * @returns {Promise<{user, error}>}
 */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  
  if (error) {
    console.error('❌ Get user error:', error.message);
    return { user: null, error };
  }
  
  return { user: data.user, error: null };
}

/**
 * Listen to auth state changes
 * @param {function} callback - Called when auth state changes
 * @returns {object} Subscription object with unsubscribe method
 */
export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    console.log('🔄 Auth state changed:', event, session?.user?.email);
    callback(event, session);
  });
  
  return subscription;
}

// ============================================================================
// DATABASE HELPERS
// ============================================================================

/**
 * Get user profile from database
 * @param {string} userId - UUID of user
 * @returns {Promise<{profile, error}>}
 */
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) {
    console.error('❌ Get profile error:', error.message);
    return { profile: null, error };
  }
  
  return { profile: data, error: null };
}

/**
 * Update user profile
 * @param {string} userId 
 * @param {object} updates - Profile fields to update
 * @returns {Promise<{profile, error}>}
 */
export async function updateUserProfile(userId, updates) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  
  if (error) {
    console.error('❌ Update profile error:', error.message);
    return { profile: null, error };
  }
  
  console.log('✅ Profile updated');
  return { profile: data, error: null };
}

/**
 * Create user profile (called after signup)
 * @param {object} profileData 
 * @returns {Promise<{profile, error}>}
 */
export async function createUserProfile(profileData) {
  const { data, error } = await supabase
    .from('users')
    .insert([profileData])
    .select()
    .single();
  
  if (error) {
    console.error('❌ Create profile error:', error.message);
    return { profile: null, error };
  }
  
  console.log('✅ Profile created');
  return { profile: data, error: null };
}

/**
 * Get all open jobs
 * @param {object} filters - Optional filters (state, categories, urgency)
 * @returns {Promise<{jobs, error}>}
 */
export async function getJobs(filters = {}) {
  let query = supabase
    .from('jobs')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  
  // Apply filters
  if (filters.state) {
    query = query.eq('state', filters.state);
  }
  
  if (filters.categories && filters.categories.length > 0) {
    query = query.contains('categories', filters.categories);
  }
  
  if (filters.urgency) {
    query = query.eq('urgency', filters.urgency);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('❌ Get jobs error:', error.message);
    return { jobs: [], error };
  }
  
  return { jobs: data, error: null };
}

/**
 * Get trade categories
 * @returns {Promise<{trades, error}>}
 */
export async function getTrades() {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .order('label');
  
  if (error) {
    console.error('❌ Get trades error:', error.message);
    return { trades: [], error };
  }
  
  return { trades: data, error: null };
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

/**
 * Upload avatar image
 * @param {string} userId 
 * @param {File} file 
 * @returns {Promise<{url, error}>}
 */
export async function uploadAvatar(userId, file) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}-${Date.now()}.${fileExt}`;
  const filePath = `avatars/${fileName}`;
  
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, {
      upsert: true
    });
  
  if (uploadError) {
    console.error('❌ Upload avatar error:', uploadError.message);
    return { url: null, error: uploadError };
  }
  
  // Get public URL
  const { data } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath);
  
  console.log('✅ Avatar uploaded');
  return { url: data.publicUrl, error: null };
}

// ============================================================================
// REAL-TIME SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to new messages in a conversation
 * @param {string} conversationId 
 * @param {function} callback 
 * @returns {object} Subscription object
 */
export function subscribeToMessages(conversationId, callback) {
  const subscription = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      },
      (payload) => {
        console.log('📨 New message:', payload.new);
        callback(payload.new);
      }
    )
    .subscribe();
  
  return subscription;
}

// Export supabase client as default
export default supabase;
