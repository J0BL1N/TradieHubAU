import { supabase } from './supabase';

export interface JobInvoiceLineItem {
  id: string;
  invoice_id: string;
  job_id: string;
  source_type: 'accepted_quote' | 'approved_variation';
  source_line_id: string | null;
  label: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  line_type: 'labour' | 'materials' | 'callout' | 'disposal' | 'equipment' | 'permit' | 'other';
  sort_order: number;
  created_at: string;
}

export interface JobInvoice {
  id: string;
  job_id: string;
  payer_id: string;
  payee_id: string;
  payment_id: string;
  invoice_type: 'customer_receipt' | 'tradie_payout_statement';
  invoice_number: string;
  amount_cents: number;
  platform_fee_cents: number;
  payout_amount_cents: number;
  issued_at: string;
  created_at: string;
  updated_at: string;
  line_items: JobInvoiceLineItem[];
  accepted_quote_subtotal: number;
  approved_variation_subtotal: number;
  job_title?: string;
  job_categories?: string[];
  job_suburb?: string;
  job_state?: string;
  payer_name?: string;
  payee_name?: string;
  payee_business_name?: string;
  payee_abn?: string;
}

export async function fetchInvoiceDetailsByJob(jobId: string, invoiceType: 'customer_receipt' | 'tradie_payout_statement') {
  // Query invoices for this job via RPC. RLS ensures customer sees REC and tradie sees PAY.
  const { data, error } = await supabase
    .rpc('get_my_job_invoice', {
      p_job_id: jobId,
      p_invoice_type: invoiceType
    });

  if (error) return { data: null, error };
  if (!data || data.length === 0) return { data: [], error: null };

  const inv = data[0];
  const lineItems = Array.isArray(inv.line_items)
    ? inv.line_items.map((item: any) => ({
        ...item,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        line_total: Number(item.line_total || 0),
        sort_order: Number(item.sort_order || 0),
      }))
    : [];
  
  // Resolve profiles safely using public_profiles boundary to avoid exposure
  const [payerRes, payeeRes, jobRes] = await Promise.all([
    supabase.from('public_profiles').select('display_name').eq('id', inv.payer_id).single(),
    supabase.from('public_profiles').select('display_name, business_name, abn').eq('id', inv.payee_id).single(),
    supabase.from('jobs').select('title, categories, suburb, state').eq('id', inv.job_id).single()
  ]);

  return {
    data: [{
      ...inv,
      line_items: lineItems,
      accepted_quote_subtotal: Number(inv.accepted_quote_subtotal || 0),
      approved_variation_subtotal: Number(inv.approved_variation_subtotal || 0),
      job_title: jobRes.data?.title,
      job_categories: jobRes.data?.categories,
      job_suburb: jobRes.data?.suburb,
      job_state: jobRes.data?.state,
      payer_name: payerRes.data?.display_name || 'Customer',
      payee_name: payeeRes.data?.display_name || 'Contractor',
      payee_business_name: payeeRes.data?.business_name,
      payee_abn: payeeRes.data?.abn
    }],
    error: null
  };
}
