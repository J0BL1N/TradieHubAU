/**
 * verification-api.js
 * Handles Identity Verification (ID Uploads)
 */
import { supabase } from '../core/supabase-client.js';

const BUCKET = 'verifications'; // Private bucket

/**
 * Upload ID Document
 * @param {File} file 
 * @param {string} type - 'license' | 'passport'
 */
export async function uploadVerificationDocument(file, type = 'license') {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in');

    // 1. Upload File (Private)
    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/${Date.now()}_${type}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, {
        upsert: false
      });

    if (uploadError) throw uploadError;

    // 2. Create Verification Record
    const { data, error: dbError } = await supabase
      .from('verifications')
      .insert({
        user_id: user.id,
        document_type: type,
        document_url: filePath,
        status: 'pending'
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return { verification: data, error: null };
  } catch (error) {
    console.error('Verification upload failed:', error);
    return { verification: null, error };
  }
}

/**
 * Get Current Verification Status
 */
export async function getVerificationStatus(userId) {
  // Check users table first (for approved status)
  const { data: user } = await supabase
    .from('users')
    .select('verified')
    .eq('id', userId)
    .single();

  if (user?.verified) {
    return { status: 'approved', error: null };
  }

  // Check pending submissions
  const { data: verifs, error } = await supabase
    .from('verifications')
    .select('*')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(1);

  if (error && error.code !== 'PGRST116') return { status: 'none', error };
  
  const latest = verifs?.[0];
  if (!latest) return { status: 'none', error: null };

  return { status: latest.status, latestSubmission: latest, error: null };
}

/**
 * Admin: Approve Verification (Simulation)
 * In real app, this is an Admin-only function
 */
export async function adminApproveVerification(verificationId) {
    // 1. Get verification to find user
    const { data: v } = await supabase.from('verifications').select('user_id').eq('id', verificationId).single();
    if(!v) return { error: 'Not found' };
    
    // 2. Update status
    await supabase.from('verifications').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', verificationId);
    
    // 3. Mark user verified
    await supabase.from('users').update({ verified: true }).eq('id', v.user_id);
    
    return { success: true };
}
