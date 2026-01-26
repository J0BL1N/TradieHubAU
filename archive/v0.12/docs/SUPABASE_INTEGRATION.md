# Supabase Integration - Quick Start Guide

## 🎯 What We Built

✅ **Database**: PostgreSQL with 6 tables (users, jobs, conversations, messages, reviews, trades)  
✅ **Security**: Row-Level Security policies protecting all data  
✅ **Client Library**: Installed `@supabase/supabase-js`  
✅ **Wrapper**: Created `supabase-client.js` with helper functions

---

## 📁 File Structure

```
TradieHubAU/
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql    ✅ Database tables
│       └── 002_rls_policies.sql      ✅ Security policies
├── supabase-client.js                ✅ NEW - Client wrapper
├── .env.local                        ✅ API keys (gitignored)
└── package.json                      ✅ Updated with @supabase
```

---

## 🔧 Using Supabase in Your Code

### Import the Client

```javascript
import {
  supabase,
  signInWithEmail,
  signInWithGoogle,
  getCurrentUser,
} from "./supabase-client.js";
```

### Authentication Examples

```javascript
// Sign in with email
const { user, session, error } = await signInWithEmail(
  "user@example.com",
  "password",
);

// Sign in with Google (redirects to Google)
await signInWithGoogle();

// Get current user
const { user } = await getCurrentUser();

// Sign out
await signOut();

// Listen to auth changes
onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN") console.log("User signed in!", session.user);
  if (event === "SIGNED_OUT") console.log("User signed out");
});
```

### Database Examples

```javascript
// Get user profile
const { profile } = await getUserProfile(userId);

// Update profile
await updateUserProfile(userId, {
  display_name: "New Name",
  suburb: "Pakenham",
  state: "VIC",
});

// Get all jobs
const { jobs } = await getJobs();

// Get filtered jobs
const { jobs } = await getJobs({
  state: "VIC",
  categories: ["plumbing", "electrical"],
  urgency: "urgent",
});

// Get trades
const { trades } = await getTrades();
```

### Real-time Messages

```javascript
// Subscribe to new messages
const subscription = subscribeToMessages(conversationId, (newMessage) => {
  console.log("New message received!", newMessage);
  // Update UI with new message
});

// Unsubscribe when done
subscription.unsubscribe();
```

---

## 🚀 Next Steps

### 1. Replace Fake Google Sign-In

**Current code** (index.html):

```javascript
function signInWithGoogle() {
  localStorage.setItem("athAuthProvider", "google");
  // Fake sign-in
}
```

**New code** (use Supabase):

```javascript
import { signInWithGoogle } from "./supabase-client.js";

async function signInWithGoogle() {
  await signInWithGoogle(); // Real OAuth redirect
}
```

### 2. Sync User Profile

After Supabase auth succeeds, create/update user in database:

```javascript
import {
  getCurrentUser,
  getUserProfile,
  createUserProfile,
} from "./supabase-client.js";

onAuthStateChange(async (event, session) => {
  if (event === "SIGNED_IN") {
    const userId = session.user.id;

    // Check if profile exists
    let { profile } = await getUserProfile(userId);

    if (!profile) {
      // Create profile for new user
      await createUserProfile({
        id: userId,
        email: session.user.email,
        display_name: session.user.user_metadata.full_name || "User",
        role: "customer", // or from onboarding
        avatar_url: session.user.user_metadata.avatar_url,
      });
    }
  }
});
```

### 3. Replace localStorage Jobs

**Before**:

```javascript
const jobs = window.JOBS; // Static array
```

**After**:

```javascript
import { getJobs } from "./supabase-client.js";

const { jobs } = await getJobs(); // Real database query
```

---

## 🧪 Testing

### Test Authentication

1. Open `index.html`
2. Click "Sign in with Google"
3. Complete OAuth flow
4. Check browser console for logs
5. Verify session in Supabase dashboard

### Test Database Queries

```javascript
// In browser console
import { getTrades } from "./supabase-client.js";
const { trades } = await getTrades();
console.log(trades); // Should show 10 trade categories
```

---

## 🔒 Security Notes

- ✅ API keys in `.env.local` (gitignored)
- ✅ Row-Level Security enabled on all tables
- ✅ Users can only see/edit their own data
- ✅ Public can view open jobs (not personal data)

---

## 📚 Supabase Docs

- [Authentication](https://supabase.com/docs/guides/auth)
- [Database](https://supabase.com/docs/guides/database)
- [Real-time](https://supabase.com/docs/guides/realtime)
- [Storage](https://supabase.com/docs/guides/storage)

---

## ✅ Ready to Integrate!

You now have everything needed to replace localStorage with Supabase:

1. Database ✅
2. Authentication ✅
3. Helper functions ✅
4. Security ✅

Next: Replace fake auth with real Supabase auth flow!
