    import { supabase } from '/js/core/supabase-client.js';

    async function initTradieProfile() {
      // 1. Get ID
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id'); // e.g. ?id=UUID
      
      if (!id) {
         console.log('No profile ID specified');
         return;
      }

      console.log('Loading profile for:', id);

      // Retry loop for ATHDB
      let dbReady = false;
      for(let i=0; i<10; i++) {
        if (window.ATHDB) { dbReady = true; break; }
        await new Promise(r => setTimeout(r, 100));
      }
      
      if (!dbReady) {
          console.error('Database API failed to load');
          return;
      }

      try {
        const [profileRes, reviewsRes, jobsRes] = await Promise.all([
           window.ATHDB.getUserProfile(id),
           window.ATHDB.getReviewsForUser(id),
           window.ATHDB.getJobsForTradie(id)
        ]);

        const profile = profileRes.data;
        const reviews = reviewsRes.data || [];
        const jobs = jobsRes.data || [];

        if (!profile) {
           const main = document.getElementById('athMain');
           if (main) main.innerHTML = '<div class="p-8 text-center">Profile not found.</div>';
           return;
        }

        // 3. Render Profile Header
        const nameEl = document.getElementById('tradieName');
        if (nameEl) nameEl.textContent = profile.display_name;
        
        const locEl = document.getElementById('tradieLocation');
        if (locEl) locEl.textContent = [profile.suburb, profile.state].filter(Boolean).join(', ') || 'Australia';
        
        const imgEl = document.getElementById('tradieImage') || document.querySelector('img[alt="Tradie"]');
        if (imgEl && profile.avatar_url) {
            imgEl.src = profile.avatar_url;
        }

        // Rating
        const ratingEl = document.getElementById('tradieRating');
        if (ratingEl) {
            // Calculate rating from real reviews
            const avg = reviews.length ? (reviews.reduce((a,b) => a + b.rating, 0) / reviews.length).toFixed(1) : 'New';
            ratingEl.textContent = avg;
        }
        
        // Trade
        const tradeEl = document.getElementById('tradieTrade');
        if (tradeEl) {
           const t = profile.trade || (Array.isArray(profile.trades) ? profile.trades.join(', ') : 'Tradie');
           tradeEl.textContent = t;
        }
        
        // About
        const aboutEl = document.getElementById('tradieAbout');
        if (aboutEl) {
            aboutEl.textContent = profile.about || `Hi, I'm ${profile.display_name}. I'm a professional on TradieHub.`;
        }

        // 4. Render Reviews
       const reviewsList = document.getElementById('tradieReviewsList');
        if (reviewsList) {
           if (reviews.length === 0) {
               reviewsList.innerHTML = '<p class="text-gray-500 italic">No reviews yet.</p>';
           } else {
               renderTradieReviews(reviewsList, reviews);
           }
        }

        // 5. Render Jobs
        const active = jobs.filter(j => j.status === 'in_progress');
        const past = jobs.filter(j => j.status === 'completed');
        
        renderJobList('tradieActiveJobsList', active, 'No active jobs.');
        renderJobList('tradiePastJobsList', past, 'No completed jobs yet.');
        
        // Mini Calendar
        if (window.ATHAvailability && window.ATHAvailability.mountMiniCalendar) {
           const calEl = document.getElementById('tradieMiniCalendar');
           if (calEl) window.ATHAvailability.mountMiniCalendar(calEl, { tradieId: id });
        }
        
      } catch(e) {
          console.error('Error rendering profile:', e);
      }
        // Message Button
        const msgBtn = document.getElementById('messageBtn');
        if (msgBtn) {
           msgBtn.href = '#';
           msgBtn.onclick = async (e) => {
               e.preventDefault();
               const originalText = msgBtn.innerHTML;
               msgBtn.innerHTML = '<span class="animate-pulse">Loading...</span>';
               
               try {
                   // Ensure Auth
                   const { user } = await window.ATHAuth.getCurrentUser();
                   if (!user) {
                       // Redirect to login with return url
                       window.location.href = `/index.html?action=login&return=${encodeURIComponent(window.location.href)}`;
                       return;
                   }

                   // Prevent self-messaging
                   if (user.id === id) {
                       alert("You cannot message yourself.");
                       msgBtn.innerHTML = originalText;
                       return;
                   }

                   // Get or Create Conversation
                   const { data: convo, error } = await window.ATHDB.getOrCreateConversation(user.id, id);
                   
                   if (error) throw error;
                   
                   if (convo) {
                       window.location.href = `/pages/messages.html?conversation=${convo.id}`;
                   }
               } catch(err) {
                   console.error('Message action failed:', err);
                   alert('Could not start conversation. Please try again.');
                   msgBtn.innerHTML = originalText;
               }
           };
        }
    }

    function renderTradieReviews(container, reviews) {
       container.innerHTML = reviews.map(r => `
         <div class="mb-4 border-b border-gray-100 pb-4 last:border-0">
           <div class="flex items-center justify-between">
             <div class="font-medium text-gray-900">${escapeHtml(r.reviewer?.display_name || 'Customer')}</div>
             <div class="text-xs text-gray-500">${new Date(r.submitted_at).toLocaleDateString()}</div>
           </div>
           <div class="flex items-center my-1">
             ${renderStars(r.rating)}
           </div>
           <p class="text-sm text-gray-600">${escapeHtml(r.text)}</p>
         </div>
       `).join('');
       if (typeof feather !== 'undefined') feather.replace();
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
           <span class="px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">
             ${j.status.replace('_', ' ')}
           </span>
         </div>
       `).join('');
    }

    function renderStars(rating) {
      return Array(5).fill(0).map((_, i) => 
        `<svg class="w-3 h-3 ${i < rating ? 'text-amber-400 fill-current' : 'text-gray-300'}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
      ).join('');
    }

    function escapeHtml(text) {
      if (!text) return '';
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    // Init
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initTradieProfile);
    } else {
      initTradieProfile();
    }

    // Expose for SPA
    window.initTradieProfile = initTradieProfile;
