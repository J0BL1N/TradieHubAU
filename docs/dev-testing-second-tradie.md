# Creating a Second Tradie Test User

To test that the `"Submit Completion"` button and completion workflow actions only appear for the correct contracted tradie (and not wrong tradies, other customers, or guests), you should create a secondary tradie account.

Because modifying auth tables directly or running seed scripts might disrupt active local database configurations, follow these simple manual steps in your local Supabase Studio:

## Step 1: Create the Auth User

1. Open your local **Supabase Studio** (usually at `http://localhost:54321` or your hosted project URL).
2. Navigate to **Authentication** → **Users** in the sidebar.
3. Click the **Add User** button and select **Create User**.
4. Enter the details:
   - Email: `tradie2@test.local`
   - Password: `Password123` (or any simple test password)
5. Select **Auto Confirm User** (so you don't need to verify via email).
6. Click **Save** to create the user. Note down the newly created user's **User ID (UUID)**.

## Step 2: Insert the Matching Public Profile Row

Supabase triggers should automatically synchronize the auth user to the `public.users` table. However, we need to ensure the profile is marked with the `tradie` role and is verified/whitelisted for testing.

1. In the Supabase Studio sidebar, go to the **SQL Editor**.
2. Run the following SQL query to update the role and verification status of the new user:

```sql
UPDATE public.users
SET 
  role = 'tradie',
  display_name = 'Second Test Tradie',
  suburb = 'North Sydney',
  state = 'NSW',
  postcode = '2060',
  tradie_verified = true,
  identity_verified = true
WHERE email = 'tradie2@test.local';
```

*(Note: If the synchronization trigger was disabled or did not run, you can manually insert the row first before updating:)*

```sql
INSERT INTO public.users (id, email, role, display_name, tradie_verified, identity_verified)
VALUES (
  'YOUR-NEW-USER-UUID-HERE',
  'tradie2@test.local',
  'tradie',
  'Second Test Tradie',
  true,
  true
)
ON CONFLICT (id) DO UPDATE 
SET 
  role = 'tradie',
  tradie_verified = true,
  identity_verified = true;
```

## Step 3: Verify the Gating Behavior

1. Log in to the frontend as the job owner customer.
2. Accept a quote from the primary tradie (e.g., `tradie1@test.local`).
3. Fund the protected payment to activate the contract.
4. Log out and log in as `tradie2@test.local`.
5. Browse to the job cards or Details modal:
   - Verify that `tradie2@test.local` does **NOT** see the `"Submit Completion"` button on the job card.
   - Verify that in the Details modal, `tradie2@test.local` does **NOT** see any customer contact details (e.g. email/phone) and instead sees only the public description/details of the job.
