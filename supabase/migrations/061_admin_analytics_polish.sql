-- Migration: 061_admin_analytics_polish.sql
-- Description: Extend get_admin_analytics RPC to support live activity counters, user/job status/verification breakdowns, and job category statistics.

DROP FUNCTION IF EXISTS public.get_admin_analytics(text);

CREATE OR REPLACE FUNCTION public.get_admin_analytics(p_time_window text DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result jsonb;
  
  -- Marketplace Snapshot
  v_users_total bigint;
  v_customers_total bigint;
  v_tradies_total bigint;
  v_tradies_verified bigint;
  v_verifications_pending bigint;
  v_verifications_pending_cases bigint;
  v_portfolio_count bigint;
  v_reviews_count bigint;
  v_avg_rating numeric;
  
  -- Live Now
  v_active_5m bigint;
  v_active_30m bigint;
  
  -- Marketplace Activity Today
  v_new_users_today bigint;
  v_jobs_posted_today bigint;
  v_quotes_submitted_today bigint;
  v_messages_sent_today bigint;
  v_reviews_submitted_today bigint;
  
  -- User Type Breakdown (Cumulative)
  v_users_customer bigint;
  v_users_tradie bigint;
  v_users_dual bigint;
  v_users_admin bigint;
  
  -- Job Status Breakdown (Filtered by window)
  v_jobs_open bigint;
  v_jobs_accepted bigint;
  v_jobs_funded bigint;
  v_jobs_review bigint;
  v_jobs_completed bigint;
  v_jobs_disputed bigint;
  
  -- Verification Breakdown (Cumulative)
  v_verif_verified bigint;
  v_verif_pending bigint;
  v_verif_unverified bigint;
  
  -- Job Funnel
  v_jobs_posted bigint;
  v_applications_submitted bigint;
  v_quotes_accepted bigint;
  v_contracts_active bigint;
  v_completions_submitted bigint;
  v_completed_released bigint;
  v_disputed bigint;
  
  -- Beta Activity Indicators
  v_new_users bigint;
  v_new_jobs bigint;
  v_new_messages bigint;
  v_new_reviews bigint;
  
  -- Category Data (Filtered by window)
  v_categories_json jsonb;
  
  v_start_time timestamptz;
BEGIN
  -- 1. Authorization check
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  -- 2. Define start time threshold for time windows
  IF p_time_window = '7days' THEN
    v_start_time := now() - interval '7 days';
  ELSIF p_time_window = '30days' THEN
    v_start_time := now() - interval '30 days';
  ELSE
    v_start_time := '-infinity'::timestamptz;
  END IF;

  -- 3. Marketplace Snapshot (Cumulative)
  SELECT count(1) INTO v_users_total FROM public.users;
  SELECT count(1) INTO v_customers_total FROM public.users WHERE role IN ('customer', 'dual');
  SELECT count(1) INTO v_tradies_total FROM public.users WHERE role IN ('tradie', 'dual');
  SELECT count(1) INTO v_tradies_verified FROM public.users WHERE tradie_verified = true;
  SELECT count(1) INTO v_verifications_pending FROM public.verifications WHERE status = 'pending';
  SELECT count(DISTINCT user_id) INTO v_verifications_pending_cases FROM public.verifications WHERE status = 'pending';
  SELECT count(1) INTO v_portfolio_count FROM public.job_completion_proofs WHERE is_public_portfolio = true;
  SELECT count(1), COALESCE(avg(rating), 0) INTO v_reviews_count, v_avg_rating FROM public.reviews;

  -- 4. Live Now Counters (Active users in last 5m / 30m)
  SELECT count(1) INTO v_active_5m FROM public.users WHERE last_seen_at >= now() - interval '5 minutes';
  SELECT count(1) INTO v_active_30m FROM public.users WHERE last_seen_at >= now() - interval '30 minutes';

  -- 5. Today's Marketplace Activity (UTC / server midnight base)
  SELECT count(1) INTO v_new_users_today FROM public.users WHERE created_at >= date_trunc('day', now());
  SELECT count(1) INTO v_jobs_posted_today FROM public.jobs WHERE created_at >= date_trunc('day', now());
  SELECT count(1) INTO v_quotes_submitted_today FROM public.applications WHERE created_at >= date_trunc('day', now());
  SELECT count(1) INTO v_messages_sent_today FROM public.messages WHERE created_at >= date_trunc('day', now());
  SELECT count(1) INTO v_reviews_submitted_today FROM public.reviews WHERE created_at >= date_trunc('day', now());

  -- 6. User Type Breakdown (Cumulative)
  SELECT count(1) INTO v_users_customer FROM public.users WHERE role = 'customer' AND is_admin = false;
  SELECT count(1) INTO v_users_tradie FROM public.users WHERE role = 'tradie' AND is_admin = false;
  SELECT count(1) INTO v_users_dual FROM public.users WHERE role = 'dual' AND is_admin = false;
  SELECT count(1) INTO v_users_admin FROM public.users WHERE is_admin = true;

  -- 7. Job Status Breakdown (Filtered by window)
  SELECT count(1) INTO v_jobs_open FROM public.jobs WHERE status = 'open' AND created_at >= v_start_time;
  SELECT count(1) INTO v_jobs_accepted FROM public.jobs WHERE status = 'accepted' AND created_at >= v_start_time;
  SELECT count(1) INTO v_jobs_funded FROM public.jobs WHERE status = 'payment_held' AND created_at >= v_start_time;
  SELECT count(1) INTO v_jobs_review FROM public.jobs WHERE status = 'completed_pending_review' AND created_at >= v_start_time;
  SELECT count(1) INTO v_jobs_completed FROM public.jobs WHERE status = 'completed' AND created_at >= v_start_time;
  SELECT count(1) INTO v_jobs_disputed FROM public.jobs WHERE status = 'disputed' AND created_at >= v_start_time;

  -- 8. Verification Breakdown (Cumulative)
  SELECT count(1) INTO v_verif_verified FROM public.users WHERE role IN ('tradie', 'dual') AND tradie_verified = true;
  SELECT count(1) INTO v_verif_pending FROM public.users WHERE role IN ('tradie', 'dual') AND tradie_verified = false AND id IN (SELECT DISTINCT user_id FROM public.verifications WHERE status = 'pending');
  SELECT count(1) INTO v_verif_unverified FROM public.users WHERE role IN ('tradie', 'dual') AND tradie_verified = false AND id NOT IN (SELECT DISTINCT user_id FROM public.verifications WHERE status = 'pending');

  -- 9. Job Funnel (Filtered by window)
  SELECT count(1) INTO v_jobs_posted FROM public.jobs WHERE created_at >= v_start_time;
  SELECT count(1) INTO v_applications_submitted FROM public.applications WHERE created_at >= v_start_time;
  SELECT count(1) INTO v_quotes_accepted FROM public.jobs WHERE status IN ('accepted', 'payment_held', 'completed_pending_review', 'disputed', 'completed') AND created_at >= v_start_time;
  SELECT count(1) INTO v_contracts_active FROM public.jobs WHERE status IN ('payment_held', 'completed_pending_review', 'disputed', 'completed') AND created_at >= v_start_time;
  SELECT count(1) INTO v_completions_submitted FROM public.jobs WHERE status IN ('completed_pending_review', 'completed') AND created_at >= v_start_time;
  SELECT count(1) INTO v_completed_released FROM public.jobs WHERE status = 'completed' AND created_at >= v_start_time;
  SELECT count(1) INTO v_disputed FROM public.jobs WHERE status = 'disputed' AND created_at >= v_start_time;

  -- 10. Beta Activity (Filtered by window)
  SELECT count(1) INTO v_new_users FROM public.users WHERE created_at >= v_start_time;
  SELECT count(1) INTO v_new_jobs FROM public.jobs WHERE created_at >= v_start_time;
  SELECT count(1) INTO v_new_messages FROM public.messages WHERE created_at >= v_start_time;
  SELECT count(1) INTO v_new_reviews FROM public.reviews WHERE created_at >= v_start_time;

  -- 11. Job Category Breakdown (Filtered by window)
  SELECT COALESCE(jsonb_object_agg(cat, cnt), '{}'::jsonb) INTO v_categories_json
  FROM (
    SELECT unnest(categories) AS cat, count(1) AS cnt
    FROM public.jobs
    WHERE created_at >= v_start_time
    GROUP BY unnest(categories)
  ) sub;

  -- Construct standard JSONB response
  v_result := jsonb_build_object(
    'marketplace_snapshot', jsonb_build_object(
      'total_users', v_users_total,
      'total_customers', v_customers_total,
      'total_tradies', v_tradies_total,
      'verified_tradies', v_tradies_verified,
      'pending_verifications', v_verifications_pending,
      'pending_verification_cases', v_verifications_pending_cases,
      'public_portfolios', v_portfolio_count,
      'total_reviews', v_reviews_count,
      'average_rating', round(v_avg_rating, 2)
    ),
    'live_now', jsonb_build_object(
      'active_users_5m', v_active_5m,
      'active_users_30m', v_active_30m
    ),
    'today', jsonb_build_object(
      'new_users_today', v_new_users_today,
      'jobs_posted_today', v_jobs_posted_today,
      'quotes_submitted_today', v_quotes_submitted_today,
      'messages_sent_today', v_messages_sent_today,
      'reviews_submitted_today', v_reviews_submitted_today
    ),
    'user_breakdown', jsonb_build_object(
      'customers', v_users_customer,
      'tradies', v_users_tradie,
      'dual', v_users_dual,
      'admins', v_users_admin
    ),
    'job_status_breakdown', jsonb_build_object(
      'open', v_jobs_open,
      'accepted', v_jobs_accepted,
      'funded', v_jobs_funded,
      'review', v_jobs_review,
      'completed', v_jobs_completed,
      'disputed', v_jobs_disputed
    ),
    'verification_breakdown', jsonb_build_object(
      'verified', v_verif_verified,
      'pending', v_verif_pending,
      'unverified', v_verif_unverified
    ),
    'job_funnel', jsonb_build_object(
      'jobs_posted', v_jobs_posted,
      'quotes_submitted', v_applications_submitted,
      'quotes_accepted', v_quotes_accepted,
      'contracts_active', v_contracts_active,
      'completions_submitted', v_completions_submitted,
      'completed_released', v_completed_released,
      'disputed', v_disputed
    ),
    'beta_activity', jsonb_build_object(
      'new_users', v_new_users,
      'new_jobs', v_new_jobs,
      'new_messages', v_new_messages,
      'new_reviews', v_new_reviews
    ),
    'job_categories', v_categories_json
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_analytics(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_admin_analytics(text) IS
  'Polished admin-only dashboard analytics aggregator. Returns aggregated metrics, breakdowns, live status, and category distributions without exposing private fields.';
