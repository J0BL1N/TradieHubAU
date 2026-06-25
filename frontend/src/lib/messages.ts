import { supabase } from './supabase';
import { getPublicProfilesByIds } from './users';

export interface MessageRecord {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  read: boolean;
  read_at: string | null;
  created_at: string;
  attachments?: MessageAttachment[];
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  conversation_id: string;
  job_id: string;
  uploader_id: string;
  bucket_id: 'message_attachments';
  storage_path: string;
  file_name: string;
  mime_type: 'image/jpeg' | 'image/jpg' | 'image/png' | 'image/webp';
  file_size: number;
  width: number | null;
  height: number | null;
  created_at: string;
  signed_url?: string;
}

export interface MessageAttachmentInput {
  storage_path: string;
  file_name: string;
  mime_type: MessageAttachment['mime_type'];
  file_size: number;
  width?: number | null;
  height?: number | null;
}

export interface ConversationSummary {
  id: string;
  job_id: string;
  job_title: string;
  job_status: string;
  payment_status: string;
  user1_id: string;
  user2_id: string;
  last_message_text: string | null;
  last_message_at: string | null;
  last_message_from: string | null;
  unread_count: number;
  created_at: string;
  counterpart: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

export async function getJobConversations(currentUserId: string) {
  const { data, error } = await supabase.rpc('list_job_conversations');
  if (error || !data) return { data: [] as ConversationSummary[], error };

  const rows = data as Omit<ConversationSummary, 'counterpart'>[];
  const counterpartIds = rows.map(row => row.user1_id === currentUserId ? row.user2_id : row.user1_id);
  const { data: profiles, error: profileError } = await getPublicProfilesByIds(counterpartIds);
  if (profileError) return { data: [] as ConversationSummary[], error: profileError };

  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));
  return {
    data: rows.map(row => {
      const counterpartId = row.user1_id === currentUserId ? row.user2_id : row.user1_id;
      const profile = profilesById.get(counterpartId);
      return {
        ...row,
        unread_count: Number(row.unread_count || 0),
        counterpart: profile ? {
          id: profile.id,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
        } : null,
      };
    }),
    error: null,
  };
}

export async function openJobConversation(jobId: string) {
  const { data, error } = await supabase.rpc('open_job_conversation', { p_job_id: jobId });
  return { data: data as string | null, error };
}

export async function getConversationMessages(conversationId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, text, read, read_at, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error || !data) return { data: [] as MessageRecord[], error };

  const messages = data as MessageRecord[];
  const { data: attachments, error: attachmentsError } = await getMessageAttachmentsForMessages(messages.map(message => message.id));
  if (attachmentsError) return { data: [] as MessageRecord[], error: attachmentsError };

  const attachmentsByMessage = new Map<string, MessageAttachment[]>();
  attachments.forEach(attachment => {
    const current = attachmentsByMessage.get(attachment.message_id) || [];
    current.push(attachment);
    attachmentsByMessage.set(attachment.message_id, current);
  });

  return {
    data: messages.map(message => ({
      ...message,
      attachments: attachmentsByMessage.get(message.id) || [],
    })),
    error: null,
  };
}

export async function sendJobMessage(conversationId: string, text: string) {
  const { data, error } = await supabase.rpc('send_job_message', {
    p_conversation_id: conversationId,
    p_text: text,
  });
  return { data: data as string | null, error };
}

export async function sendJobMessageWithAttachments(
  messageId: string,
  conversationId: string,
  text: string,
  attachments: MessageAttachmentInput[]
) {
  const { data, error } = await supabase.rpc('send_job_message_with_attachments', {
    p_message_id: messageId,
    p_conversation_id: conversationId,
    p_text: text,
    p_attachments: attachments,
  });

  return { data: (Array.isArray(data) ? data[0] : data) as MessageRecord | null, error };
}

export async function getMessageAttachmentsForMessages(messageIds: string[]) {
  if (messageIds.length === 0) return { data: [] as MessageAttachment[], error: null };

  const { data, error } = await supabase
    .from('message_attachments')
    .select('id, message_id, conversation_id, job_id, uploader_id, bucket_id, storage_path, file_name, mime_type, file_size, width, height, created_at')
    .in('message_id', messageIds)
    .order('created_at', { ascending: true });

  if (error || !data) return { data: [] as MessageAttachment[], error };

  const attachments = data as MessageAttachment[];
  const { data: signedData, error: signedError } = await supabase.storage
    .from('message_attachments')
    .createSignedUrls(attachments.map(attachment => attachment.storage_path), 3600);

  if (signedError) return { data: [] as MessageAttachment[], error: signedError };

  const signedUrlByPath = new Map(
    (signedData || []).map(item => [item.path, item.signedUrl])
  );

  return {
    data: attachments.map(attachment => ({
      ...attachment,
      signed_url: signedUrlByPath.get(attachment.storage_path) || undefined,
    })),
    error: null,
  };
}

export async function markIncomingMessagesRead(conversationId: string, currentUserId: string) {
  const { error } = await supabase
    .from('messages')
    .update({ read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', currentUserId)
    .eq('read', false);

  return { error };
}
