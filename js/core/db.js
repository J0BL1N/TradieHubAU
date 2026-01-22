/**
 * db.js - Centralized Database Access Layer
 * TradieHub - Phase 2 Backend Migration
 * 
 * This module provides a clean API for all database operations,
 * replacing direct localStorage access with Supabase queries.
 */

import { supabase } from './supabase-client.js';

// ============================================================================
// USERS API
// ============================================================================

/**
 * Get user profile by ID
 * @param {string} userId - UUID of user
 * @returns {Promise<{data, error}>}
 */
export async function getUserProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ getUserProfile error:', error.message);
    return { data: null, error };
  }
}

/**
 * Update user profile
 * @param {string} userId - UUID of user
 * @param {object} updates - Fields to update
 * @returns {Promise<{data, error}>}
 */
export async function updateUserProfile(userId, updates) {
  try {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    
    if (error) throw error;
    console.log('✅ Profile updated');
    return { data, error: null };
  } catch (error) {
    console.error('❌ updateUserProfile error:', error.message);
    return { data: null, error };
  }
}

/**
 * Search tradies with filters
 * @param {object} filters - { state, trades, verified, search }
 * @returns {Promise<{data, error}>}
 */
export async function searchTradies(filters = {}) {
  try {
    let query = supabase
      .from('users')
      .select('*')
      .in('role', ['tradie', 'dual'])
      .order('created_at', { ascending: false });
    
    // Apply filters
    if (filters.state) {
      query = query.eq('state', filters.state);
    }
    
    if (filters.trades && filters.trades.length > 0) {
      query = query.contains('trades', filters.trades);
    }
    
    if (filters.verified) {
      query = query.eq('verified', true);
    }
    
    if (filters.search) {
      query = query.ilike('display_name', `%${filters.search}%`);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ searchTradies error:', error.message);
    return { data: [], error };
  }
}

/**
 * Search customers with filters
 * @param {object} filters - { state, search }
 * @returns {Promise<{data, error}>}
 */
export async function searchCustomers(filters = {}) {
  try {
    let query = supabase
      .from('users')
      .select('*')
      .in('role', ['customer', 'dual'])
      .order('created_at', { ascending: false });
    
    if (filters.state) {
      query = query.eq('state', filters.state);
    }
    
    if (filters.search) {
      query = query.ilike('display_name', `%${filters.search}%`);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ searchCustomers error:', error.message);
    return { data: [], error };
  }
}

// ============================================================================
// JOBS API
// ============================================================================

/**
 * Get jobs with optional filters
 * @param {object} filters - { state, categories, urgency, status, customerId }
 * @returns {Promise<{data, error}>}
 */
export async function getJobs(filters = {}) {
  try {
    let query = supabase
      .from('jobs')
      .select(`
        *,
        customer:users!customer_id(id, display_name, avatar_url, suburb, state)
      `)
      .order('created_at', { ascending: false });
    
    // Apply filters
    if (filters.state) {
      query = query.eq('state', filters.state);
    }
    
    if (filters.categories && filters.categories.length > 0) {
      query = query.overlaps('categories', filters.categories);
    }
    
    if (filters.urgency) {
      query = query.eq('urgency', filters.urgency);
    }
    
    if (filters.status) {
      query = query.eq('status', filters.status);
    } else {
      query = query.eq('status', 'open'); // Default to open jobs
    }
    
    if (filters.customerId) {
      query = query.eq('customer_id', filters.customerId);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ getJobs error:', error.message);
    return { data: [], error };
  }
}

/**
 * Get single job by ID
 * @param {string} jobId - UUID of job
 * @returns {Promise<{data, error}>}
 */
export async function getJobById(jobId) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select(`
        *,
        customer:users!customer_id(id, display_name, avatar_url, suburb, state)
      `)
      .eq('id', jobId)
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ getJobById error:', error.message);
    return { data: null, error };
  }
}

/**
 * Create a new job
 * @param {object} jobData - Job fields
 * @returns {Promise<{data, error}>}
 */
export async function createJob(jobData) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .insert([jobData])
      .select()
      .single();
    
    if (error) throw error;
    console.log('✅ Job created:', data.id);
    return { data, error: null };
  } catch (error) {
    console.error('❌ createJob error:', error.message);
    return { data: null, error };
  }
}

/**
 * Update a job
 * @param {string} jobId - UUID of job
 * @param {object} updates - Fields to update
 * @returns {Promise<{data, error}>}
 */
export async function updateJob(jobId, updates) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', jobId)
      .select()
      .single();
    
    if (error) throw error;
    console.log('✅ Job updated:', jobId);
    return { data, error: null };
  } catch (error) {
    console.error('❌ updateJob error:', error.message);
    return { data: null, error };
  }
}

/**
 * Delete a job
 * @param {string} jobId - UUID of job
 * @returns {Promise<{error}>}
 */
export async function deleteJob(jobId) {
  try {
    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', jobId);
    
    if (error) throw error;
    console.log('✅ Job deleted:', jobId);
    return { error: null };
  } catch (error) {
    console.error('❌ deleteJob error:', error.message);
    return { error };
  }
}

// ============================================================================
// CONVERSATIONS & MESSAGES API
// ============================================================================

/**
 * Get all conversations for a user
 * @param {string} userId - UUID of user
 * @returns {Promise<{data, error}>}
 */
export async function getConversations(userId) {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        *,
        user1:users!user1_id(id, display_name, avatar_url),
        user2:users!user2_id(id, display_name, avatar_url)
      `)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ getConversations error:', error.message);
    return { data: [], error };
  }
}

/**
 * Get or create conversation between two users
 * @param {string} user1Id - First user UUID
 * @param {string} user2Id - Second user UUID
 * @param {string} jobId - Optional job UUID
 * @returns {Promise<{data, error}>}
 */
export async function getOrCreateConversation(user1Id, user2Id, jobId = null) {
  try {
    // Check if conversation exists (either direction)
    const { data: existing, error: searchError } = await supabase
      .from('conversations')
      .select('*')
      .or(`and(user1_id.eq.${user1Id},user2_id.eq.${user2Id}),and(user1_id.eq.${user2Id},user2_id.eq.${user1Id})`)
      .single();
    
    if (existing) {
      return { data: existing, error: null };
    }
    
    // Create new conversation
    const { data, error } = await supabase
      .from('conversations')
      .insert([{
        user1_id: user1Id,
        user2_id: user2Id,
        job_id: jobId
      }])
      .select()
      .single();
    
    if (error) throw error;
    console.log('✅ Conversation created:', data.id);
    return { data, error: null };
  } catch (error) {
    console.error('❌ getOrCreateConversation error:', error.message);
    return { data: null, error };
  }
}

/**
 * Get messages for a conversation
 * @param {string} conversationId - UUID of conversation
 * @param {number} limit - Max messages to fetch
 * @returns {Promise<{data, error}>}
 */
export async function getMessages(conversationId, limit = 100) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:users!sender_id(id, display_name, avatar_url)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ getMessages error:', error.message);
    return { data: [], error };
  }
}

/**
 * Send a message
 * @param {string} conversationId - UUID of conversation
 * @param {string} senderId - UUID of sender
 * @param {string} text - Message text
 * @returns {Promise<{data, error}>}
 */
export async function sendMessage(conversationId, senderId, text) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert([{
        conversation_id: conversationId,
        sender_id: senderId,
        text: text
      }])
      .select()
      .single();
    
    if (error) throw error;
    console.log('✅ Message sent');
    return { data, error: null };
  } catch (error) {
    console.error('❌ sendMessage error:', error.message);
    return { data: null, error };
  }
}

/**
 * Mark message as read
 * @param {string} messageId - UUID of message
 * @returns {Promise<{error}>}
 */
export async function markMessageAsRead(messageId) {
  try {
    const { error } = await supabase
      .from('messages')
      .update({ 
        read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', messageId);
    
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('❌ markMessageAsRead error:', error.message);
    return { error };
  }
}

/**
 * Subscribe to new messages in a conversation
 * @param {string} conversationId - UUID of conversation
 * @param {function} callback - Function called when new message arrives
 * @returns {object} Subscription object with unsubscribe method
 */
export function subscribeToMessages(conversationId, callback) {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      },
      (payload) => {
        console.log('📨 New message received');
        callback(payload.new);
      }
    )
    .subscribe();
  
  return channel;
}

// ============================================================================
// REVIEWS API
// ============================================================================

/**
 * Get reviews for a user
 * @param {string} userId - UUID of user
 * @param {boolean} unlockedOnly - Only fetch unlocked reviews
 * @returns {Promise<{data, error}>}
 */
export async function getReviewsForUser(userId, unlockedOnly = true) {
  try {
    let query = supabase
      .from('reviews')
      .select(`
        *,
        reviewer:users!reviewer_id(id, display_name, avatar_url),
        reviewee:users!reviewee_id(id, display_name, avatar_url)
      `)
      .eq('reviewee_id', userId)
      .order('submitted_at', { ascending: false });
    
    if (unlockedOnly) {
      query = query.eq('unlocked', true);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ getReviewsForUser error:', error.message);
    return { data: [], error };
  }
}

/**
 * Submit a review
 * @param {object} reviewData - { job_id, reviewer_id, reviewee_id, rating, text }
 * @returns {Promise<{data, error}>}
 */
export async function submitReview(reviewData) {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .insert([reviewData])
      .select()
      .single();
    
    if (error) throw error;
    console.log('✅ Review submitted');
    return { data, error: null };
  } catch (error) {
    console.error('❌ submitReview error:', error.message);
    return { data: null, error };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check database connection
 * @returns {Promise<boolean>}
 */
export async function checkConnection() {
  try {
    const { error } = await supabase.from('trades').select('id').limit(1);
    if (error) {
      console.error('❌ Database connection failed:', error.message);
      return false;
    }
    console.log('✅ Database connected');
    return true;
  } catch (error) {
    console.error('❌ Database connection error:', error);
    return false;
  }
}

// Export all functions as named exports
export default {
  // Users
  getUserProfile,
  updateUserProfile,
  searchTradies,
  searchCustomers,
  
  // Jobs
  getJobs,
  getJobById,
  createJob,
  updateJob,
  deleteJob,
  
  // Conversations & Messages
  getConversations,
  getOrCreateConversation,
  getMessages,
  sendMessage,
  markMessageAsRead,
  subscribeToMessages,
  
  // Reviews
  getReviewsForUser,
  submitReview,
  
  // Utilities
  checkConnection
};
