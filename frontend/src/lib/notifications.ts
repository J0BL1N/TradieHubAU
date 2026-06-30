import { supabase } from './supabase';

export interface NotificationRecord {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  job_id: string | null;
  conversation_id: string | null;
  read_at: string | null;
  created_at: string;
}

export async function fetchNotifications(limit = 20) {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return { data: (data as NotificationRecord[]) || [], error: null };
  } catch (error: any) {
    console.error('❌ fetchNotifications error:', error.message);
    return { data: [], error };
  }
}

export async function markNotificationRead(notificationId: string) {
  try {
    const { data, error } = await supabase
      .rpc('mark_notification_read', { p_notification_id: notificationId });

    if (error) throw error;
    return { data: data as boolean, error: null };
  } catch (error: any) {
    console.error('❌ markNotificationRead error:', error.message);
    return { data: false, error };
  }
}

export async function markAllNotificationsRead() {
  try {
    const { data, error } = await supabase
      .rpc('mark_all_notifications_read');

    if (error) throw error;
    return { data: data as number, error: null };
  } catch (error: any) {
    console.error('❌ markAllNotificationsRead error:', error.message);
    return { data: 0, error };
  }
}

export async function getUnreadNotificationCount() {
  try {
    const { data, error } = await supabase
      .rpc('get_unread_notification_count');

    if (error) throw error;
    return { data: data as number, error: null };
  } catch (error: any) {
    console.error('❌ getUnreadNotificationCount error:', error.message);
    return { data: 0, error };
  }
}
