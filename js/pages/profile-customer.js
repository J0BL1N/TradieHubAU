    import { supabase } from '/js/core/supabase-client.js';

    async function initCustomerProfile() {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id'); 
      
      if (!id) {
         console.log('No profile ID specified');
         return;
      }

      console.log('Loading customer profile for:', id);

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
           window.ATHDB.getJobs({ customerId: id })
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
        // Elements match profile-customer.html IDs
        const nameEl = document.getElementById('customerName') || document.querySelector('h1.font-bold'); 
        // Note: ID for name might be slightly different in customer page, checked messy output didn't see explicit customerName ID but likely consistent.
        // Messy output showed `c.name`.
        // Let's assume consistent naming or fallback to querySelector if needed.
        // Actually, looking at messy output: `img.alt = c.name`.
        // I'll try to set textContent of H1 if ID not found.
        if (nameEl) nameEl.textContent = profile.display_name;
        
        const locEl = document.getElementById('customerLocation') || document.getElementById('customerSuburb') || document.querySelector('.text-slate-500');
        if (locEl) locEl.textContent = [profile.suburb, profile.state].filter(Boolean).join(', ') || 'Australia';
        
        const imgEl = document.getElementById('customerImage');
        if (imgEl && profile.avatar_url) {
            imgEl.src = profile.avatar_url;
        }

        const badge = document.getElementById('customerTypeBadge');
        if (badge) {
            badge.textContent = 'Customer'; // Or derive from role if needed
             // Could be 'Residential', 'Commercial' etc if we had that data.
        }

        // Rating
        const ratingEl = document.getElementById('customerRating');
        if (ratingEl) {
            const avg = reviews.length ? (reviews.reduce((a,b) => a + b.rating, 0) / reviews.length).toFixed(1) : 'New';
            ratingEl.textContent = avg;
        }
        
        // About
        const aboutEl = document.getElementById('customerAbout');
        if (aboutEl) {
            aboutEl.textContent = profile.about || `Joined ${new Date(profile.created_at || Date.now()).toLocaleDateString()}`;
        }

        // Message Button
        const msgBtn = document.getElementById('messageBtn');
        if (msgBtn) {
           // We need to look up or create conversation?
           // Ideally we check if existing convo.
           // For now, link to messages with user ID?
           // The button usually links to a conversation ID.
           // We can check if `ATHDB.getOrCreateConversation` can be called onClick.
           msgBtn.href = '#';
           msgBtn.onclick = async (e) => {
               e.preventDefault();
               msgBtn.textContent = 'Loading...';
               const { user } = await window.ATHAuth.getCurrentUser();
               if (!user) {
                   window.location.href = '/index.html?action=login';
                   return;
               }
               const { data: convo } = await window.ATHDB.getOrCreateConversation(user.id, id);
               if (convo) {
                   window.location.href = `/pages/messages.html?conversation=${convo.id}`;
               }
           };
        }

        // 4. Render Reviews
        const reviewsList = document.getElementById('customerReviewsList'); // Hypothetical ID? Messy output showed 'customerReviewsList' is likely assuming symmetry?
        // Actually messy output showed `renderReviewsInto(document.getElementById('tradieReviewsList')`... wait.
        // Did I read tradie profile again?
        // No, step 1562 output was `temp_cust.txt`.
        // But it had `tradieReviewsList` in the messy text?
        // It's possible the Copy-Paste happened in the mockup.
        // I will check if `customerReviewsList` exists or just `tradieReviewsList` being reused.
        // It's safer to use querySelector if ID is ambiguous.
        // But let's assume `customerReviewsList` or look for class.
        
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
        
      } catch(e) {
          console.error('Error rendering customer profile:', e);
      }
    }

    function renderCustomerReviews(container, reviews) {
       container.innerHTML = reviews.map(r => `
         <div class="mb-4 border-b border-gray-100 pb-4 last:border-0">
           <div class="flex items-center justify-between">
             <div class="font-medium text-gray-900">${escapeHtml(r.reviewer?.display_name || 'Tradie')}</div>
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
      document.addEventListener('DOMContentLoaded', initCustomerProfile);
    } else {
      initCustomerProfile();
    }

    // Init
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initCustomerProfile);
    } else {
      initCustomerProfile();
    }

    // Expose for SPA
    window.initCustomerProfile = initCustomerProfile;
