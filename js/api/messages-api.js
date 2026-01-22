/**
 * messages-api.js - Messages data layer
 * Handles real-time messaging using Supabase
 */
import db from '../core/db.js';
import { getCurrentUser } from '../core/supabase-client.js';

// Currently active subscription
let messageSubscription = null;

export async function getConversations() {
  const { user } = await getCurrentUser();
  if (!user) return { data: [], error: 'Not logged in' };

  const { data, error } = await db.getConversations(user.id);
  
  if (error) return { data: [], error };
  
  // Map to UI format if needed
  // db.js joins return nested objects: user1: { display_name, ... }
  return { 
    conversations: data.map(c => {
      const otherUser = c.user1_id === user.id ? c.user2 : c.user1;
      return {
        id: c.id,
        otherUser: {
          id: otherUser.id,
          name: otherUser.display_name,
          avatar: otherUser.avatar_url || 'https://static.photos/people/320x240/301'
        },
        lastMessage: c.last_message_text,
        lastMessageAt: c.last_message_at,
        isRead: c.last_message_from === user.id ? true : false, // Simplified read logic
        jobId: c.job_id
      };
    }), 
    error: null 
  };
}

export async function getThreadMessages(conversationId) {
  const { data, error } = await db.getMessages(conversationId);
  if (error) return { messages: [], error };

  return {
    messages: data.map(m => ({
      id: m.id,
      text: m.text,
      senderId: m.sender_id,
      createdAt: m.created_at,
      read: m.read
    })),
    error: null
  };
}

export async function sendMessage(conversationId, text) {
  const { user } = await getCurrentUser();
  if (!user) return { error: 'Not logged in' };

  return await db.sendMessage(conversationId, user.id, text);
}

export function subscribeToConversation(conversationId, onMessage) {
  // Unsubscribe previous if exists
  if (messageSubscription) {
    messageSubscription.unsubscribe();
  }

  messageSubscription = db.subscribeToMessages(conversationId, (newMessage) => {
    onMessage({
      id: newMessage.id,
      text: newMessage.text,
      senderId: newMessage.sender_id,
      createdAt: newMessage.created_at
    });
  });
  
  return messageSubscription;
}

export function unsubscribe() {
  if (messageSubscription) {
    messageSubscription.unsubscribe();
    messageSubscription = null;
  }
}
