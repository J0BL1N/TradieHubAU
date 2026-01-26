
import { supabase } from '/js/core/supabase-client.js';
import * as db from '/js/core/db.js';
import { ATHAuth } from '/js/core/auth.js'; // Ensure we have auth access

async function initTradieProfile() {
    // 1. Get ID
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id'); // e.g. ?id=UUID

    if (!id) {
        console.log('No profile ID specified');
        showError('No profile ID specified.');
        return;
    }

    console.log('Loading profile for:', id);

    // Show Loading State (Clear placeholders)
    showLoading();

    try {
        const [profileRes, reviewsRes, jobsRes] = await Promise.all([
            db.getUserProfile(id),
            db.getReviewsForUser(id),
            db.getJobsForTradie(id)
        ]);

        const profile = profileRes.data;
        const reviews = reviewsRes.data || [];
        const jobs = jobsRes.data || [];

        if (!profile) {
            showError('Profile not found.');
            return;
        }

        // 3. Render Profile Header
        setText('tradieName', profile.display_name);
        setText('tradieLocation', [profile.suburb, profile.state].filter(Boolean).join(', ') || 'Australia');
        
        const imgEl = document.getElementById('tradieImage') || document.querySelector('img[alt="Tradie"]');
        if (imgEl) {
            imgEl.src = profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.display_name)}&background=0D9488&color=fff`;
        }

        const verifiedBadge = document.getElementById('tradieVerified');
        if (verifiedBadge) {
            verifiedBadge.classList.toggle('hidden', !profile.verified);
        }

        // Rating
        const ratingEl = document.getElementById('tradieRating');
        if (ratingEl) {
            const avg = reviews.length ? (reviews.reduce((a,b) => a + b.rating, 0) / reviews.length).toFixed(1) : 'New';
            ratingEl.innerHTML = `<i data-feather="star" class="w-3 h-3 mr-1"></i>${avg}`;
        }
        
        // Trade
        setText('tradieTrade', profile.trade || (Array.isArray(profile.trades) ? profile.trades.join(', ') : 'Tradie'));
        
        const tradesChips = document.getElementById('tradieTradesChips');
        if (tradesChips && Array.isArray(profile.trades) && profile.trades.length > 0) {
            tradesChips.innerHTML = profile.trades.map((trade) => (
                `<span class="px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">${escapeHtml(trade)}</span>`
            )).join('');
        }
        
        // About
        setText('tradieAbout', profile.about || `Hi, I'm ${profile.display_name}. I'm a professional on TradieHub.`);

        // 4. Render Reviews
        const reviewsList = document.getElementById('tradieReviewsList');
        if (reviewsList) {
            if (reviews.length === 0) {
                reviewsList.innerHTML = '<p class="text-gray-500 italic text-sm">No reviews yet.</p>';
            } else {
                renderTradieReviews(reviewsList, reviews);
            }
        }

        // 5. Render Jobs
        // Filter by real statuses
        const active = jobs.filter(j => ['assigned', 'in_progress'].includes(j.status));
        const past = jobs.filter(j => j.status === 'completed');
        
        renderJobList('tradieActiveJobsList', active, 'No active jobs.');
        renderJobList('tradiePastJobsList', past, 'No completed jobs yet.');
        
        // Mini Calendar
        if (window.ATHAvailability && window.ATHAvailability.mountMiniCalendar) {
            const calEl = document.getElementById('tradieMiniCalendar');
            if (calEl) window.ATHAvailability.mountMiniCalendar(calEl, { tradieId: id });
        }
        
        // Setup Message Button
        setupMessageButton(id);

        // Re-init icons
        if (typeof feather !== 'undefined') feather.replace();

    } catch(e) {
        console.error('Error rendering profile:', e);
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
            window.location.href = `/index.html?action=login&return=${encodeURIComponent(window.location.href)}`;
            return;
        }

        if (user.id === targetId) {
            alert("You cannot message yourself.");
            return;
        }
        
        msgBtn.innerHTML = '<span class="animate-pulse">Loading...</span>';

        try {
             const { data: convo, error } = await db.getOrCreateConversation(user.id, targetId);
             if (error) throw error;
             
             if (convo) {
                 window.location.href = `/pages/messages.html?conversation=${convo.id}`;
             }
        } catch (err) {
            console.error(err);
            alert('Error starting conversation.');
            msgBtn.textContent = 'Message';
        }
    };
}

function renderTradieReviews(container, reviews) {
    container.innerHTML = reviews.map(r => `
        <div class="mb-4 border-b border-gray-100 pb-4 last:border-0">
        <div class="flex items-center justify-between">
            <div class="font-medium text-gray-900 text-sm">${escapeHtml(r.reviewer?.display_name || 'Customer')}</div>
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
        el.innerHTML = `<p class="text-xs text-gray-400 italic">${emptyMsg}</p>`;
        return;
    }
    
    el.innerHTML = jobs.map(j => `
        <div class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
        <div>
            <div class="text-sm font-medium text-gray-800 hover:text-teal-600">
                <a href="/pages/ongoing-job.html?id=${j.id}">${escapeHtml(j.title)}</a>
            </div>
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
    setText('tradieName', 'Loading...');
    setText('tradieTrade', '');
    setText('tradieLocation', '');
    setText('tradieAbout', '');
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

// Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTradieProfile);
} else {
    initTradieProfile();
}

// Expose for SPA
window.initTradieProfile = initTradieProfile;
