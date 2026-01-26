
import { supabase } from '/js/core/supabase-client.js';
import * as db from '/js/core/db.js';
import { ATHAuth } from '/js/core/auth.js';

let customerProfileInitRan = false;

async function initCustomerProfile() {
    if (customerProfileInitRan) return;
    customerProfileInitRan = true;
    
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id'); 
    
    if (!id) {
        console.log('No profile ID specified');
        showError('No profile ID specified.');
        return;
    }

    console.log('Loading customer profile for:', id);
    showLoading();

    try {
        const jobsPromise = supabase
            .from('jobs')
            .select('id,title,created_at,status')
            .eq('customer_id', id)
            .order('created_at', { ascending: false });

        const [profileRes, reviewsRes, jobsRes] = await Promise.all([
            db.getUserProfile(id),
            db.getReviewsForUser(id),
            jobsPromise
        ]);

        const profile = profileRes.data;
        const reviews = reviewsRes.data || [];
        const jobs = jobsRes?.data || [];
        
        if (jobsRes?.error) {
            console.warn('Jobs query failed for customer profile:', jobsRes.error.message);
        }

        if (!profile) {
            showError('Profile not found.');
            return;
        }

        // 3. Render Profile Header
        setText('customerName', profile.display_name);
        
        const locationText = [profile.suburb, profile.state].filter(Boolean).join(', ') || 'Australia';
        setText('customerLocation', locationText);
        setText('customerMeta', [locationText, profile.about].filter(Boolean).join(' - '));
        
        const imgEl = document.getElementById('customerImage');
        if (imgEl) {
            imgEl.src = profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.display_name)}&background=0D9488&color=fff`;
        }

        const badge = document.getElementById('customerTypeBadge');
        if (badge) {
            badge.textContent = 'Customer'; 
        }

        // Rating
        const ratingEl = document.getElementById('customerRating');
        if (ratingEl) {
            const avg = reviews.length ? (reviews.reduce((a,b) => a + b.rating, 0) / reviews.length).toFixed(1) : 'New';
            ratingEl.textContent = avg;
        }
        
        const reviewsCountEl = document.getElementById('customerReviews');
        if (reviewsCountEl) {
            const label = reviews.length === 1 ? 'review' : 'reviews';
            reviewsCountEl.textContent = `(${reviews.length} ${label})`;
        }
        
        // About
        setText('customerAbout', profile.about || `Joined ${new Date(profile.created_at || Date.now()).toLocaleDateString()}`);

        // Message Button
        setupMessageButton(id);

        // 4. Render Reviews
        const reviewsContainer = document.getElementById('customerReviewsList') || document.getElementById('reviewsList');
        if (reviewsContainer) {
            if (reviews.length === 0) {
                reviewsContainer.innerHTML = '<p class="text-gray-500 italic">No reviews yet.</p>';
            } else {
                renderCustomerReviews(reviewsContainer, reviews);
            }
        }

        // 5. Render Jobs (Posted by Customer)
        const active = jobs.filter(j => ['open','in_progress'].includes(j.status));
        const past = jobs.filter(j => j.status === 'completed');
        
        renderJobList('customerActiveJobsList', active, 'No active jobs.');
        renderJobList('customerPastJobsList', past, 'No past jobs.');
        
        // Mini Calendar (Bookings) - Optional
        if (window.ATHCustomerBookings && window.ATHCustomerBookings.mountMiniCalendar) {
            const calEl = document.getElementById('customerBookedCalendar');
            if (calEl) window.ATHCustomerBookings.mountMiniCalendar(calEl, { customerId: id });
        }
        
        // Re-init icons
        if (typeof feather !== 'undefined') feather.replace();
        
    } catch(e) {
        console.error('Error rendering customer profile:', e);
        showError('Failed to load profile.');
    }
}

function setupMessageButton(targetId) {
    const msgBtn = document.getElementById('messageBtn');
    if (!msgBtn) return;

    msgBtn.href = '#';
    msgBtn.onclick = async (e) => {
        e.preventDefault();
        
        const { user } = await ATHAuth.getCurrentUser();
        if (!user) {
            window.location.href = `/index.html?action=login`;
            return;
        }
        
        if (user.id === targetId) {
            alert("You cannot message yourself.");
            return;
        }

        const originalHtml = msgBtn.innerHTML;
        msgBtn.innerHTML = '<span class="animate-pulse">Loading...</span>';
        
        try {
            const { data: convo, error } = await db.getOrCreateConversation(user.id, targetId);
            if (error) throw error;
            if (convo) {
                window.location.href = `/pages/messages.html?conversation=${convo.id}`;
            }
        } catch (err) {
            console.error('Message action failed:', err);
            alert('Could not start conversation.');
            msgBtn.innerHTML = originalHtml;
        }
    };
}

function renderCustomerReviews(container, reviews) {
    container.innerHTML = reviews.map(r => `
        <div class="mb-4 border-b border-gray-100 pb-4 last:border-0">
        <div class="flex items-center justify-between">
            <div class="font-medium text-gray-900">${escapeHtml(r.reviewer?.display_name || 'Tradie')}</div>
            <div class="text-xs text-gray-500">${new Date(r.submitted_at).toLocaleDateString()}</div>
        </div>
        <div class="flex items-center my-1 text-yellow-500">
            ${renderStars(r.rating)}
        </div>
        <p class="text-sm text-gray-600">${escapeHtml(r.text)}</p>
        </div>
    `).join('');
}

function renderJobList(id, jobs, emptyMsg) {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (jobs.length === 0) {
        el.innerHTML = `<p class="text-sm text-gray-400 italic">${emptyMsg}</p>`;
        return;
    }
    
    el.innerHTML = jobs.map(j => `
        <div class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
        <div>
            <div class="text-sm font-medium text-gray-800">${escapeHtml(j.title)}</div>
            <div class="text-xs text-gray-500">${new Date(j.created_at).toLocaleDateString()}</div>
        </div>
        <span class="px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 capitalize">
            ${j.status.replace('_', ' ')}
        </span>
        </div>
    `).join('');
}

function renderStars(rating) {
    return Array(5).fill(0).map((_, i) => 
    `<svg class="w-3 h-3 ${i < rating ? 'fill-current' : 'text-gray-300'}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
    ).join('');
}

function showLoading() {
    setText('customerName', 'Loading...');
    setText('customerLocation', '');
    setText('customerMeta', '');
    setText('customerAbout', '');
}

function showError(msg) {
    const main = document.getElementById('athMain');
    if (main) main.innerHTML = `<div class="p-8 text-center text-red-500">${msg}</div>`;
}

function setText(id, val) {
    const el = document.getElementById(id);
    if(el) el.textContent = val;
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomerProfile);
} else {
    initCustomerProfile();
}

// Expose for SPA
window.initCustomerProfile = initCustomerProfile;
