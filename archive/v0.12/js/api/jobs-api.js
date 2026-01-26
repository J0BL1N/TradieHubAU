/**
 * jobs-api.js - Jobs data layer
 * Bridges the gap between UI and db.js layer
 */
import db from '../core/db.js';
import { getCurrentUser } from '../core/supabase-client.js';

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
