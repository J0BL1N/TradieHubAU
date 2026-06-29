-- Migration: 073_itemise_final_invoice_documents.sql
-- Description: Itemise final receipt/payout documents from accepted quote snapshots and approved variation snapshots.

CREATE TABLE IF NOT EXISTS public.job_invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.job_invoices(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('accepted_quote', 'approved_variation')),
  source_line_id uuid,
  label text NOT NULL CHECK (char_length(trim(label)) > 0),
  description text,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  line_total numeric NOT NULL CHECK (line_total >= 0),
  line_type text NOT NULL CHECK (line_type IN ('labour', 'materials', 'callout', 'disposal', 'equipment', 'permit', 'other')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_invoice_line_items_invoice
  ON public.job_invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_job_invoice_line_items_job
  ON public.job_invoice_line_items(job_id);
CREATE INDEX IF NOT EXISTS idx_job_invoice_line_items_source
  ON public.job_invoice_line_items(source_type, source_line_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_invoice_line_items_unique_source
  ON public.job_invoice_line_items(invoice_id, source_type, source_line_id)
  WHERE source_line_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_invoice_line_items_unique_fallback
  ON public.job_invoice_line_items(invoice_id, source_type)
  WHERE source_line_id IS NULL;

ALTER TABLE public.job_invoice_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own invoice line items" ON public.job_invoice_line_items;
CREATE POLICY "Users can select own invoice line items"
  ON public.job_invoice_line_items FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1
      FROM public.job_invoices ji
      JOIN public.jobs j ON j.id = ji.job_id
      JOIN public.payments p ON p.id = ji.payment_id
      WHERE ji.id = job_invoice_line_items.invoice_id
        AND ji.job_id = job_invoice_line_items.job_id
        AND j.status = 'completed'
        AND p.status = 'released'
        AND (
          public.is_admin(auth.uid())
          OR (ji.invoice_type = 'customer_receipt' AND ji.payer_id = auth.uid())
          OR (ji.invoice_type = 'tradie_payout_statement' AND ji.payee_id = auth.uid())
        )
    )
  );

REVOKE ALL ON public.job_invoice_line_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.job_invoice_line_items TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_job_invoice_line_items(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_invoice public.job_invoices%ROWTYPE;
  v_accepted_application_id uuid;
  v_accepted_estimate numeric;
  v_has_accepted_quote_lines boolean;
  v_fallback_total numeric;
BEGIN
  SELECT *
  INTO v_invoice
  FROM public.job_invoices
  WHERE id = p_invoice_id;

  IF v_invoice.id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.payments p ON p.id = v_invoice.payment_id
    WHERE j.id = v_invoice.job_id
      AND j.status = 'completed'
      AND p.status = 'released'
  ) THEN
    RETURN;
  END IF;

  SELECT a.id, a.estimate
  INTO v_accepted_application_id, v_accepted_estimate
  FROM public.applications a
  WHERE a.job_id = v_invoice.job_id
    AND a.tradie_id = v_invoice.payee_id
    AND a.customer_id = v_invoice.payer_id
    AND a.status = 'accepted'
  ORDER BY a.updated_at DESC
  LIMIT 1;

  INSERT INTO public.job_invoice_line_items (
    invoice_id,
    job_id,
    source_type,
    source_line_id,
    label,
    description,
    quantity,
    unit_price,
    line_total,
    line_type,
    sort_order
  )
  SELECT
    v_invoice.id,
    aqli.job_id,
    'accepted_quote',
    aqli.id,
    aqli.label,
    aqli.description,
    aqli.quantity,
    aqli.unit_price,
    aqli.line_total,
    aqli.line_type,
    aqli.sort_order
  FROM public.accepted_quote_line_items aqli
  WHERE aqli.job_id = v_invoice.job_id
    AND (v_accepted_application_id IS NULL OR aqli.application_id = v_accepted_application_id)
    AND aqli.customer_id = v_invoice.payer_id
    AND aqli.tradie_id = v_invoice.payee_id
  ON CONFLICT (invoice_id, source_type, source_line_id)
    WHERE source_line_id IS NOT NULL
    DO NOTHING;

  SELECT EXISTS (
    SELECT 1
    FROM public.job_invoice_line_items jili
    WHERE jili.invoice_id = v_invoice.id
      AND jili.source_type = 'accepted_quote'
      AND jili.source_line_id IS NOT NULL
  )
  INTO v_has_accepted_quote_lines;

  IF v_has_accepted_quote_lines THEN
    DELETE FROM public.job_invoice_line_items jili
    WHERE jili.invoice_id = v_invoice.id
      AND jili.source_type = 'accepted_quote'
      AND jili.source_line_id IS NULL;
  ELSE
    v_fallback_total := COALESCE(NULLIF(v_accepted_estimate, 0), v_invoice.amount_cents::numeric / 100);

    IF v_fallback_total > 0 THEN
      INSERT INTO public.job_invoice_line_items (
        invoice_id,
        job_id,
        source_type,
        source_line_id,
        label,
        description,
        quantity,
        unit_price,
        line_total,
        line_type,
        sort_order
      )
      VALUES (
        v_invoice.id,
        v_invoice.job_id,
        'accepted_quote',
        NULL,
        'Accepted quote total',
        'Legacy completed job without accepted quote line snapshots.',
        1,
        v_fallback_total,
        v_fallback_total,
        'other',
        0
      )
      ON CONFLICT (invoice_id, source_type)
        WHERE source_line_id IS NULL
        DO NOTHING;
    END IF;
  END IF;

  INSERT INTO public.job_invoice_line_items (
    invoice_id,
    job_id,
    source_type,
    source_line_id,
    label,
    description,
    quantity,
    unit_price,
    line_total,
    line_type,
    sort_order
  )
  SELECT
    v_invoice.id,
    avli.job_id,
    'approved_variation',
    avli.id,
    avli.label,
    avli.description,
    avli.quantity,
    avli.unit_price,
    avli.line_total,
    avli.line_type,
    10000 + avli.sort_order
  FROM public.approved_variation_line_items avli
  WHERE avli.job_id = v_invoice.job_id
    AND (v_accepted_application_id IS NULL OR avli.application_id = v_accepted_application_id)
    AND avli.customer_id = v_invoice.payer_id
    AND avli.tradie_id = v_invoice.payee_id
  ON CONFLICT (invoice_id, source_type, source_line_id)
    WHERE source_line_id IS NOT NULL
    DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_job_invoice_line_items(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_job_invoice_line_items(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_job_invoices(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_short_id text;
  v_receipt_num text;
  v_payout_num text;
  v_invoice_id uuid;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF v_job.id IS NULL THEN
    RETURN;
  END IF;

  IF v_job.status != 'completed' THEN
    RETURN;
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE job_id = p_job_id LIMIT 1;
  IF v_payment.id IS NULL OR v_payment.status != 'released' THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.job_issues
    WHERE job_id = p_job_id AND status = 'open'
  ) THEN
    RETURN;
  END IF;

  v_short_id := substring(p_job_id::text from 1 for 8);
  v_receipt_num := 'THAU-' || v_short_id || '-REC';
  v_payout_num := 'THAU-' || v_short_id || '-PAY';

  INSERT INTO public.job_invoices (
    job_id, payer_id, payee_id, payment_id, invoice_type, invoice_number,
    amount_cents, platform_fee_cents, payout_amount_cents
  )
  VALUES (
    p_job_id, v_job.customer_id, v_payment.payee_id, v_payment.id, 'customer_receipt', v_receipt_num,
    v_payment.amount, v_payment.platform_fee, (v_payment.amount - v_payment.platform_fee)
  )
  ON CONFLICT (invoice_number) DO NOTHING;

  INSERT INTO public.job_invoices (
    job_id, payer_id, payee_id, payment_id, invoice_type, invoice_number,
    amount_cents, platform_fee_cents, payout_amount_cents
  )
  VALUES (
    p_job_id, v_job.customer_id, v_payment.payee_id, v_payment.id, 'tradie_payout_statement', v_payout_num,
    v_payment.amount, v_payment.platform_fee, (v_payment.amount - v_payment.platform_fee)
  )
  ON CONFLICT (invoice_number) DO NOTHING;

  FOR v_invoice_id IN
    SELECT id
    FROM public.job_invoices
    WHERE job_id = p_job_id
  LOOP
    PERFORM public.ensure_job_invoice_line_items(v_invoice_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_job_invoices(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_job_invoices(uuid) TO service_role;

DROP FUNCTION IF EXISTS public.get_my_job_invoice(uuid, text);
CREATE FUNCTION public.get_my_job_invoice(p_job_id uuid, p_invoice_type text)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  payer_id uuid,
  payee_id uuid,
  payment_id uuid,
  invoice_type text,
  invoice_number text,
  amount_cents integer,
  platform_fee_cents integer,
  payout_amount_cents integer,
  issued_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  line_items jsonb,
  accepted_quote_subtotal numeric,
  approved_variation_subtotal numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current_user uuid;
  v_is_admin boolean;
BEGIN
  v_current_user := auth.uid();
  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF p_invoice_type NOT IN ('customer_receipt', 'tradie_payout_statement') THEN
    RAISE EXCEPTION 'Invalid invoice type.';
  END IF;

  v_is_admin := public.is_admin(v_current_user);

  PERFORM public.ensure_job_invoices(p_job_id);

  RETURN QUERY
  SELECT
    ji.id,
    ji.job_id,
    ji.payer_id,
    ji.payee_id,
    ji.payment_id,
    ji.invoice_type,
    ji.invoice_number,
    ji.amount_cents,
    ji.platform_fee_cents,
    ji.payout_amount_cents,
    ji.issued_at,
    ji.created_at,
    ji.updated_at,
    COALESCE(lines.line_items, '[]'::jsonb) AS line_items,
    COALESCE(lines.accepted_quote_subtotal, 0) AS accepted_quote_subtotal,
    COALESCE(lines.approved_variation_subtotal, 0) AS approved_variation_subtotal
  FROM public.job_invoices ji
  JOIN public.jobs j ON j.id = ji.job_id
  JOIN public.payments p ON p.id = ji.payment_id
  LEFT JOIN LATERAL (
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'id', jili.id,
          'invoice_id', jili.invoice_id,
          'job_id', jili.job_id,
          'source_type', jili.source_type,
          'source_line_id', jili.source_line_id,
          'label', jili.label,
          'description', jili.description,
          'quantity', jili.quantity,
          'unit_price', jili.unit_price,
          'line_total', jili.line_total,
          'line_type', jili.line_type,
          'sort_order', jili.sort_order,
          'created_at', jili.created_at
        )
        ORDER BY jili.source_type, jili.sort_order, jili.created_at
      ) AS line_items,
      SUM(jili.line_total) FILTER (WHERE jili.source_type = 'accepted_quote') AS accepted_quote_subtotal,
      SUM(jili.line_total) FILTER (WHERE jili.source_type = 'approved_variation') AS approved_variation_subtotal
    FROM public.job_invoice_line_items jili
    WHERE jili.invoice_id = ji.id
  ) lines ON true
  WHERE ji.job_id = p_job_id
    AND ji.invoice_type = p_invoice_type
    AND j.status = 'completed'
    AND p.status = 'released'
    AND (
      v_is_admin
      OR (ji.payer_id = v_current_user AND p_invoice_type = 'customer_receipt')
      OR (ji.payee_id = v_current_user AND p_invoice_type = 'tradie_payout_statement')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_job_invoice(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_job_invoice(uuid, text) TO authenticated;

DO $$
DECLARE
  v_job_id uuid;
BEGIN
  FOR v_job_id IN
    SELECT j.id
    FROM public.jobs j
    JOIN public.payments p ON p.job_id = j.id
    WHERE j.status = 'completed'
      AND p.status = 'released'
  LOOP
    PERFORM public.ensure_job_invoices(v_job_id);
  END LOOP;
END;
$$;

COMMENT ON TABLE public.job_invoice_line_items IS
  'Trusted itemised final receipt/payout document lines derived only from accepted quote snapshots and approved variation snapshots. No client-side arbitrary invoice additions are allowed.';

COMMENT ON FUNCTION public.ensure_job_invoice_line_items(uuid) IS
  'Idempotently creates trusted invoice line items from accepted_quote_line_items and approved_variation_line_items, with a legacy accepted quote total fallback.';
