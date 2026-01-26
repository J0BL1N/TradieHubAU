/**
 * jobs-api.js - Jobs data layer
 * Bridges the gap between UI and db.js layer
 */
import db from '../core/db.js';
import { supabase, getCurrentUser } from '../core/supabase-client.js';

/**
 * Fetch jobs and map to legacy format for UI compatibility
 * @param {object} filters 
 */
export async function getJobs(filters = {}) {
  const { data, error } = await db.getJobs(filters);
  
  if (error) {
    return { jobs: [], error };
  }
  
  // Transform Supabase format to UI format if needed
  // db.js already does most of the heavy lifting with its join queries
  return { jobs: data, error: null };
}

/**
 * Create a new job
 * @param {object} jobData 
 */
export async function createJob(jobData) {
  return await db.createJob(jobData);
}

/**
 * Seed demo jobs if database is empty
 */
export async function seedDemoJobs() {
  const { user } = await getCurrentUser();
  if (!user) {
    console.error('Must be logged in to seed jobs');
    return { jobs: [], error: 'Not logged in' };
  }
  
  // Get existing jobs to check if empty
  const { data: existing } = await db.getJobs();
  if (existing.length > 5) {
    console.log('Database already has jobs, skipping seed');
    return { jobs: existing, error: null };
  }

  // Demo jobs to insert
  const demoJobs = [
    {
      title: 'Bathroom Renovation',
      description: 'Full bathroom remodel including tiling, plumbing, and electrical work.',
      categories: ['plumbing', 'electrical', 'tiling'],
      location: 'Sydney, NSW',
      state: 'NSW',
      budget_min: 8000,
      budget_max: 12000,
      timeline: '2–3 weeks',
      urgency: 'urgent',
      type: 'contract',
      status: 'open',
      customer_id: user.id
    },
    {
      title: 'Office Electrical Upgrade',
      description: 'Commercial electrical work for 10 office units.',
      categories: ['electrical'],
      location: 'Melbourne, VIC',
      state: 'VIC',
      budget_min: 15000,
      budget_max: 25000,
      timeline: 'Flexible',
      urgency: 'week',
      type: 'contract',
      status: 'open',
      customer_id: user.id
    },
    {
      title: 'Deck Construction',
      description: 'Build a 6x4m timber deck with stairs and railing.',
      categories: ['carpentry'],
      location: 'Brisbane, QLD',
      state: 'QLD',
      budget_min: 3500,
      budget_max: 5000,
      timeline: '2 weeks',
      urgency: 'flexible',
      type: 'one-off',
      status: 'open',
      customer_id: user.id
    }
  ];

  const results = [];
  for (const job of demoJobs) {
    const { data } = await db.createJob(job);
    if (data) results.push(data);
  }
  

  return { jobs: results, error: null };
}

/**
 * Mark job as complete and upload proof
 * @param {string} jobId 
 * @param {File[]} proofFiles 
 */
export async function completeJob(jobId, proofFiles) {
  // 1. Upload files
  const proofUrls = [];
  for (const file of proofFiles) {
    const fileExt = file.name.split('.').pop();
    const fileName = `job-${jobId}-proof-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `job-images/${fileName}`;

    const { error: uploadError } = await  supabase.storage
      .from('job-images')
      .upload(filePath, file);

    if (uploadError) {
       console.error('Proof upload failed:', uploadError);
       return { error: uploadError };
    }

    const { data } = supabase.storage.from('job-images').getPublicUrl(filePath);
    proofUrls.push(data.publicUrl);
  }

  // 2. Update Job Status & Proof URLs
  const { data, error } = await supabase
    .from('jobs')
    .update({ 
        status: 'review_pending',
        completion_proof_urls: proofUrls
    })
    .eq('id', jobId)
    .select()
    .single();

  return { job: data, error };
}

/**
 * Release payout to tradie
 * @param {string} jobId 
 */
export async function releasePayout(jobId) {
    // Call Edge Function
    const { data, error } = await supabase.functions.invoke('release-payout', {
        body: { jobId }
    });
    return { data, error };
}

// Expose to window for non-module scripts
if (typeof window !== 'undefined') {
    window.getJobs = getJobs;
    window.createJob = createJob;
    window.seedDemoJobs = seedDemoJobs;
    window.completeJob = completeJob;
    window.releasePayout = releasePayout;
    
    window.ATH_JobsAPI = {
        getJobs,
        createJob,
        seedDemoJobs,
        completeJob,
        releasePayout
    };
}
