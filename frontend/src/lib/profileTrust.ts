import { supabase } from './supabase';

export interface PortfolioItem {
  id: string;
  owner_id: string;
  title: string;
  trade_category: string | null;
  suburb: string | null;
  description: string | null;
  completion_month: string | null;
  image_paths: string[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
  image_urls?: string[];
}

export interface PortfolioInput {
  title: string;
  trade_category?: string | null;
  suburb?: string | null;
  description?: string | null;
  completion_month?: string | null;
  image_paths?: string[];
  is_public?: boolean;
}

export interface PublicProofImage {
  id: string;
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
const setupRepairMessage = 'Profile trust setup is incomplete. Ask an admin to run migration 047_repair_profile_trust_live_schema.sql in Supabase.';

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

export async function uploadPortfolioImages(userId: string, files: File[]) {
  const paths: string[] = [];

  for (const file of files) {
    const validationError = validateTrustImage(file);
    if (validationError) return { data: paths, error: new Error(validationError) };

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `portfolio/${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from('portfolio_images')
      .upload(path, file, { contentType: file.type });

    if (error) return { data: paths, error: profileTrustError(error) };
    paths.push(path);
  }

  return { data: paths, error: null };
}

async function signPortfolioImages(items: PortfolioItem[]) {
  const paths = [...new Set(items.flatMap(item => item.image_paths || []))];
  if (paths.length === 0) return items.map(item => ({ ...item, image_urls: [] }));

  const { data, error } = await supabase.storage
    .from('portfolio_images')
    .createSignedUrls(paths, signedUrlTtlSeconds);

  if (error) throw error;

  const urlByPath = new Map((data || []).map(item => [item.path, item.signedUrl]));
  return items.map(item => ({
    ...item,
    image_urls: (item.image_paths || []).map(path => urlByPath.get(path)).filter(Boolean) as string[],
  }));
}

export async function fetchPortfolioItems(ownerId: string, includePrivate = false) {
  try {
    let query = supabase
      .from('tradie_portfolio_items')
      .select('*')
      .eq('owner_id', ownerId)
      .order('completion_month', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (!includePrivate) query = query.eq('is_public', true);

    const { data, error } = await query;
    if (error) throw error;

    const signed = await signPortfolioImages((data || []) as PortfolioItem[]);
    return { data: signed, error: null };
  } catch (error: any) {
    console.error('fetchPortfolioItems error:', error.message);
    return { data: [] as PortfolioItem[], error: profileTrustError(error) };
  }
}

export async function createPortfolioItem(ownerId: string, input: PortfolioInput) {
  const { data, error } = await supabase
    .from('tradie_portfolio_items')
    .insert({
      owner_id: ownerId,
      title: input.title,
      trade_category: input.trade_category || null,
      suburb: input.suburb || null,
      description: input.description || null,
      completion_month: input.completion_month || null,
      image_paths: input.image_paths || [],
      is_public: input.is_public ?? true,
    })
    .select('*')
    .maybeSingle();

  return { data: data as PortfolioItem | null, error: error ? profileTrustError(error) : null };
}

export async function updatePortfolioItem(itemId: string, input: PortfolioInput) {
  const { data, error } = await supabase
    .from('tradie_portfolio_items')
    .update({
      title: input.title,
      trade_category: input.trade_category || null,
      suburb: input.suburb || null,
      description: input.description || null,
      completion_month: input.completion_month || null,
      image_paths: input.image_paths || [],
      is_public: input.is_public ?? true,
    })
    .eq('id', itemId)
    .select('*')
    .maybeSingle();

  return { data: data as PortfolioItem | null, error: error ? profileTrustError(error) : null };
}

export async function deletePortfolioItem(itemId: string) {
  const { data, error } = await supabase.from('tradie_portfolio_items').delete().eq('id', itemId);
  return { data, error: error ? profileTrustError(error) : null };
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
