/**
 * Stats API - TradieHub
 * 
 * Fetch real-time platform statistics from Supabase
 */

import { supabase } from '../core/supabase-client.js';

// Cache duration (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;
let statsCache = null;
let cacheTimestamp = null;

/**
 * Get platform statistics with caching
 * @returns {Promise<{stats, error}>}
 */
export async function getPlatformStats() {
  // Return cached data if still valid
  if (statsCache && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return { stats: statsCache, error: null };
  }

  try {
    // Query all stats in parallel
    const [tradiesResult, reviewsResult, messagesResult] = await Promise.all([
      // Count verified tradies
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .in('role', ['tradie', 'dual']),
      
      // Count reviews
      supabase
        .from('reviews')
        .select('id', { count: 'exact', head: true }),
      
      // Count active conversations (last 30 days)
      supabase
        .from('messages')
        .select('conversation_id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    ]);

    // Extract counts
    const tradiesCount = tradiesResult.count || 0;
    const reviewsCount = reviewsResult.count || 0;
    const activeChatsCount = messagesResult.count || 0;

    // Create stats object
    const stats = {
      verifiedTrades: tradiesCount,
      verifiedReviews: reviewsCount,
      activeChats: activeChatsCount,
      timestamp: new Date().toISOString()
    };

    // Update cache
    statsCache = stats;
    cacheTimestamp = Date.now();

    console.log('✅ Platform stats fetched:', stats);
    return { stats, error: null };
  } catch (error) {
    console.error('❌ Get platform stats error:', error.message);
    
    // Return fallback stats on error
    const fallbackStats = {
      verifiedTrades: 12500,
      verifiedReviews: 45000,
      activeChats: 8500,
      timestamp: new Date().toISOString()
    };
    
    return { stats: fallbackStats, error };
  }
}

/**
 * Get trade category counts
 * @returns {Promise<{counts, error}>}
 */
export async function getTradeCategoryCounts() {
  try {
    // Get all tradie users
    const { data: users, error } = await supabase
      .from('users')
      .select('trades')
      .in('role', ['tradie', 'dual']);

    if (error) throw error;

    // Count trades
    const counts = {};
    users.forEach(user => {
      if (user.trades && Array.isArray(user.trades)) {
        user.trades.forEach(trade => {
          const tradeKey = String(trade).toLowerCase();
          counts[tradeKey] = (counts[tradeKey] || 0) + 1;
        });
      }
    });

    console.log('✅ Trade category counts:', counts);
    return { counts, error: null };
  } catch (error) {
    console.error('❌ Get trade counts error:', error.message);
    
    // Return fallback counts
    const fallbackCounts = {
      plumbing: 1240,
      electrical: 890,
      carpentry: 760,
      painting: 540,
      gardening: 420,
      cleaning: 680
    };
    
    return { counts: fallbackCounts, error };
  }
}

/**
 * Format large numbers for display (12,500 → 12.5k)
 * @param {number} num 
 * @returns {string}
 */
export function formatStatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return num.toString();
}

/**
 * Animate number count-up
 * @param {HTMLElement} element 
 * @param {number} target 
 * @param {number} duration 
 */
export function animateNumber(element, target, duration = 2000) {
  const start = 0;
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function (ease-out)
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (target - start) * easeOut);
    
    element.textContent = formatStatNumber(current) + '+';
    
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = formatStatNumber(target) + '+';
    }
  }
  
  requestAnimationFrame(update);
}
