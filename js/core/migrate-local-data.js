/**
 * migrate-local-data.js
 * Tool to migrate existing localStorage data to Supabase
 * Use this once to sync local state to the cloud
 */

import { supabase, getCurrentUser } from './supabase-client.js';
import db from './db.js';

export async function migrateLocalData() {
  console.log('🚀 Starting migration...');
  
  const { user } = await getCurrentUser();
  if (!user) {
    console.error('Login required for migration');
    return { error: 'Please log in to Supabase first' };
  }

  const results = {
    users: 0,
    jobs: 0,
    conversations: 0,
    messages: 0,
    errors: []
  };

  // 1. Migrate User Profile (Self)
  // We assume the auth user is the one running this
  const localUser = JSON.parse(localStorage.getItem('athCurrentUser') || '{}');
  if (localUser && localUser.name) {
    console.log('Migrating profile...');
    try {
      await db.updateUserProfile(user.id, {
        display_name: localUser.name,
        email: localUser.email || user.email,
        phone: localUser.phone,
        suburb: localUser.suburb,
        state: localUser.state,
        about: localUser.about,
        role: localUser.role || 'customer',
        trades: localUser.trades || []
      });
      results.users++;
    } catch (e) {
      results.errors.push(`Profile error: ${e.message}`);
    }
  }

  // 2. Migrate Jobs
  const localJobs = JSON.parse(localStorage.getItem('athPostedJobs') || '[]');
  console.log(`Found ${localJobs.length} local jobs to migrate`);
  
  for (const j of localJobs) {
    try {
      // Map local job to DB schema
      const jobData = {
        title: j.title || 'Untitled Job',
        description: j.description || '',
        categories: Array.isArray(j.categories) ? j.categories : [j.category || 'other'],
        location: j.location || 'Australia',
        state: j.state || 'NSW',
        budget_min: Number(j.budget || 0),
        budget_max: Number(j.budget || 0), // LocalStorage only had single budget
        timeline: j.date || 'Flexible',
        urgency: 'flexible',
        status: j.state === 'open' ? 'open' : 'completed', // Map 'state' to status
        customer_id: user.id // Assign to current user
      };
      
      const { error } = await db.createJob(jobData);
      if (error) throw error;
      results.jobs++;
    } catch (e) {
      console.error('Job migration failed:', e);
      results.errors.push(`Job ${j.title} failed: ${e.message}`);
    }
  }

  // 3. Migrate Messages (Simulated)
  // Local messages were stored in complex structures using `athChatThreads`.
  // This is tricky because we need valid UUIDs for other users.
  // For MVP, we might skip this or only migrate system messages.
  console.log('Skipping message migration (requires user mapping)');

  console.log('✅ Migration complete!', results);
  return results;
}

// Expose globally for console use
window.migrateLocalData = migrateLocalData;
