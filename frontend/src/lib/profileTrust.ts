import { supabase } from './supabase';

export interface PublicProofImage {
  id: string;
  job_title: string | null;
  job_categories: string[] | null;
  job_suburb: string | null;
  job_state: string | null;
  completed_at: string | null;
  portfolio_title: string | null;
  portfolio_caption: string | null;
  portfolio_trade_category: string | null;
  created_at: string;
  attachments: string[];
  image_urls?: string[];
}

export interface CompletionProofPortfolioItem extends PublicProofImage {
  is_public_portfolio: boolean;
}

export interface CompletionProofPortfolioInput {
  is_public_portfolio: boolean;
  portfolio_title?: string | null;
  portfolio_caption?: string | null;
  portfolio_trade_category?: string | null;
}

const signedUrlTtlSeconds = 3600;
const setupRepairMessage = 'Profile trust setup is incomplete. Ask an admin to run migrations 047_repair_profile_trust_live_schema.sql and 058_completed_work_portfolio_foundation.sql in Supabase.';

function profileTrustError(error: any) {
  const message = String(error?.message || error || '');
  if (
    message.includes('Bucket not found')
    || message.includes('schema cache')
    || message.includes('tradie_portfolio_items')
    || message.includes('list_my_portfolio_completion_proofs')
    || message.includes('set_completion_proof_public_portfolio')
    || message.includes('list_public_tradie_gallery')
    || message.includes('public_profiles.business_name')
  ) {
    return new Error(setupRepairMessage);
  }
  return error instanceof Error ? error : new Error(message || 'Profile trust request failed.');
}

export function validateTrustImage(file: File, maxSizeMb = 5) {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    return 'Only JPG, PNG, and WebP images are supported.';
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    return `Images must be ${maxSizeMb}MB or smaller.`;
  }
  return null;
}

export async function uploadAvatar(userId: string, file: File) {
  const validationError = validateTrustImage(file);
  if (validationError) return { data: null, error: new Error(validationError) };

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `avatars/${userId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('profile_media')
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) return { data: null, error: profileTrustError(uploadError) };

  const { data } = supabase.storage.from('profile_media').getPublicUrl(path);
  return { data: { path, publicUrl: data.publicUrl }, error: null };
}

export async function fetchPublicProofGallery(tradieId: string) {
  try {
    const { data, error } = await supabase.rpc('list_public_tradie_gallery', {
      p_tradie_id: tradieId,
    });

    if (error) throw error;

    const rows = ((data || []) as PublicProofImage[]).filter(row => row.attachments?.length > 0);
    const paths = [...new Set(rows.flatMap(row => row.attachments || []))];
    if (paths.length === 0) return { data: rows.map(row => ({ ...row, image_urls: [] })), error: null };

    const { data: signed, error: signedError } = await supabase.storage
      .from('completion_proofs')
      .createSignedUrls(paths, signedUrlTtlSeconds);

    if (signedError) throw signedError;

    const urlByPath = new Map((signed || []).map(item => [item.path, item.signedUrl]));
    return {
      data: rows.map(row => ({
        ...row,
        image_urls: row.attachments.map(path => urlByPath.get(path)).filter(Boolean) as string[],
      })),
      error: null,
    };
  } catch (error: any) {
    console.error('fetchPublicProofGallery error:', error.message);
    return { data: [] as PublicProofImage[], error: profileTrustError(error) };
  }
}

export async function fetchEligibleCompletionProofPortfolioItems() {
  try {
    const { data, error } = await supabase.rpc('list_my_portfolio_completion_proofs');
    if (error) throw error;

    const rows = ((data || []) as CompletionProofPortfolioItem[]).filter(row => row.attachments?.length > 0);
    const paths = [...new Set(rows.flatMap(row => row.attachments || []))];
    if (paths.length === 0) return { data: rows.map(row => ({ ...row, image_urls: [] })), error: null };

    const { data: signed, error: signedError } = await supabase.storage
      .from('completion_proofs')
      .createSignedUrls(paths, signedUrlTtlSeconds);

    if (signedError) throw signedError;

    const urlByPath = new Map((signed || []).map(item => [item.path, item.signedUrl]));
    return {
      data: rows.map(row => ({
        ...row,
        image_urls: row.attachments.map(path => urlByPath.get(path)).filter(Boolean) as string[],
      })),
      error: null,
    };
  } catch (error: any) {
    console.error('fetchEligibleCompletionProofPortfolioItems error:', error.message);
    return { data: [] as CompletionProofPortfolioItem[], error: profileTrustError(error) };
  }
}

export async function updateCompletionProofPortfolioItem(proofId: string, input: CompletionProofPortfolioInput) {
  const { data, error } = await supabase.rpc('set_completion_proof_public_portfolio', {
    p_proof_id: proofId,
    p_is_public_portfolio: input.is_public_portfolio,
    p_portfolio_title: input.portfolio_title || null,
    p_portfolio_caption: input.portfolio_caption || null,
    p_portfolio_trade_category: input.portfolio_trade_category || null,
  });
  return { data, error: error ? profileTrustError(error) : null };
}
