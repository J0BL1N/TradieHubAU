/**
 * storage-api.js - Cloud Storage & Image Processing
 * Replaces localStorage Base64 storage with Supabase Storage
 */
import { supabase } from '../core/supabase-client.js';

const AVATAR_BUCKET = 'avatars';
const JOB_PHOTOS_BUCKET = 'job-photos';

// Expose to window for non-module scripts like script.js
if (typeof window !== 'undefined') {
    window.ATHStorage = {
        uploadAvatar: (f, uid) => uploadAvatar(f, uid),
        uploadJobPhoto: (f, jid) => uploadJobPhoto(f, jid),
        uploadChatAttachment: (f, cid) => uploadChatAttachment(f, cid)
    };
}

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
 * Upload a chat attachment
 * @param {File} file - File object
 * @param {string} conversationId - Conversation UUID
 */
export async function uploadChatAttachment(file, conversationId) {
  try {
    const fileExt = file.name.split('.').pop();
    // Path: conversationId/timestamp-filename
    const filePath = `${conversationId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const bucket = 'chat-attachments';

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // Get signed URL for private bucket (valid for 1 hour)
    // Or public URL if you decided to make it public. 
    // Plan says "chat-attachments" is private.
    const { data, error: urlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days link

    if (urlError) throw urlError;

    return { url: data.signedUrl, path: filePath, error: null };
  } catch (error) {
    console.error('Chat attachment upload failed:', error);
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
