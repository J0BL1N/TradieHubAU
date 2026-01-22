/**
 * storage-api.js - Cloud Storage & Image Processing
 * Replaces localStorage Base64 storage with Supabase Storage
 */
import { supabase } from '../core/supabase-client.js';

const AVATAR_BUCKET = 'avatars';
const JOB_PHOTOS_BUCKET = 'job-photos';

/**
 * Upload an avatar image
 * @param {File} file - Image file
 * @param {string} userId - User UUID
 */
export async function uploadAvatar(file, userId) {
  try {
    const fileExt = file.name.split('.').pop();
    const filePath = `${userId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(filePath);

    return { url: data.publicUrl, error: null };
  } catch (error) {
    console.error('Avatar upload failed:', error);
    return { url: null, error };
  }
}

/**
 * Upload a job photo
 * @param {File} file - Image file
 * @param {string} jobId - Job UUID
 */
export async function uploadJobPhoto(file, jobId) {
  try {
    const fileExt = file.name.split('.').pop();
    const filePath = `${jobId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(JOB_PHOTOS_BUCKET)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from(JOB_PHOTOS_BUCKET)
      .getPublicUrl(filePath);

    return { url: data.publicUrl, error: null };
  } catch (error) {
    console.error('Job photo upload failed:', error);
    return { url: null, error };
  }
}

/**
 * Legacy support: Process image client-side (resizing) before upload
 * Reuse existing logic from ATHImages but adapt for upload
 */
export async function processAndUpload(file, bucket, pathPrefix) {
    // 1. Client-side resize (optional, implementation moved here if needed)
    // 2. Upload to Supabase
    // This is a placeholder for future optimization
    return await uploadAvatar(file, pathPrefix); 
}
