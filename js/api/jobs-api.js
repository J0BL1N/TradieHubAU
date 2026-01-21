/**
 * jobs-api.js - Supabase Jobs Database API
 * Replaces static JOBS array with real database operations
 */

import { supabase } from './supabase-client.js';

// ============================================================================
// JOB QUERIES
// ============================================================================

/**
 * Get all jobs with optional filters
 * @param {object} filters - { state, categories[], urgency, status }
 * @returns {Promise<{jobs, error}>}
 */
export async function getJobs(filters = {}) {
  try {
    let query = supabase
      .from('jobs')
      .select(`
        *,
        customer:users!customer_id (
          id,
          display_name,
          avatar_url,
          suburb,
          state
        )
      `)
      .order('created_at', { ascending: false });
    
    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    } else {
      query = query.eq('status', 'open'); // Default to open jobs
    }
    
    if (filters.state) {
      query = query.eq('state', filters.state);
    }
    
    if (filters.categories && filters.categories.length > 0) {
      query = query.overlaps('categories', filters.categories);
    }
    
    if (filters.urgency) {
      query = query.eq('urgency', filters.urgency);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    console.log(`✅ Retrieved ${data.length} jobs`);
    return { jobs: data, error: null };
  } catch (error) {
    console.error('❌ Get jobs error:', error.message);
    return { jobs: [], error };
  }
}

/**
 * Get a single job by ID
 * @param {string} jobId 
 * @returns {Promise<{job, error}>}
 */
export async function getJob(jobId) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select(`
        *,
        customer:users!customer_id (
          id,
          display_name,
          avatar_url,
          phone,
          email,
          suburb,
          state
        )
      `)
      .eq('id', jobId)
      .single();
    
    if (error) throw error;
    
    console.log('✅ Retrieved job:', data.title);
    return { job: data, error: null };
  } catch (error) {
    console.error('❌ Get job error:', error.message);
    return { job: null, error };
  }
}

/**
 * Create a new job posting
 * @param {object} jobData 
 * @returns {Promise<{job, error}>}
 */
export async function createJob(jobData) {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('You must be signed in to post a job');
    }
    
    // Prepare job data
    const newJob = {
      customer_id: user.id,
      title: jobData.title,
      description: jobData.description,
      categories: jobData.categories || [],
      location: jobData.location,
      state: jobData.state,
      budget_min: jobData.budgetMin || null,
      budget_max: jobData.budgetMax || null,
      timeline: jobData.timeline || null,
      urgency: jobData.urgency || 'flexible',
      type: jobData.type || 'one-off',
      status: 'open',
      quotes_count: 0
    };
    
    const { data, error } = await supabase
      .from('jobs')
      .insert([newJob])
      .select()
      .single();
    
    if (error) throw error;
    
    console.log('✅ Job created:', data.title);
    
    // Show success toast
    if (window.ATHToast) {
      window.ATHToast.show({
        type: 'success',
        message: 'Job posted successfully!',
        duration: 3000
      });
    }
    
    return { job: data, error: null };
  } catch (error) {
    console.error('❌ Create job error:', error.message);
    
    // Show error toast
    if (window.ATHToast) {
      window.ATHToast.show({
        type: 'error',
        message: error.message,
        duration: 4000
      });
    }
    
    return { job: null, error };
  }
}

/**
 * Update an existing job
 * @param {string} jobId 
 * @param {object} updates 
 * @returns {Promise<{job, error}>}
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
    
    console.log('✅ Job updated:', data.title);
    return { job: data, error: null };
  } catch (error) {
    console.error('❌ Update job error:', error.message);
    return { job: null, error };
  }
}

/**
 * Delete a job
 * @param {string} jobId 
 * @returns {Promise<{error}>}
 */
export async function deleteJob(jobId) {
  try {
    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', jobId);
    
    if (error) throw error;
    
    console.log('✅ Job deleted');
    return { error: null };
  } catch (error) {
    console.error('❌ Delete job error:', error.message);
    return { error };
  }
}

/**
 * Get jobs posted by current user
 * @returns {Promise<{jobs, error}>}
 */
export async function getMyJobs() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { jobs: [], error: new Error('Not signed in') };
    }
    
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    console.log(`✅ Retrieved ${data.length} of your jobs`);
    return { jobs: data, error: null };
  } catch (error) {
    console.error('❌ Get my jobs error:', error.message);
    return { jobs: [], error };
  }
}

/**
 * Search jobs by text
 * @param {string} searchText 
 * @returns {Promise<{jobs, error}>}
 */
export async function searchJobs(searchText) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select(`
        *,
        customer:users!customer_id (
          id,
          display_name,
          avatar_url,
          suburb,
          state
        )
      `)
      .eq('status', 'open')
      .or(`title.ilike.%${searchText}%,description.ilike.%${searchText}%`)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    console.log(`✅ Found ${data.length} jobs matching "${searchText}"`);
    return { jobs: data, error: null };
  } catch (error) {
    console.error('❌ Search jobs error:', error.message);
    return { jobs: [], error };
  }
}

// ============================================================================
// SEED DEMO DATA (for testing)
// ============================================================================

/**
 * Seed database with demo jobs
 * Only run this once to populate the database
 */
export async function seedDemoJobs() {
  const demoJobs = [
    {
      title: 'Bathroom Renovation',
      description: 'Full bathroom remodel including tiling, plumbing, and electrical work. Need completion within 2–3 weeks.',
      categories: ['plumbing', 'electrical', 'tiling'],
      location: 'Sydney, NSW',
      state: 'NSW',
      budget_min: 8000,
      budget_max: 12000,
      timeline: '2–3 weeks',
      urgency: 'urgent',
      type: 'contract'
    },
    {
      title: 'Kitchen Cabinet Installation',
      description: 'Install new kitchen cabinets and benchtop. Cabinets are already purchased.',
      categories: ['carpentry'],
      location: 'Melbourne, VIC',
      state: 'VIC',
      budget_min: 3000,
      budget_max: 5000,
      timeline: '1 week',
      urgency: 'week',
      type: 'one-off'
    },
    {
      title: 'Exterior House Painting',
      description: 'Full exterior house painting. Two-story home, approximately 200m².',
      categories: ['painting'],
      location: 'Brisbane, QLD',
      state: 'QLD',
      budget_min: 6000,
      budget_max: 9000,
      timeline: '2 weeks',
      urgency: 'flexible',
      type: 'contract'
    },
    {
      title: 'Electrical Safety Inspection',
      description: 'Need licensed electrician for safety inspection before property sale.',
      categories: ['electrical'],
      location: 'Perth, WA',
      state: 'WA',
      budget_min: 200,
      budget_max: 400,
      timeline: 'ASAP',
      urgency: 'urgent',
      type: 'one-off'
    },
    {
      title: 'Garden Landscaping',
      description: 'Front and back yard landscaping including lawn, plants, and garden beds.',
      categories: ['gardening'],
      location: 'Adelaide, SA',
      state: 'SA',
      budget_min: 4000,
      budget_max: 7000,
      timeline: '3–4 weeks',
      urgency: 'flexible',
      type: 'contract'
    }
  ];
  
  try {
    const {data: { user }} = await supabase.auth.getUser();
    
    if (!user) {
      console.error('❌ Must be signed in to seed jobs');
      return { error: new Error('Not authenticated') };
    }
    
    // Add customer_id to all demo jobs
    const jobsWithCustomer = demoJobs.map(job => ({
      ...job,
      customer_id: user.id,
      status: 'open',
      quotes_count: 0
    }));
    
    const { data, error } = await supabase
      .from('jobs')
      .insert(jobsWithCustomer)
      .select();
    
    if (error) throw error;
    
    console.log(`✅ Seeded ${data.length} demo jobs`);
    
    if (window.ATHToast) {
      window.ATHToast.show({
        type: 'success',
        message: `Created ${data.length} demo jobs!`,
        duration: 3000
      });
    }
    
    return { jobs: data, error: null };
  } catch (error) {
    console.error('❌ Seed jobs error:', error.message);
    return { jobs: [], error };
  }
}

// Export for use in browser console
window.seedDemoJobs = seedDemoJobs;
