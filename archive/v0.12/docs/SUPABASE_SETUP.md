# 🚀 Supabase Setup Guide - TradieHub

Complete step-by-step guide to set up your Supabase backend.

---

## Step 1: Create Supabase Account

1. Visit [supabase.com](https://supabase.com)
2. Click **"Start your project"**
3. Sign up with GitHub (recommended) or email
4. Verify your email

---

## Step 2: Create New Project

1. Click **"New Project"**
2. Fill in project details:
   - **Name**: `tradiehub-dev` (or your preferred name)
   - **Database Password**: Generate a strong password (**SAVE THIS!**)
   - **Region**: Sydney (Australia East) - for lowest latency
   - **Pricing Plan**: Free (perfect for development)
3. Click **"Create new project"**
4. Wait 2-3 minutes for provisioning

---

## Step 3: Run Database Migrations

### Option A: Supabase SQL Editor (Recommended)

1. In your Supabase project dashboard, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open `supabase/migrations/001_initial_schema.sql` from your project folder
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click **"Run"** (or press `Ctrl+Enter`)
7. ✅ You should see "Success. No rows returned"

8. Repeat for `002_rls_policies.sql`:
   - Open the file
   - Copy contents
   - Paste into SQL Editor
   - Click **"Run"**
   - ✅ You should see "Success" again

### Option B: Supabase CLI (Advanced)

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Run migrations
supabase db push
```

---

## Step 4: Verify Tables Created

1. Click **"Table Editor"** in the left sidebar
2. You should see 6 tables:
   - ✅ users
   - ✅ trades
   - ✅ jobs
   - ✅ conversations
   - ✅ messages
   - ✅ reviews

3. Click on **"trades"** table
4. Verify 10 trade categories are seeded (Electrical, Plumbing, etc.)

---

## Step 5: Configure Authentication

### Enable Email Authentication

1. Click **"Authentication"** in the left sidebar
2. Click **"Providers"** tab
3. **Email** should be enabled by default
4. Configure email settings:
   - **Enable Email Confirmations**: ON (for production)
   - For development, you can disable confirmations

### Enable Google OAuth (Recommended)

1. Still in **"Providers"**, scroll to **"Google"**
2. Click **"Enable"**
3. You'll need Google OAuth credentials:

#### Get Google OAuth Credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to **"APIs & Services" → "Credentials"**
4. Click **"Create Credentials" → "OAuth 2.0 Client ID"**
5. Configure consent screen if prompted
6. Application type: **"Web application"**
7. Add authorized redirect URIs:
   ```
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```
   (Replace YOUR_PROJECT_REF with your actual Supabase project reference)
8. Copy **Client ID** and **Client Secret**
9. Paste into Supabase Google provider settings
10. Click **"Save"**

---

## Step 6: Get Your API Keys

1. Click **"Project Settings"** (gear icon) in the left sidebar
2. Click **"API"** tab
3. Copy these values (**you'll need them!**):
   - **Project URL**: `https://YOUR_PROJECT_REF.supabase.co`
   - **anon public key**: `eyJhbGci...` (long string)
   - **service_role key**: `eyJhbGci...` (keep this SECRET!)

4. Save these to a `.env.local` file in your project:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

**⚠️ IMPORTANT**:

- `.env.local` should be in `.gitignore` (never commit this file!)
- The `anon` key is safe to use in frontend code
- NEVER expose the `service_role` key in frontend code

---

## Step 7: Test Database Connection

1. In SQL Editor, run this test query:

```sql
-- Test query
SELECT * FROM trades;
```

2. You should see 10 rows with trade categories
3. ✅ Database is working!

---

## Step 8: Test Authentication (Optional)

1. Click **"Authentication"** in sidebar
2. Click **"Users"** tab
3. Click **"Add user"** (top right)
4. Create a test user:
   - Email: `test@tradiehub.com`
   - Password: `testpassword123`
   - Auto Confirm User: **ON** (for testing)
5. Click **"Create user"**
6. ✅ You should see the user in the list

---

## 🎉 Setup Complete!

Your Supabase backend is now ready!

**What you have:**

- ✅ PostgreSQL database with 6 tables
- ✅ Row-level security policies
- ✅ Authentication configured (Email + Google)
- ✅ API endpoints auto-generated
- ✅ Real-time subscriptions enabled

**Next Steps:**

1. Install Supabase client library in your project
2. Update TradieHub to use Supabase instead of localStorage
3. Test authentication flow
4. Migrate existing data

---

## Troubleshooting

### "Permission denied" errors

- Check RLS policies are enabled: `ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;`
- Verify you're authenticated when making requests

### Tables not showing up

- Re-run migration SQL in SQL Editor
- Check for syntax errors in the output

### Can't connect from frontend

- Verify VITE_SUPABASE_URL matches your project URL
- Ensure anon key is correct
- Check browser console for CORS errors

### Need Help?

- Supabase Docs: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com
