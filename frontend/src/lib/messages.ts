import { supabase } from './supabase';
import { getPublicProfilesByIds } from './users';

export interface MessageRecord {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  text: string;
  read: boolean;
  read_at: string | null;
  created_at: string;
  message_type: 'user' | 'system';
  system_event_type: string | null;
  metadata: Record<string, unknown>;
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

export interface MessageJobDetails {
  job: {
    id: string;
    customer_id: string;
    title: string;
    description: string;
    location: string;
    suburb: string | null;
    state: string;
    region: string | null;
    postcode: string | null;
    location_label: string | null;
    budget_min: number | null;
    budget_max: number | null;
    timeline: string | null;
    urgency: string | null;
    type: string | null;
    status: string;
    quotes_count: number;
    created_at: string;
    updated_at: string;
  };
  payment: {
    id: string;
    amount: number;
    platform_fee: number;
    status: string;
    payer_id: string;
    payee_id: string;
    created_at: string;
    updated_at: string;
  } | null;
  customer: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    suburb: string | null;
    state: string | null;
  } | null;
  tradie: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    suburb: string | null;
    state: string | null;
  } | null;
}

export interface MessagePageOptions {
  limit?: number;
  before?: {
    created_at: string;
    id: string;
  };
}

export interface MessagePageResult {
  messages: MessageRecord[];
  hasMore: boolean;
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

export async function getMessageJobDetails(jobId: string) {
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, customer_id, title, description, location, suburb, state, region, postcode, location_label, budget_min, budget_max, timeline, urgency, type, status, quotes_count, created_at, updated_at')
    .eq('id', jobId)
    .maybeSingle();

  if (jobError || !job) {
    return { data: null as MessageJobDetails | null, error: jobError || new Error('Job details could not be loaded.') };
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('id, amount, platform_fee, status, payer_id, payee_id, created_at, updated_at')
    .eq('job_id', jobId)
    .maybeSingle();

  if (paymentError) {
    return { data: null as MessageJobDetails | null, error: paymentError };
  }

  const participantIds = [job.customer_id, payment?.payee_id].filter(Boolean) as string[];
  const { data: profiles, error: profileError } = await getPublicProfilesByIds(participantIds);
  if (profileError) {
    return { data: null as MessageJobDetails | null, error: profileError };
  }

  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));
  const customer = profilesById.get(job.customer_id);
  const tradie = payment?.payee_id ? profilesById.get(payment.payee_id) : undefined;

  return {
    data: {
      job: job as MessageJobDetails['job'],
      payment: payment as MessageJobDetails['payment'],
      customer: customer ? {
        id: customer.id,
        display_name: customer.display_name,
        avatar_url: customer.avatar_url,
        suburb: customer.suburb,
        state: customer.state,
      } : null,
      tradie: tradie ? {
        id: tradie.id,
        display_name: tradie.display_name,
        avatar_url: tradie.avatar_url,
        suburb: tradie.suburb,
        state: tradie.state,
      } : null,
    },
    error: null,
  };
}

export async function openJobConversation(jobId: string) {
  const { data, error } = await supabase.rpc('open_job_conversation', { p_job_id: jobId });
  return { data: data as string | null, error };
}

export async function getConversationMessages(conversationId: string, options: MessagePageOptions = {}) {
  const pageSize = options.limit || 10;
  let query = supabase
    .from('messages')
    .select('id, conversation_id, sender_id, text, read, read_at, created_at, message_type, system_event_type, metadata')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize + 1);

  if (options.before) {
    query = query.or(`created_at.lt.${options.before.created_at},and(created_at.eq.${options.before.created_at},id.lt.${options.before.id})`);
  }

  const { data, error } = await query;

  if (error || !data) return { data: { messages: [], hasMore: false } as MessagePageResult, error };

  const rows = data as MessageRecord[];
  const hasMore = rows.length > pageSize;
  const messages = rows.slice(0, pageSize).reverse();
  const { data: attachments, error: attachmentsError } = await getMessageAttachmentsForMessages(messages.map(message => message.id));
  if (attachmentsError) return { data: { messages: [], hasMore: false } as MessagePageResult, error: attachmentsError };

  const attachmentsByMessage = new Map<string, MessageAttachment[]>();
  attachments.forEach(attachment => {
    const current = attachmentsByMessage.get(attachment.message_id) || [];
    current.push(attachment);
    attachmentsByMessage.set(attachment.message_id, current);
  });

  return {
    data: {
      messages: messages
        .filter(message => !message.metadata || (message.metadata as any).blocked !== true)
        .map(message => ({
          ...message,
          attachments: attachmentsByMessage.get(message.id) || [],
        })),
      hasMore,
    },
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
  const validMessageIds = messageIds.filter(Boolean);
  if (validMessageIds.length === 0) return { data: [] as MessageAttachment[], error: null };

  const { data, error } = await supabase
    .from('message_attachments')
    .select('id, message_id, conversation_id, job_id, uploader_id, bucket_id, storage_path, file_name, mime_type, file_size, width, height, created_at')
    .in('message_id', validMessageIds)
    .order('created_at', { ascending: true });

  if (error || !data) return { data: [] as MessageAttachment[], error };

  const attachments = data as MessageAttachment[];
  const validPaths = attachments
    .map(attachment => attachment.storage_path)
    .filter((path): path is string => typeof path === 'string' && path.trim().length > 0);

  if (validPaths.length === 0) {
    return {
      data: attachments.map(attachment => ({ ...attachment, signed_url: undefined })),
      error: null,
    };
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from('message_attachments')
    .createSignedUrls(validPaths, 3600);

  if (signedError) {
    return {
      data: [] as MessageAttachment[],
      error: new Error('Could not load message attachments. Please try refreshing.'),
    };
  }

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
    .eq('message_type', 'user')
    .neq('sender_id', currentUserId)
    .eq('read', false);

  return { error };
}
