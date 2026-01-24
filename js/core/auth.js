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
      duration: 2200
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
  if (window.location.pathname !== '/index.html' && window.location.pathname !== '/' && !window.location.pathname.endsWith('index.html')) {
    const homePath = window.location.pathname.includes('/pages/') ? '../index.html' : 'index.html';
    window.location.href = homePath;
  }
}

/**
 * Update UI based on auth state
 * @param {boolean} isSignedIn 
 */
/**
 * Update UI based on auth state
 * @param {boolean} isSignedIn 
 */
function updateUIForAuthState(isSignedIn) {
  const adminSlot = document.getElementById('athAdminSlot');
  const adminSlotMobile = document.getElementById('athAdminSlotMobile');
  const userSlot = document.getElementById('athUserSlot');
  const userSlotMobile = document.getElementById('athUserSlotMobile');
  
  if (!userSlot) return; // Nav not mounted yet

  const basePath = window.location.pathname.includes('/pages/') ? '../' : '';
  
  // 1. Resolve Identity
  let displayName = 'User';
  let avatarUrl = ''; // Will use fallback if empty
  
  if (isSignedIn && currentUser) {
    const profile = JSON.parse(localStorage.getItem('athCurrentUser') || '{}');
    displayName = profile.display_name || currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    avatarUrl = profile.avatar_url || currentUser.user_metadata?.avatar_url || '';
  }

  // 2. Admin Logic
  const adminAllowlist = ['jaydenln.work@gmail.com'];
  const canAccessAdmin = isSignedIn && adminAllowlist.includes(String(currentUser?.email || '').toLowerCase());
  
  if (adminSlot) {
    adminSlot.innerHTML = canAccessAdmin ? `
      <a href="${basePath}pages/admin.html" class="ath-nav-link text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all duration-200 border-b-2 border-transparent">
        <i data-feather="shield" class="w-4 h-4"></i> <span>Admin</span>
      </a>
    ` : '';
  }
  
  if (adminSlotMobile) {
    adminSlotMobile.innerHTML = canAccessAdmin ? `
      <a href="${basePath}pages/admin.html" class="block px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-700 dark:hover:text-teal-300 font-medium">Admin</a>
    ` : '';
  }

  // 3. User Controls (Desktop)
  if (isSignedIn) {
    userSlot.innerHTML = `
      <button id="athUserMenuBtn" class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition flex-shrink-0 max-w-[180px]">
        <img src="${avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0d9488&color=fff`}" class="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-600 shadow-sm" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0d9488&color=fff'">
        <span class="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">${displayName}</span>
        <i data-feather="chevron-down" class="w-4 h-4 text-gray-400"></i>
      </button>
      <div id="athUserDropdown" class="hidden absolute top-full right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-[100] py-1 overflow-hidden transition-all duration-200">
        <a href="${basePath}pages/my-profile.html" class="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-teal-900/20">
          <i data-feather="user" class="w-4 h-4"></i> My Profile
        </a>
        <div class="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
        <button id="athSignOutBtn" class="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 font-medium">
          <i data-feather="log-out" class="w-4 h-4"></i> Log Out
        </button>
      </div>
    `;
    
    // Wire up dropdown
    const btn = document.getElementById('athUserMenuBtn');
    const dropdown = document.getElementById('athUserDropdown');
    const signOutBtn = document.getElementById('athSignOutBtn');
    
    if (btn && dropdown) {
      btn.onclick = (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
      };
      
      // Close dropdown when clicking outside
      window.addEventListener('click', () => dropdown.classList.add('hidden'), { once: true });
    }
    
    if (signOutBtn) {
      signOutBtn.onclick = handleSignOutClick;
    }

  } else {
    userSlot.innerHTML = `
      <div class="flex items-center gap-2">
        <button id="athSignInBtn" class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium text-sm px-2">Log In</button>
        <button id="athSignUpBtn" class="bg-gray-900 dark:bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-gray-800 dark:hover:bg-teal-700 font-medium text-sm transition shadow-sm">Sign Up</button>
      </div>
    `;
    
    const signInBtn = document.getElementById('athSignInBtn');
    const signUpBtn = document.getElementById('athSignUpBtn');
    
    if (signInBtn) signInBtn.onclick = showSignInModal;
    if (signUpBtn) signUpBtn.onclick = showSignUpModal;
  }

  // 4. User Controls (Mobile)
  if (userSlotMobile) {
    if (isSignedIn) {
      userSlotMobile.innerHTML = `
        <div class="flex items-center gap-3 px-3 py-3 mb-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
           <img src="${avatarUrl}" class="w-10 h-10 rounded-full object-cover">
           <div class="min-w-0">
             <div class="text-sm font-bold text-gray-900 dark:text-white truncate">${displayName}</div>
             <div class="text-xs text-gray-500 truncate">${currentUser.email}</div>
           </div>
        </div>
        <a href="${basePath}pages/my-profile.html" class="block px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 font-medium">My Profile</a>
        <button id="athSignOutBtnMobile" class="w-full text-left px-3 py-2 rounded-lg text-red-600 font-medium">Log Out</button>
      `;
      const signOutBtnM = document.getElementById('athSignOutBtnMobile');
      if (signOutBtnM) signOutBtnM.onclick = handleSignOutClick;
    } else {
      userSlotMobile.innerHTML = `
        <button onclick="window.showSignInModal()" class="block w-full text-left px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 font-medium">Log In</button>
        <button onclick="window.showSignUpModal()" class="block w-full text-left px-3 py-2 mt-1 rounded-lg bg-teal-600 text-white font-medium text-center">Sign Up</button>
      `;
    }
  }

  // Auth Guards
  document.querySelectorAll('[data-auth-required]').forEach(el => {
    el.style.display = isSignedIn ? '' : 'none';
  });
  document.querySelectorAll('[data-guest-only]').forEach(el => {
    el.style.display = isSignedIn ? 'none' : '';
  });

  // Re-run feather icons for dynamic content
  if (typeof feather !== 'undefined') {
    feather.replace();
  }
}

// v0.045: Helper for SPA router to trigger UI updates
export function refreshAuthUI() {
  updateUIForAuthState(!!currentSession);
}
if (window.ATHAuth) {
  window.ATHAuth.refreshAuthUI = refreshAuthUI;
} else {
  window.ATHAuth = { refreshAuthUI };
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
  
  // Clear form fields
  const emailInput = document.getElementById('athSignInEmail');
  const passwordInput = document.getElementById('athSignInPassword');
  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';
  
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
  
  const { user, session, error } = await signInWithEmail(email, password);
  
  if (error) {
    console.error('❌ Email sign-in failed:', error.message);
    if (window.ATHToast) {
      window.ATHToast.show({
        type: 'error',
        message: error.message,
        duration: 4000
      });
    }
    // Don't close modal on error - let user try again
    return;
  }
  
  // Success - modal will auto-hide when SIGNED_IN event fires
  console.log('✅ Sign-in initiated, waiting for auth state change...');
  
  // Give Supabase a moment to fire the auth state change event
  setTimeout(() => {
    hideSignInModal();
  }, 500);
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

/**
 * Show sign-up modal
 */
function showSignUpModal() {
  hideSignInModal();
  
  if (!signUpModal) {
    createSignUpModal();
  }
  
  // Clear form fields
  const emailInput = document.getElementById('athSignUpEmail');
  const passwordInput = document.getElementById('athSignUpPassword');
  const nameInput = document.getElementById('athSignUpName');
  
  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';
  if (nameInput) nameInput.value = '';
  
  signUpModal.style.display = 'flex';
}

/**
 * Hide sign-up modal
 */
function hideSignUpModal() {
  if (signUpModal) {
    signUpModal.style.display = 'none';
  }
}

// ============================================================================
// SIGN UP MODAL
// ============================================================================

let signUpModal = null;

function createSignUpModal() {
  const modal = document.createElement('div');
  modal.id = 'athSignUpModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.style.display = 'none';
  
  modal.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Create Account</h2>
        <button onclick="window.hideSignUpModal()" class="text-gray-400 hover:text-gray-600">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      
      <!-- Email/Password Sign Up Form -->
      <form id="athEmailSignUpForm" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input type="text" id="athSignUpName" required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="John Doe">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input type="email" id="athSignUpEmail" required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="you@example.com">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input type="password" id="athSignUpPassword" required minlength="6"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="••••••••">
          <p class="text-xs text-gray-500 mt-1">Must be at least 6 characters</p>
        </div>
        
        <button type="submit" class="w-full bg-teal-600 text-white rounded-lg px-6 py-3 font-semibold hover:bg-teal-700 transition">
          Sign Up
        </button>
      </form>
      
      <p class="mt-4 text-center text-sm text-gray-600">
        Already have an account? 
        <button onclick="window.showSignInModal(); window.hideSignUpModal()" class="text-teal-600 hover:text-teal-700 font-semibold">Sign In</button>
      </p>
    </div>
  `;
  
  document.body.appendChild(modal);
  signUpModal = modal;
  
  // Add event listeners
  document.getElementById('athEmailSignUpForm').addEventListener('submit', handleEmailSignUp);
  
  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      hideSignUpModal();
    }
  });
}

/**
 * Handle email sign-up form submission
 */
async function handleEmailSignUp(e) {
  e.preventDefault();
  
  const name = document.getElementById('athSignUpName').value;
  const email = document.getElementById('athSignUpEmail').value;
  const password = document.getElementById('athSignUpPassword').value;
  
  console.log('📝 Signing up:', email);
  
  // Show loading state
  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Creating Account...';
  
  try {
    const { user, session, error } = await signUpWithEmail(email, password, {
      full_name: name
    });
    
    if (error) throw error;
    
    // Check if email confirmation is required (session might be null)
    if (user && !session) {
      if (window.ATHToast) {
        window.ATHToast.show({
          type: 'success',
          message: 'Account created! Please check your email to confirm.',
          duration: 6000
        });
      }
      alert('Account created! Please check your email to confirm your registration before logging in.');
      hideSignUpModal();
    } else {
      // Auto-login successful
      console.log('✅ Account created and signed in');
       if (window.ATHToast) {
        window.ATHToast.show({
          type: 'success',
          message: 'Account created successfully!',
          duration: 3000
        });
      }
      hideSignUpModal();
    }
    
  } catch (error) {
    console.error('❌ Sign up failed:', error.message);
    if (window.ATHToast) {
      window.ATHToast.show({
        type: 'error',
        message: error.message,
        duration: 4000
      });
    }
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// Export functions for global access
window.hideSignInModal = hideSignInModal;
window.showSignInModal = showSignInModal;
window.showSignUpModal = showSignUpModal;
window.hideSignUpModal = hideSignUpModal;

// Bridge for legacy UI guards (script.js expects window.ATHAuth)
window.ATHAuth = window.ATHAuth || {};
window.ATHAuth.getSession = function () {
  if (currentSession?.user) {
    return { userId: currentSession.user.id, email: currentSession.user.email };
  }
  try {
    const raw = localStorage.getItem('athCurrentUser');
    if (!raw) return null;
    const user = JSON.parse(raw);
    return { userId: user.id, email: user.email || user.displayName || '' };
  } catch {
    return null;
  }
};
window.ATHAuth.signOut = async function () {
  await signOut();
  return { error: null };
};
window.ATHAuth.signIn = async function (email, password) {
  return await signInWithEmail(email, password);
};
window.ATHAuth.signUp = async function (email, password) {
  return await signUpWithEmail(email, password);
};
window.ATHAuth.signInWithGoogle = async function () {
  return await signInWithGoogle();
};

// Initialize auth on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}
