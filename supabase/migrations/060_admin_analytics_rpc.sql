-- Migration: 060_admin_analytics_rpc.sql
-- Description: Implement a safe, admin-only analytics aggregator RPC that retrieves beta marketplace activity without exposing private records or weakening RLS.

DROP FUNCTION IF EXISTS public.get_admin_analytics(text);

CREATE OR REPLACE FUNCTION public.get_admin_analytics(p_time_window text DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result jsonb;
  v_users_total bigint;
  v_customers_total bigint;
  v_tradies_total bigint;
  v_tradies_verified bigint;
  v_verifications_pending bigint;
  v_verifications_pending_cases bigint;
  
  v_jobs_posted bigint;
  v_applications_submitted bigint;
  v_quotes_accepted bigint;
  v_contracts_active bigint;
  v_completions_submitted bigint;
  v_completed_released bigint;
  v_disputed bigint;
  
  v_new_users bigint;
  v_new_jobs bigint;
  v_new_messages bigint;
  v_new_reviews bigint;
  
  v_portfolio_count bigint;
  v_reviews_count bigint;
  v_avg_rating numeric;
  
  v_start_time timestamptz;
BEGIN
  -- 1. Strict admin verification
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

  -- 3. Marketplace Snapshot (Totals are kept all-time/cumulative by design)
  SELECT count(1) INTO v_users_total FROM public.users;
  SELECT count(1) INTO v_customers_total FROM public.users WHERE role IN ('customer', 'dual');
  SELECT count(1) INTO v_tradies_total FROM public.users WHERE role IN ('tradie', 'dual');
  SELECT count(1) INTO v_tradies_verified FROM public.users WHERE tradie_verified = true;
  SELECT count(1) INTO v_verifications_pending FROM public.verifications WHERE status = 'pending';
  
  -- Pending unique cases
  SELECT count(DISTINCT user_id) INTO v_verifications_pending_cases 
  FROM public.verifications 
  WHERE status = 'pending';
  
  SELECT count(1) INTO v_portfolio_count FROM public.job_completion_proofs WHERE is_public_portfolio = true;
  
  -- Cumulative Reviews count and average rating
  SELECT count(1), COALESCE(avg(rating), 0)
  INTO v_reviews_count, v_avg_rating
  FROM public.reviews;

  -- 4. Job Funnel (Calculated relative to when the job was created)
  SELECT count(1) INTO v_jobs_posted 
  FROM public.jobs 
  WHERE created_at >= v_start_time;

  -- Applications / Quotes submitted
  SELECT count(1) INTO v_applications_submitted 
  FROM public.applications 
  WHERE created_at >= v_start_time;

  -- Accepted quotes / contracts created
  SELECT count(1) INTO v_quotes_accepted 
  FROM public.jobs 
  WHERE status IN ('accepted', 'payment_held', 'completed_pending_review', 'disputed', 'completed')
    AND created_at >= v_start_time;

  -- Funded / Contract active
  SELECT count(1) INTO v_contracts_active 
  FROM public.jobs 
  WHERE status IN ('payment_held', 'completed_pending_review', 'disputed', 'completed')
    AND created_at >= v_start_time;

  -- Completion submitted (tradie completed, awaiting review)
  SELECT count(1) INTO v_completions_submitted 
  FROM public.jobs 
  WHERE status IN ('completed_pending_review', 'completed')
    AND created_at >= v_start_time;

  -- Completed / Released
  SELECT count(1) INTO v_completed_released 
  FROM public.jobs 
  WHERE status = 'completed'
    AND created_at >= v_start_time;

  -- Disputed
  SELECT count(1) INTO v_disputed 
  FROM public.jobs 
  WHERE status = 'disputed'
    AND created_at >= v_start_time;

  -- 5. Beta Activity Indicators (Filtered by time window)
  SELECT count(1) INTO v_new_users FROM public.users WHERE created_at >= v_start_time;
  SELECT count(1) INTO v_new_jobs FROM public.jobs WHERE created_at >= v_start_time;
  SELECT count(1) INTO v_new_messages FROM public.messages WHERE created_at >= v_start_time;
  SELECT count(1) INTO v_new_reviews FROM public.reviews WHERE created_at >= v_start_time;

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
    )
  );

  RETURN v_result;
END;
$$;

-- Revoke default public execute privileges and grant authenticated execution
REVOKE ALL ON FUNCTION public.get_admin_analytics(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_admin_analytics(text) IS
  'Admin-only dashboard analytics aggregator. Returns aggregated metrics and stats without leaking private fields.';
