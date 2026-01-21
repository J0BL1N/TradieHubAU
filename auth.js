/**
 * auth.js - Real Supabase Authentication
 * Replaces localStorage-based fake auth with real Supabase OAuth
 */

// Import Supabase client (assumes supabase-client.js is loaded first)
import { supabase, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut, getCurrentUser, onAuthStateChange, createUserProfile, getUserProfile } from './supabase-client.js';

// ============================================================================
// AUTH STATE MANAGEMENT
// ============================================================================

let currentUser = null;
let currentSession = null;

/**
 * Initialize authentication
 * Call this on page load
 */
export async function initAuth() {
  console.log('🔐 Initializing authentication...');
  
  // Listen for auth state changes
  onAuthStateChange(async (event, session) => {
    console.log(`🔄 Auth event: ${event}`);
    
    if (event === 'SIGNED_IN') {
      currentSession = session;
      currentUser = session.user;
      await handleSignInSuccess(session);
    } else if (event === 'SIGNED_OUT') {
      currentSession = null;
      currentUser = null;
      handleSignOut();
    } else if (event === 'TOKEN_REFRESHED') {
      currentSession = session;
      console.log('✅ Token refreshed');
    }
  });
  
  // Check for existing session
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentSession = session;
    currentUser = session.user;
    console.log('✅ User already signed in:', currentUser.email);
    await syncUserProfile(currentUser);
    updateUIForAuthState(true);
  } else {
    console.log('ℹ️ No active session');
    updateUIForAuthState(false);
  }
}

/**
 * Handle successful sign-in
 * @param {object} session - Supabase session
 */
async function handleSignInSuccess(session) {
  console.log('✅ Sign in successful:', session.user.email);
  
  // Sync user profile with database
  await syncUserProfile(session.user);
  
  // Update UI
  updateUIForAuthState(true);
  
  // Show success toast if ATHToast is available
  if (window.ATHToast) {
    window.ATHToast.show({
      type: 'success',
      message: `Welcome back, ${session.user.email}!`,
      duration: 3000
    });
  }
}

/**
 * Sync user profile between Supabase Auth and Database
 * @param {object} authUser - Supabase auth user object
 */
async function syncUserProfile(authUser) {
  // Check if profile exists
  const { profile, error } = await getUserProfile(authUser.id);
  
  if (error || !profile) {
    console.log('📝 Creating user profile in database...');
    
    // Create profile from auth metadata
    const newProfile = {
      id: authUser.id,
      email: authUser.email,
      display_name: authUser.user_metadata?.full_name || authUser.email.split('@')[0],
      role: 'customer', // Default role, can be updated in onboarding
      avatar_url: authUser.user_metadata?.avatar_url || null,
      created_at: new Date().toISOString()
    };
    
    await createUserProfile(newProfile);
    console.log('✅ Profile created');
  } else {
    console.log('✅ Profile exists:', profile.display_name);
  }
  
  // Sync to localStorage for backward compatibility with existing code
  const profileData = profile || {
    id: authUser.id,
    email: authUser.email,
    displayName: authUser.user_metadata?.full_name || authUser.email.split('@')[0],
    role: 'customer'
  };
  
  localStorage.setItem('athCurrentUser', JSON.stringify(profileData));
  localStorage.setItem('athAuthProvider', authUser.app_metadata?.provider || 'email');
}

/**
 * Handle sign out
 */
function handleSignOut() {
  console.log('👋 Signed out');
  
  // Clear localStorage
  localStorage.removeItem('athCurrentUser');
  localStorage.removeItem('athAuthProvider');
  
  // Update UI
  updateUIForAuthState(false);
  
  // Show toast
  if (window.ATHToast) {
    window.ATHToast.show({
      type: 'info',
      message: 'Signed out successfully',
      duration: 2000
    });
  }
  
  // Redirect to home
  if (window.location.pathname !== '/index.html' && window.location.pathname !== '/') {
    window.location.href = 'index.html';
  }
}

/**
 * Update UI based on auth state
 * @param {boolean} isSignedIn 
 */
function updateUIForAuthState(isSignedIn) {
  // Update nav buttons
  const authNavBtn = document.getElementById('athAuthNavBtn');
  if (authNavBtn) {
    if (isSignedIn) {
      authNavBtn.textContent = `Logout (${currentUser?.email || ''})`;
      authNavBtn.onclick = handleSignOutClick;
    } else {
      authNavBtn.textContent = 'Sign In';
      authNavBtn.onclick = showSignInModal;
    }
  }
  
  // Show/hide protected content
  document.querySelectorAll('[data-auth-required]').forEach(el => {
    el.style.display = isSignedIn ? '' : 'none';
  });
  
  document.querySelectorAll('[data-guest-only]').forEach(el => {
    el.style.display = isSignedIn ? 'none' : '';
  });
}

// ============================================================================
// SIGN IN MODAL
// ============================================================================

let signInModal = null;

/**
 * Show sign-in modal
 */
function showSignInModal() {
  if (!signInModal) {
    createSignInModal();
  }
  signInModal.style.display = 'flex';
}

/**
 * Hide sign-in modal
 */
function hideSignInModal() {
  if (signInModal) {
    signInModal.style.display = 'none';
  }
}

/**
 * Create sign-in modal HTML
 */
function createSignInModal() {
  const modal = document.createElement('div');
  modal.id = 'athSignInModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.style.display = 'none';
  
  modal.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Sign In</h2>
        <button onclick="window.hideSignInModal()" class="text-gray-400 hover:text-gray-600">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      
      <!-- Google Sign In -->
      <button id="athGoogleSignInBtn" class="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-300 rounded-lg px-6 py-3 hover:bg-gray-50 transition mb-4">
        <svg class="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        <span class="font-semibold text-gray-700">Continue with Google</span>
      </button>
      
      <div class="relative mb-4">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-gray-300"></div>
        </div>
        <div class="relative flex justify-center text-sm">
          <span class="px-2 bg-white text-gray-500">Or sign in with email</span>
        </div>
      </div>
      
      <!-- Email/Password Sign In Form -->
      <form id="athEmailSignInForm" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input type="email" id="athSignInEmail" required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="you@example.com">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input type="password" id="athSignInPassword" required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="••••••••">
        </div>
        <button type="submit" class="w-full bg-teal-600 text-white rounded-lg px-6 py-3 font-semibold hover:bg-teal-700 transition">
          Sign In
        </button>
      </form>
      
      <p class="mt-4 text-center text-sm text-gray-600">
        Don't have an account? 
        <button onclick="window.showSignUpModal()" class="text-teal-600 hover:text-teal-700 font-semibold">Sign Up</button>
      </p>
    </div>
  `;
  
  document.body.appendChild(modal);
  signInModal = modal;
  
  // Add event listeners
  document.getElementById('athGoogleSignInBtn').addEventListener('click', handleGoogleSignIn);
  document.getElementById('athEmailSignInForm').addEventListener('submit', handleEmailSignIn);
  
  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      hideSignInModal();
    }
  });
}

// ============================================================================
// AUTH ACTIONS
// ============================================================================

/**
 * Handle Google sign-in click
 */
async function handleGoogleSignIn() {
  console.log('🔐 Initiating Google sign-in...');
  
  const { error } = await signInWithGoogle();
  
  if (error) {
    console.error('❌ Google sign-in failed:', error.message);
    if (window.ATHToast) {
      window.ATHToast.show({
        type: 'error',
        message: 'Google sign-in failed. Please try again.',
        duration: 4000
      });
    }
  }
  // OAuth will redirect, no need to close modal
}

/**
 * Handle email sign-in form submission
 */
async function handleEmailSignIn(e) {
  e.preventDefault();
  
  const email = document.getElementById('athSignInEmail').value;
  const password = document.getElementById('athSignInPassword').value;
  
  console.log('🔐 Signing in with email:', email);
  
  const { user, error } = await signInWithEmail(email, password);
  
  if (error) {
    console.error('❌ Email sign-in failed:', error.message);
    if (window.ATHToast) {
      window.ATHToast.show({
        type: 'error',
        message: error.message,
        duration: 4000
      });
    }
  } else {
    hideSignInModal();
  }
}

/**
 * Handle sign-out click
 */
async function handleSignOutClick() {
  console.log('👋 Signing out...');
  
  const { error } = await signOut();
  
  if (error) {
    console.error('❌ Sign out failed:', error.message);
  }
}

// ============================================================================
// SIGN UP MODAL (for completeness)
// ============================================================================

function showSignUpModal() {
  hideSignInModal();
  // TODO: Implement sign-up modal
  alert('Sign up coming soon! For now, please contact admin to create an account.');
}

// Export functions for global access
window.hideSignInModal = hideSignInModal;
window.showSignInModal = showSignInModal;
window.showSignUpModal = showSignUpModal;

// Initialize auth on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}
