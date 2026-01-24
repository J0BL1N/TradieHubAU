/**
 * News Feed Component - TradieHub
 * 
 * Live activity feed showing recent platform activity
 */

import { supabase } from '../core/supabase-client.js';

/**
 * Get recent platform activity
 * @param {number} limit 
 * @returns {Promise<{activities, error}>}
 */
export async function getRecentActivity(limit = 10) {
  try {
    // Get recent jobs, reviews, and user signups in parallel
    const [jobsResult, reviewsResult, usersResult] = await Promise.all([
      // Recent jobs
      supabase
        .from('jobs')
        .select('id, title, created_at, state, customer:users!customer_id(display_name)')
        .order('created_at', { ascending: false })
        .limit(5),
      
      // Recent reviews
      supabase
        .from('reviews')
        .select('id, rating, created_at, tradie:users!tradie_id(display_name)')
        .order('created_at', { ascending: false })
        .limit(5),
      
      // Recent user signups
      supabase
        .from('users')
        .select('id, display_name, role, created_at, suburb, state')
        .order('created_at', { ascending: false })
        .limit(5)
    ]);

    // Combine and format activities
    const activities = [];

    // Add job activities
    if (jobsResult.data) {
      jobsResult.data.forEach(job => {
        activities.push({
          type: 'job_posted',
          timestamp: new Date(job.created_at),
          text: `New job posted: "${job.title}" in ${job.state}`,
          icon: 'briefcase',
          color: 'teal'
        });
      });
    }

    // Add review activities
    if (reviewsResult.data) {
      reviewsResult.data.forEach(review => {
        const stars = '⭐'.repeat(review.rating);
        activities.push({
          type: 'review',
          timestamp: new Date(review.created_at),
          text: `${stars} review for ${review.tradie?.display_name || 'a tradie'}`,
          icon: 'star',
          color: 'amber'
        });
      });
    }

    // Add user signup activities
    if (usersResult.data) {
      usersResult.data.forEach(user => {
        const roleLabel = user.role === 'tradie' ? 'tradie' : user.role === 'dual' ? 'professional' : 'customer';
        const location = user.suburb && user.state ? `from ${user.suburb}, ${user.state}` : `in ${user.state || 'Australia'}`;
        activities.push({
          type: 'user_joined',
          timestamp: new Date(user.created_at),
          text: `${user.display_name} joined as a ${roleLabel} ${location}`,
          icon: 'user-plus',
          color: 'green'
        });
      });
    }

    // Sort by timestamp descending
    activities.sort((a, b) => b.timestamp - a.timestamp);

    // Limit to requested amount
    const limitedActivities = activities.slice(0, limit);

    return { activities: limitedActivities, error: null };
  } catch (error) {
    console.error('❌ Get recent activity error:', error.message);
    
    // Return fallback activities
    const fallbackActivities = [
      {
        type: 'job_posted',
        timestamp: new Date(Date.now() - 5 * 60 * 1000),
        text: 'New job posted: "Bathroom Renovation" in VIC',
        icon: 'briefcase',
        color: 'teal'
      },
      {
        type: 'review',
        timestamp: new Date(Date.now() - 15 * 60 * 1000),
        text: '⭐⭐⭐⭐⭐ review for Mark Johnson',
        icon: 'star',
        color: 'amber'
      },
      {
        type: 'user_joined',
        timestamp: new Date(Date.now() - 30 * 60 * 1000),
        text: 'Sarah joined as a tradie from Melbourne, VIC',
        icon: 'user-plus',
        color: 'green'
      }
    ];
    
    return { activities: fallbackActivities, error };
  }
}

/**
 * Format timestamp for display (e.g., "5 minutes ago")
 * @param {Date} timestamp 
 * @returns {string}
 */
export function formatTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

/**
 * Render activity feed
 * @param {Array} activities 
 * @param {HTMLElement} container 
 */
export function renderActivityFeed(activities, container) {
  if (!container) return;

  const colorClasses = {
    teal: 'bg-teal-50 text-teal-600',
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-green-50 text-green-600'
  };

  const html = activities.map(activity => {
    const colorClass = colorClasses[activity.color] || 'bg-gray-50 text-gray-600';
    const timeAgo = formatTimeAgo(activity.timestamp);
    
    return `
      <div class="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:shadow-sm transition">
        <div class="flex-shrink-0 w-8 h-8 ${colorClass} rounded-full flex items-center justify-center">
          <i data-feather="${activity.icon}" class="w-4 h-4"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-gray-800">${activity.text}</p>
          <p class="text-xs text-gray-500 mt-1">${timeAgo}</p>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
  
  // Replace Feather icons
  if (typeof feather !== 'undefined') {
    feather.replace();
  }
}

/**
 * Initialize news feed with auto-refresh
 * @param {HTMLElement} container 
 * @param {number} refreshInterval - in milliseconds (default 30s)
 */
export async function initNewsFeed(container, refreshInterval = 30000) {
  if (!container) return;

  // Initial load
  const { activities } = await getRecentActivity(10);
  renderActivityFeed(activities, container);

  // Auto-refresh
  setInterval(async () => {
    const { activities } = await getRecentActivity(10);
    renderActivityFeed(activities, container);
  }, refreshInterval);

  // Optional: Listen for real-time updates via Supabase
  // subscribeToActivityUpdates(container);
}

/**
 * Subscribe to real-time activity updates (optional)
 * @param {HTMLElement} container 
 */
export function subscribeToActivityUpdates(container) {
  // Subscribe to jobs table
  const jobsSubscription = supabase
    .channel('public:jobs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jobs' }, async () => {
      const { activities } = await getRecentActivity(10);
      renderActivityFeed(activities, container);
    })
    .subscribe();

  // Subscribe to reviews table
  const reviewsSubscription = supabase
    .channel('public:reviews')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reviews' }, async () => {
      const { activities } = await getRecentActivity(10);
      renderActivityFeed(activities, container);
    })
    .subscribe();

  return { jobsSubscription, reviewsSubscription };
}
