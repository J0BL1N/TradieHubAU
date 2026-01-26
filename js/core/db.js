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
      // Search both suburb and state for better UX
      query = query.or(`suburb.ilike.%${filters.state}%,state.ilike.%${filters.state}%`);
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
      query = query.or(`suburb.ilike.%${filters.state}%,state.ilike.%${filters.state}%`);
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
        customer:users!customer_id(id, display_name, avatar_url, suburb, state),
        proposals:proposals(count)
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
 * Get jobs for a specific tradie (via accepted proposals)
 * @param {string} tradieId 
 * @returns {Promise<{data, error}>}
 */
export async function getJobsForTradie(tradieId) {
  try {
    const { data: proposals, error: propError } = await supabase
      .from('proposals')
      .select('job_id, status')
      .eq('tradie_id', tradieId)
      .in('status', ['accepted', 'completed']); 
      
    if (propError) throw propError;
    
    if (!proposals || proposals.length === 0) return { data: [], error: null };
    
    const jobIds = proposals.map(p => p.job_id);
    
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('*')
      .in('id', jobIds)
      .order('created_at', { ascending: false });
      
    if (jobsError) throw jobsError;
    
    return { data: jobs, error: null };
  } catch (err) {
    console.error('❌ getJobsForTradie error:', err);
    return { data: [], error: err };
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
      .select();
    
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
// PROPOSALS API
// ============================================================================

/**
 * Get proposals for a specific job
 * @param {string} jobId 
 * @returns {Promise<{data, error}>}
 */
export async function getProposalsForJob(jobId) {
  try {
    const { data, error } = await supabase
      .from('proposals')
      .select(`
        *,
        tradie:users!tradie_id(id, display_name, avatar_url, trades)
      `)
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ getProposalsForJob error:', error.message);
    return { data: [], error };
  }
}

/**
 * Get a single proposal by ID
 * @param {string} proposalId 
 * @returns {Promise<{data, error}>}
 */
export async function getProposalById(proposalId) {
  try {
    const { data, error } = await supabase
      .from('proposals')
      .select(`
        *,
        job:jobs(*),
        tradie:users!tradie_id(id, display_name, avatar_url, trades)
      `)
      .eq('id', proposalId)
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ getProposalById error:', error.message);
    return { data: null, error };
  }
}

/**
 * Create a proposal (Quote)
 * @param {object} proposalData - { job_id, tradie_id, price, cover_letter, status }
 * @returns {Promise<{data, error}>}
 */
export async function createProposal(proposalData) {
  try {
    const { data, error } = await supabase
      .from('proposals')
      .insert([proposalData])
      .select()
      .single();
    
    if (error) throw error;
    console.log('✅ Proposal created:', data.id);

    // v0.103: Increment quotes_count on the job record
    const { data: jobRecord } = await supabase.from('jobs').select('quotes_count').eq('id', proposalData.job_id).single();
    if (jobRecord) {
        await supabase.from('jobs').update({ quotes_count: (jobRecord.quotes_count || 0) + 1 }).eq('id', proposalData.job_id);
    }

    return { data, error: null };
  } catch (error) {
    console.error('❌ createProposal error:', error.message);
    return { data: null, error };
  }
}

/**
 * Update proposal status (e.g. 'accepted', 'rejected')
 * @param {string} proposalId 
 * @param {string} status 
 * @returns {Promise<{data, error}>}
 */
export async function updateProposalStatus(proposalId, status) {
  try {
    const { data, error } = await supabase
      .from('proposals')
      .update({ status })
      .eq('id', proposalId)
      .select();
    
    if (error) throw error;
    console.log('✅ Proposal status updated:', status);
    return { data, error: null };
  } catch (error) {
    console.error('❌ updateProposalStatus error:', error.message);
    return { data: null, error };
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
        user2:users!user2_id(id, display_name, avatar_url),
        job:jobs(title)
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
 * @param {string} type - Message type (text, invoice, system)
 * @param {object} meta - Metadata (invoice_id, job_id, etc.)
 * @returns {Promise<{data, error}>}
 */
export async function sendMessage(conversationId, senderId, text, type = 'text', meta = {}) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert([{
        conversation_id: conversationId,
        sender_id: senderId,
        text: text,
        type: type,
        meta: meta
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
// ONGOING JOBS & ASSIGNMENTS API
// ============================================================================

/**
 * Update job assignment status
 * @param {string} jobId 
 * @param {string} status 
 */
export async function updateJobAssignmentStatus(jobId, status) {
  try {
    const { data, error } = await supabase
      .from('job_assignments')
      .update({ status })
      .eq('job_id', jobId)
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ updateJobAssignmentStatus error:', error.message);
    return { data: null, error };
  }
}

/**
 * Create a job assignment record (marking job as active/assigned)
 * @param {object} assignmentData - { job_id, customer_id, tradie_id, accepted_quote_id }
 * @returns {Promise<{data, error}>}
 */
export async function createJobAssignment(assignmentData) {
  try {
    const { data, error } = await supabase
      .from('job_assignments')
      .upsert([assignmentData], { onConflict: 'job_id' })
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ createJobAssignment error:', error.message);
    return { data: null, error };
  }
}

/**
 * Get job assignment by job ID
 * @param {string} jobId 
 * @returns {Promise<{data, error}>}
 */
export async function getJobAssignment(jobId) {
  try {
    const { data, error } = await supabase
      .from('job_assignments')
      .select(`
        *,
        customer:users!customer_id(id, display_name, avatar_url),
        tradie:users!tradie_id(id, display_name, avatar_url),
        quote:proposals!accepted_quote_id(*)
      `)
      .eq('job_id', jobId)
      .maybeSingle();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ getJobAssignment error:', error.message);
    return { data: null, error };
  }
}

/**
 * Upsert mapping between conversation and job
 * @param {string} conversationId 
 * @param {string} jobId 
 */
export async function upsertConversationJob(conversationId, jobId) {
    try {
        const { data, error } = await supabase
            .from('conversation_jobs')
            .upsert([{ conversation_id: conversationId, job_id: jobId }], { onConflict: 'conversation_id, job_id' })
            .select()
            .single();
        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('❌ upsertConversationJob error:', error.message);
        return { data: null, error };
    }
}

/**
 * Get linked job for a conversation
 * @param {string} conversationId 
 */
export async function getLinkedJobForConversation(conversationId) {
    try {
        const { data, error } = await supabase
            .from('conversation_jobs')
            .select(`
                job:jobs(
                    *,
                    assignment:job_assignments(*),
                    invoices:invoices(status),
                    variations:job_variations(status)
                )
            `)
            .eq('conversation_id', conversationId)
            .maybeSingle();
        if (error) throw error;
        return { data: data?.job, error: null };
    } catch (error) {
        console.error('❌ getLinkedJobForConversation error:', error.message);
        return { data: null, error };
    }
}

/**
 * Get invoices for a specific job
 * @param {string} jobId 
 * @returns {Promise<{data, error}>}
 */
export async function getInvoicesForJob(jobId) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        items:invoice_items(*)
      `)
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ getInvoicesForJob error:', error.message);
    return { data: [], error };
  }
}

/**
 * Create a new invoice draft
 * @param {object} invoiceData 
 * @param {array} items 
 * @returns {Promise<{data, error}>}
 */
export async function createInvoice(invoiceData, items = []) {
  try {
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .insert([invoiceData])
      .select()
      .single();
    
    if (invError) throw invError;

    if (items.length > 0) {
      const itemsWithId = items.map(item => ({ ...item, invoice_id: invoice.id }));
      const { error: itemError } = await supabase.from('invoice_items').insert(itemsWithId);
      if (itemError) throw itemError;
    }

    return { data: invoice, error: null };
  } catch (error) {
    console.error('❌ createInvoice error:', error.message);
    return { data: null, error };
  }
}

/**
 * Update invoice and its items
 * @param {string} invoiceId 
 * @param {object} updates 
 * @param {array} items 
 * @returns {Promise<{data, error}>}
 */
export async function updateInvoice(invoiceId, updates = {}, items = []) {
  try {
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', invoiceId)
      .select()
      .single();
    
    if (invError) throw invError;

    if (items.length > 0) {
      // For simplicity in MVP, we delete and re-insert items for drafts
      if (invoice.status === 'draft') {
        await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);
        const itemsWithId = items.map(item => ({ ...item, invoice_id: invoiceId }));
        const { error: itemError } = await supabase.from('invoice_items').insert(itemsWithId);
        if (itemError) throw itemError;
      }
    }

    return { data: invoice, error: null };
  } catch (error) {
    console.error('❌ updateInvoice error:', error.message);
    return { data: null, error };
  }
}

// ============================================================================
// JOB EVENTS API
// ============================================================================

/**
 * Log a job event to the timeline
 * @param {string} jobId 
 * @param {string} type 
 * @param {object} payload 
 * @param {string} actorId 
 * @returns {Promise<{data, error}>}
 */
export async function logJobEvent(jobId, type, actorId, payload = {}) {
  try {
    const { data, error } = await supabase
      .from('job_events')
      .insert([{
        job_id: jobId,
        type,
        actor_id: actorId,
        payload
      }]);
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ logJobEvent error:', error.message);
    return { data: null, error };
  }
}

/**
 * Get timeline events for a job
 * @param {string} jobId 
 * @returns {Promise<{data, error}>}
 */
export async function getJobEvents(jobId) {
  try {
    const { data, error } = await supabase
      .from('job_events')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ getJobEvents error:', error.message);
    return { data: [], error };
  }
}

// ============================================================================
// JOB VARIATIONS API
// ============================================================================

/**
 * Get variations for a job
 * @param {string} jobId 
 * @returns {Promise<{data, error}>}
 */
export async function getVariationsForJob(jobId) {
  try {
    const { data, error } = await supabase
      .from('job_variations')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ getVariationsForJob error:', error.message);
    return { data: [], error };
  }
}

/**
 * Create a variation request
 * @param {object} variationData - { job_id, tradie_id, customer_id, title, description, amount, time_impact_days }
 * @returns {Promise<{data, error}>}
 */
export async function createVariation(variationData) {
  try {
    const { data, error } = await supabase
      .from('job_variations')
      .insert([variationData])
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ createVariation error:', error.message);
    return { data: null, error };
  }
}

/**
 * Update variation status
 * @param {string} variationId 
 * @param {string} status 
 * @param {string} reason 
 * @returns {Promise<{data, error}>}
 */
export async function updateVariationStatus(variationId, status, reason = null) {
  try {
    const updates = { status, decided_at: new Date().toISOString() };
    if (reason) updates.decision_reason = reason;

    const { data, error } = await supabase
      .from('job_variations')
      .update(updates)
      .eq('id', variationId)
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ updateVariationStatus error:', error.message);
    return { data: null, error };
  }
}

// ============================================================================
// DISPUTES API
// ============================================================================

/**
 * Get disputes for a job (usually only one active)
 * @param {string} jobId 
 * @returns {Promise<{data, error}>}
 */
export async function getDisputesForJob(jobId) {
  try {
    const { data, error } = await supabase
      .from('disputes')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ getDisputesForJob error:', error.message);
    return { data: [], error };
  }
}

/**
 * Create a dispute
 * @param {object} disputeData - { job_id, opened_by, against_party, reason, description, evidence_urls }
 * @returns {Promise<{data, error}>}
 */
export async function createDispute(disputeData) {
  try {
    const { data, error } = await supabase
      .from('disputes')
      .insert([disputeData])
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ createDispute error:', error.message);
    return { data: null, error };
  }
}

/**
 * Update dispute status
 * @param {string} disputeId 
 * @param {string} status 
 * @param {string} resolutionNotes 
 * @returns {Promise<{data, error}>}
 */
export async function updateDisputeStatus(disputeId, status, resolutionNotes = null) {
  try {
    const updates = { status };
    if (status.startsWith('resolved')) updates.resolved_at = new Date().toISOString();
    if (resolutionNotes) updates.resolution_notes = resolutionNotes;

    const { data, error } = await supabase
      .from('disputes')
      .update(updates)
      .eq('id', disputeId)
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('❌ updateDisputeStatus error:', error.message);
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
  getJobsForTradie,
  getJobById,
  createJob,
  updateJob,
  deleteJob,

  // Proposals
  getProposalsForJob,
  getProposalById,
  createProposal,
  updateProposalStatus,
  
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

  // Ongoing Jobs & Invoicing
  createJobAssignment,
  updateJobAssignmentStatus,
  getJobAssignment,
  upsertConversationJob,
  getLinkedJobForConversation,
  getInvoicesForJob,
  createInvoice,
  updateInvoice,
  logJobEvent,
  getJobEvents,
  
  // Variations
  getVariationsForJob,
  createVariation,
  updateVariationStatus,

  // Disputes
  getDisputesForJob,
  createDispute,
  updateDisputeStatus,

  // Utilities
  checkConnection
};

// Expose to window for non-module scripts
if (typeof window !== 'undefined') {
    window.ATHDB = {
        getUserProfile,
        updateUserProfile,
        searchTradies,
        searchCustomers,
        getJobs,
        getJobById,
        createJob,
        updateJob,
        deleteJob,
        getProposalsForJob,
        getProposalById,
        createProposal,
        updateProposalStatus,
        getConversations,
        getOrCreateConversation,
        getMessages,
        sendMessage,
        markMessageAsRead,
        subscribeToMessages,
        getReviewsForUser,
        submitReview,
        createJobAssignment,
        updateJobAssignmentStatus,
        getJobAssignment,
        upsertConversationJob,
        getLinkedJobForConversation,
        getInvoicesForJob,
        createInvoice,
        updateInvoice,
        logJobEvent,
        getJobEvents,
        getVariationsForJob,
        createVariation,
        updateVariationStatus,
        getDisputesForJob,
        createDispute,
        updateDisputeStatus,
        checkConnection
    };
}
