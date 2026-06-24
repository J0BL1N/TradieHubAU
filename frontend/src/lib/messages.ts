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

  return { data: (data as MessageRecord[]) || [], error };
}

export async function sendJobMessage(conversationId: string, text: string) {
  const { data, error } = await supabase.rpc('send_job_message', {
    p_conversation_id: conversationId,
    p_text: text,
  });
  return { data: data as string | null, error };
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
