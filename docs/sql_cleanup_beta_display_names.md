# SQL Cleanup — Beta Display and Business Names

This is a safe, report-only SQL cleanup script to strip beta tags and prefix/bracket artifacts from display names and business names in the live Supabase database.

> [!IMPORTANT]
> - Do NOT apply this SQL automatically.
> - Jay must review and apply this manually via the Supabase SQL Editor.

## SQL Script

```sql
-- 1. Strip starting '[BETA]' or '[BETA] ' (case-insensitive) from display_name
UPDATE public.users
SET display_name = regexp_replace(display_name, '^\[BETA\]\s*', '', 'i')
WHERE display_name ~* '^\[BETA\]';

-- 2. Strip starting '[BETA]' or '[BETA] ' (case-insensitive) from business_name
UPDATE public.users
SET business_name = regexp_replace(business_name, '^\[BETA\]\s*', '', 'i')
WHERE business_name ~* '^\[BETA\]';

-- 3. Strip starting and ending 'BETA' or bracketed variations from display_name
UPDATE public.users
SET display_name = regexp_replace(display_name, '^\[?BETA\]?[:\-\s]*', '', 'i')
WHERE display_name ~* '^\[?BETA\]?';

UPDATE public.users
SET display_name = regexp_replace(display_name, '[:\-\s]*\[?BETA\]?$', '', 'i')
WHERE display_name ~* '\[?BETA\]?$';

-- 4. Strip starting and ending 'BETA' or bracketed variations from business_name
UPDATE public.users
SET business_name = regexp_replace(business_name, '^\[?BETA\]?[:\-\s]*', '', 'i')
WHERE business_name ~* '^\[?BETA\]?';

UPDATE public.users
SET business_name = regexp_replace(business_name, '[:\-\s]*\[?BETA\]?$', '', 'i')
WHERE business_name ~* '\[?BETA\]?$';

-- 5. Strip any leftover bracket artifacts from names
UPDATE public.users
SET display_name = regexp_replace(display_name, '[\[\]]', '', 'g')
WHERE display_name ~ '[\[\]]';

UPDATE public.users
SET business_name = regexp_replace(business_name, '[\[\]]', '', 'g')
WHERE business_name ~ '[\[\]]';
```
