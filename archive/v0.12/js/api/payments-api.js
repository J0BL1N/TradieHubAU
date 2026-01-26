/**
 * payments-api.js
 * Handles Stripe Connect integration and Payment Intents
 */
import { supabase } from '../core/supabase-client.js';
import db from '../core/db.js';

// Configuration (Replace with keys from Morning Checklist or Env)
const STRIPE_PK = 'pk_test_...'; // Public Key would go here
// In a real app, most of this logic lives in Edge Functions (backend)
// For this Prototype/MVP, we simulate the backend logic via Supabase RPC or direct writes where safe.

/**
 * 1. Tradie Onboarding (Connect Bank Account)
 * @param {string} userId 
 */
export async function createStripeConnectAccount(userId) {
  try {
    // In production: Call supabase.functions.invoke('create-connect-account')
    // MVP Simulation:
    console.log(`Creating Stripe Connect account for ${userId}...`);
    
    // Simulate getting an account ID from Stripe
    const mockAccountId = `acct_${Math.random().toString(36).substr(2, 9)}`;
    
    // Save to user profile
    const { error } = await supabase
      .from('users')
      .update({ stripe_account_id: mockAccountId })
      .eq('id', userId);

    if (error) throw error;

    // Return a mock onboarding URL
    // In real life, this URL comes from Stripe API
    return { 
      url: 'https://connect.stripe.com/setup/s/mock-onboarding', 
      accountId: mockAccountId,
      error: null 
    };
  } catch (error) {
    console.error('Stripe Connect failed:', error);
    return { url: null, error };
  }
}

/**
 * 2. Customer: Create Payment Intent (Escrow)
 * @param {string} jobId 
 * @param {number} amountCents 
 * @param {string} tradieId 
 */
export async function createEscrowPayment(jobId, amountCents, tradieId) {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not logged in');

    // 1. Create Payment Record (Pending)
    const { data: payment, error: dbError } = await supabase
      .from('payments')
      .insert({
        job_id: jobId,
        payer_id: user.user.id,
        payee_id: tradieId,
        amount: amountCents,
        status: 'pending'
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // 2. Call Stripe (Simulated)
    // In prod: const { clientSecret } = await supabase.functions.invoke('create-payment-intent', ...)
    const mockClientSecret = `pi_${Math.random().toString(36)}_secret_${Math.random().toString(36)}`;

    // 3. Update Status to 'held_in_escrow' (Simulating successful payment flow)
    await supabase
      .from('payments')
      .update({ 
        status: 'held_in_escrow',
        stripe_payment_intent_id: mockClientSecret.split('_secret')[0]
      })
      .eq('id', payment.id);

    // 4. Update Job Status
    await db.updateJob(jobId, { status: 'in_progress', in_progress_at: new Date().toISOString() });

    return { clientSecret: mockClientSecret, paymentId: payment.id, error: null };
  } catch (error) {
    console.error('Escrow creation failed:', error);
    return { error };
  }
}

/**
 * 3. Release Funds (Payout)
 * @param {string} paymentId 
 */
export async function releaseFunds(paymentId) {
  try {
    // In prod: Verify job completion, then trigger Stripe transfer
    
    const { error } = await supabase
      .from('payments')
      .update({ status: 'released' })
      .eq('id', paymentId);

    if (error) throw error;
    
    // Also mark Job as completed if not already?
    // Often handled by separate flow.
    
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error };
  }
}

/**
 * Get Payment Status for a Job
 */
export async function getJobPayment(jobId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('job_id', jobId)
    .single();
    
  // If no rows, it just means unpaid
  if (error && error.code !== 'PGRST116') return { payment: null, error };
  return { payment: data || null, error: null };
}
