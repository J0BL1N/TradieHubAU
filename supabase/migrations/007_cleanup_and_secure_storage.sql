-- Migration: 007_cleanup_and_secure_storage.sql
-- Description: Cleans up obsolete unified verification RPC to enforce strict separation.

-- 1. Drop the legacy approve_verification function if it exists to prevent bypasses
DROP FUNCTION IF EXISTS approve_verification(uuid);
DROP FUNCTION IF EXISTS public.approve_verification(uuid);
