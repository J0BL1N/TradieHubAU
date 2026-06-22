-- Seed data for TradieHub local development
--
-- NOTE: After running `npx supabase db reset`, the seed user password must be reset
-- via the Supabase admin API or Studio. See: docs/local-dev-auth.md

-- 1. Create a seed customer in auth.users
--    Password must be set separately after db reset (see docs/local-dev-auth.md)
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  role,
  aud,
  confirmation_token
)
VALUES (
  '9a0c69db-8dfc-40fe-a90e-b14bbff2998e',
  'seed.customer@tradiehub.au',
  crypt('SecurePassword123!', gen_salt('bf', 12)),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Sarah Mitchell"}',
  now(),
  now(),
  'authenticated',
  'authenticated',
  ''
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data;


-- 2. Create corresponding public user profile
INSERT INTO public.users (
  id,
  email,
  role,
  display_name,
  suburb,
  state,
  postcode,
  verified,
  show_location,
  address_rule
)
VALUES (
  '9a0c69db-8dfc-40fe-a90e-b14bbff2998e',
  'seed.customer@tradiehub.au',
  'dual',
  'Sarah Mitchell',
  'Bondi',
  'NSW',
  '2026',
  true,
  true,
  'afterAccepted'
) ON CONFLICT (id) DO NOTHING;

-- 3. Insert mock jobs
INSERT INTO public.jobs (
  customer_id,
  title,
  description,
  categories,
  location,
  state,
  budget_min,
  budget_max,
  timeline,
  urgency,
  type,
  status,
  created_at
)
VALUES
  (
    '9a0c69db-8dfc-40fe-a90e-b14bbff2998e',
    'Bathroom Renovation',
    'Full bathroom remodel including tiling, plumbing, and electrical work. Need completion within 2–3 weeks.',
    ARRAY['plumbing', 'electrical', 'tiling'],
    'Sydney, NSW',
    'NSW',
    8000,
    12000,
    '2–3 weeks',
    'urgent',
    'contract',
    'open',
    now() - INTERVAL '2 hours'
  ),
  (
    '9a0c69db-8dfc-40fe-a90e-b14bbff2998e',
    'Office Electrical Upgrade',
    'Commercial electrical work for 10 office units. LED lighting installation and power point upgrades. Specs available.',
    ARRAY['electrical'],
    'Melbourne, VIC',
    'VIC',
    15000,
    25000,
    'Flexible',
    'week',
    'contract',
    'open',
    now() - INTERVAL '1 day'
  ),
  (
    '9a0c69db-8dfc-40fe-a90e-b14bbff2998e',
    'Deck Construction (6x4m)',
    'Build a 6x4m timber deck with stairs and railing. Materials provided by customer. Start in 3–4 weeks.',
    ARRAY['carpentry'],
    'Brisbane, QLD',
    'QLD',
    3500,
    5000,
    '2 weeks',
    'flexible',
    'one-off',
    'open',
    now() - INTERVAL '2 days'
  ),
  (
    '9a0c69db-8dfc-40fe-a90e-b14bbff2998e',
    'Interior repaint (3 bedrooms)',
    'Prep + paint 3 bedrooms. Walls + trims. Customer to supply paint if recommended. Prefer tidy & quick turnaround.',
    ARRAY['painting'],
    'Perth, WA',
    'WA',
    900,
    1800,
    '3–5 days',
    'week',
    'one-off',
    'open',
    now() - INTERVAL '3 days'
  ),
  (
    '9a0c69db-8dfc-40fe-a90e-b14bbff2998e',
    'Garden cleanup before inspection',
    'Mow, edge, weed, green waste removal. Need done this weekend before property inspection.',
    ARRAY['gardening'],
    'Adelaide, SA',
    'SA',
    250,
    450,
    '1 day',
    'urgent',
    'one-off',
    'open',
    now() - INTERVAL '1 hour'
  ),
  (
    '9a0c69db-8dfc-40fe-a90e-b14bbff2998e',
    'Hot water system replacement',
    'Existing unit failing. Need supply + install of suitable replacement, and disposal of old unit.',
    ARRAY['plumbing'],
    'Pakenham, VIC',
    'VIC',
    1200,
    2500,
    '1–2 days',
    'urgent',
    'one-off',
    'open',
    now() - INTERVAL '5 hours'
  ),
  (
    '9a0c69db-8dfc-40fe-a90e-b14bbff2998e',
    'Ongoing lawn maintenance (fortnightly)',
    'Small front + backyard. Fortnightly mow/edge and seasonal tidy-ups.',
    ARRAY['gardening'],
    'Melbourne, VIC',
    'VIC',
    80,
    140,
    'Ongoing',
    'flexible',
    'ongoing',
    'open',
    now() - INTERVAL '4 days'
  ),
  (
    '9a0c69db-8dfc-40fe-a90e-b14bbff2998e',
    'Bond clean (2 bed unit)',
    'End-of-lease clean. Kitchen, bathroom, floors, windows. Must be completed by Friday.',
    ARRAY['cleaning'],
    'Sydney, NSW',
    'NSW',
    300,
    550,
    '1 day',
    'week',
    'one-off',
    'open',
    now() - INTERVAL '5 days'
  ),
  (
    '9a0c69db-8dfc-40fe-a90e-b14bbff2998e',
    'Fix doors + replace handles',
    '3 internal doors sticking. Replace 2 handles and align hinges. Quick handyman job.',
    ARRAY['handyman'],
    'Brisbane, QLD',
    'QLD',
    180,
    350,
    'Half day',
    'flexible',
    'one-off',
    'open',
    now() - INTERVAL '6 days'
  ),
  (
    '9a0c69db-8dfc-40fe-a90e-b14bbff2998e',
    'Switchboard safety check',
    'Need a licensed electrician to inspect switchboard, test RCDs, and provide compliance note.',
    ARRAY['electrical'],
    'Adelaide, SA',
    'SA',
    220,
    420,
    '1–2 hours',
    'week',
    'one-off',
    'open',
    now() - INTERVAL '7 days'
  ),
  (
    '9a0c69db-8dfc-40fe-a90e-b14bbff2998e',
    'Replace side fence (approx. 18m)',
    'Old timber fence needs replacement. Prefer treated pine. Please include removal of old fence and materials.',
    ARRAY['carpentry', 'building'],
    'Perth, WA',
    'WA',
    4000,
    6500,
    '1 week',
    'flexible',
    'contract',
    'open',
    now() - INTERVAL '8 days'
  ),
  (
    '9a0c69db-8dfc-40fe-a90e-b14bbff2998e',
    'Kitchen tap leaking',
    'Tap is dripping constantly. Might need new mixer. Accessible under-sink plumbing.',
    ARRAY['plumbing'],
    'Melbourne, VIC',
    'VIC',
    150,
    380,
    '1–2 hours',
    'urgent',
    'one-off',
    'open',
    now() - INTERVAL '3 hours'
  )
ON CONFLICT DO NOTHING;
