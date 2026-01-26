
import { getJobById, createProposal, getProposalsForJob, updateProposalStatus, updateJob } from '../core/db.js';

/**
 * Job Details Modal Component
 * Version 1.1 (Supabase Integrated)
 */
(function() {
    // Forcefully take over or initialize
    const component = (function() {
    
    let currentJob = null;
    let currentUser = null;
    let modalEl = null;

    function init() {
        console.log('ATHJobDetails: Initializing...');
        modalEl = document.getElementById('athJobModal');
        if (modalEl) {
            console.log('ATHJobDetails: Modal element already exists');
            return;
        }
        
        console.log('ATHJobDetails: Injecting modal HTML');
        // Inject Modal HTML
        const modalHtml = `
        <div id="athJobModal" class="fixed inset-0 z-[100] hidden" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <!-- Backdrop -->
            <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onclick="window.ATHJobDetails.close()"></div>

            <div class="fixed inset-0 z-10 w-screen overflow-y-auto">
                <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                    
                    <div class="relative transform overflow-hidden rounded-3xl bg-white dark:bg-gray-800 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
                        
                        <!-- Header -->
                        <div class="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 sm:px-6 flex justify-between items-center border-b border-gray-100 dark:border-gray-700">
                            <h3 class="text-xl font-black text-gray-900 dark:text-white uppercase tracking-widest" id="modal-title">Job Details</h3>
                            <button type="button" class="text-gray-400 hover:text-gray-500" onclick="window.ATHJobDetails.close()">
                                <span class="sr-only">Close</span>
                                <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <!-- Content -->
                        <div class="px-4 py-4 sm:p-6" id="athJobModalContent">
                            <div class="animate-pulse space-y-4">
                                <div class="h-4 bg-gray-200 rounded w-3/4"></div>
                                <div class="h-4 bg-gray-200 rounded w-1/2"></div>
                                <div class="h-32 bg-gray-200 rounded"></div>
                            </div>
                        </div>

                        <!-- Footer / Actions -->
                        <div class="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6" id="athJobModalActions">
                            <!-- Buttons injected here -->
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modalEl = document.getElementById('athJobModal');
        console.log('ATHJobDetails: Modal injected successfully');
    }

    async function open(jobId) {
        console.log('ATHJobDetails: Opening job', jobId);
        init();
        if (!modalEl) {
            console.error('ATHJobDetails: Failed to find or inject modal element');
            return;
        }
        modalEl.classList.remove('hidden');
        
        // Loading state
        document.getElementById('athJobModalContent').innerHTML = `
            <div class="animate-pulse space-y-4">
               <div class="h-6 bg-gray-200 rounded w-1/3"></div>
               <div class="h-4 bg-gray-200 rounded w-2/3"></div> 
               <div class="h-32 bg-gray-200 rounded"></div>
            </div>`;
        document.getElementById('athJobModalActions').innerHTML = '';

        try {
            // 1. Fetch Job
            const { data: job, error } = await getJobById(jobId);
            if (error || !job) throw new Error('Job not found');
            currentJob = job;

            // 2. Get Current User (if any)
            const session = window.ATHAuth?.getSession?.();
            if (session?.userId) {
                // Fetch full profile for role info ('tradie', 'customer', etc)
                const { data: profile } = await window.ATHDB.getUserProfile(session.userId);
                currentUser = profile; 
            } else {
                currentUser = null;
            }

            // 3. Fetch Proposals (for count and display)
            const { data: proposals } = await window.ATHDB.getProposalsForJob(jobId);
            currentJob.proposals = proposals || [];
            currentJob.quoteCount = currentJob.proposals.length;

            // 4. Render
            render();

        } catch (err) {
            console.error(err);
            document.getElementById('athJobModalContent').innerHTML = `<div class="text-red-500 text-center py-8">Failed to load job details.</div>`;
        }
    }

    function close() {
        if (modalEl) modalEl.classList.add('hidden');
    }

    async function render() {
        const content = document.getElementById('athJobModalContent');
        const actions = document.getElementById('athJobModalActions');
        
        const job = currentJob;
        if (!job) return;

        const status = (job.status || '').toString().toLowerCase().trim();
        const isOwner = currentUser && (String(currentUser.id) === String(job.customer_id || job.customerId));
        
        // Broaden permission: If logged in and not the owner, they can quote if job is open.
        const canQuote = currentUser && !isOwner && (status === 'open');
        
        console.log('ATH: Modal Render', { 
            jobId: job.id, 
            status: '"' + status + '"', 
            user: currentUser?.display_name || 'Guest',
            isOwner, 
            canQuote 
        });

        // --- CONTENT RENDER ---
        const customer = job.customer || {};
        const customerName = customer.display_name || 'Customer';
        const customerAvatar = customer.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(customerName)}&background=0d9488&color=fff`;

        const cats = job.categories || (job.category ? [job.category] : []);
        const catLabels = cats.map(c => {
             const co = (window.TRADE_CATEGORIES || []).find(x => x.id === c);
             return co ? co.label : c.charAt(0).toUpperCase() + c.slice(1);
        });

        // Time ago helper (rely on global if available, or basic fallback)
        const postedTime = job.created_at || job.postedAt;
        const timeStr = typeof window.timeAgo === 'function' ? window.timeAgo(postedTime) : 'recently';

        let html = `
            <div class="mb-6">
                <!-- Customer Header -->
                <div class="flex items-center gap-4 mb-4 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <img src="${customerAvatar}" class="w-16 h-16 rounded-full border-2 border-white dark:border-gray-600 shadow-md object-cover" alt="${customerName}">
                    <div class="flex-1">
                        <div class="text-[11px] text-gray-400 uppercase font-black tracking-widest mb-0.5">Posted by</div>
                        <div class="font-black text-2xl text-gray-900 dark:text-white leading-tight">${customerName}</div>
                        <div class="text-sm text-gray-500 flex items-center gap-1 mt-0.5 font-bold"><i data-feather="calendar" class="w-3.5 h-3.5"></i> ${timeStr}</div>
                    </div>
                </div>

                <h2 class="text-3xl font-black text-gray-900 dark:text-white mb-4 leading-tight">${escapeHtml(job.title)}</h2>
                
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div class="bg-white dark:bg-gray-800 p-3 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                        <span class="text-[10px] text-gray-400 uppercase font-black tracking-widest block mb-1">State</span>
                        <span class="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                            <i data-feather="map-pin" class="w-4 h-4 text-teal-500"></i> ${escapeHtml(job.state || 'VIC')}
                        </span>
                    </div>
                    <div class="bg-white dark:bg-gray-800 p-3 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                        <span class="text-[10px] text-gray-400 uppercase font-black tracking-widest block mb-1">Budget</span>
                        <span class="text-lg font-black text-teal-600 flex items-center gap-2">
                            <i data-feather="dollar-sign" class="w-4 h-4 text-teal-500"></i> $${job.budget_max || job.budget_min || 'Any'}
                        </span>
                    </div>
                    <div class="bg-white dark:bg-gray-800 p-3 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                        <span class="text-[10px] text-gray-400 uppercase font-black tracking-widest block mb-1">Quotes</span>
                        <span class="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                            <i data-feather="message-circle" class="w-4 h-4 text-teal-500"></i> ${job.quoteCount || 0}
                        </span>
                    </div>
                    <div class="bg-white dark:bg-gray-800 p-3 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                        <span class="text-[10px] text-gray-400 uppercase font-black tracking-widest block mb-1">Status</span>
                        <span class="inline-block mt-1 px-2 py-0.5 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-[10px] font-black uppercase tracking-widest">
                            ${status}
                        </span>
                    </div>
                </div>

                <div class="mb-6">
                    <span class="text-[10px] text-gray-400 uppercase font-black tracking-widest block mb-3 ml-1">Requirements</span>
                    <div class="flex flex-wrap gap-2">
                        ${catLabels.map(cl => `<span class="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-black rounded-xl border border-gray-200 dark:border-gray-600 uppercase tracking-tighter">${cl}</span>`).join('')}
                    </div>
                </div>
                
                <div class="p-6 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-800">
                    <span class="text-[10px] text-gray-400 uppercase font-black tracking-widest block mb-3">Job Description</span>
                    <p class="whitespace-pre-line text-lg leading-relaxed text-gray-800 dark:text-gray-200 font-medium">${escapeHtml(job.description)}</p>
                </div>
            </div>
        `;
        
        // SECTION: Proposals
        if (isOwner) {
            html += `<div class="mt-8 pt-8 border-t border-gray-100 dark:border-gray-800">
                <h3 class="font-black text-xs uppercase tracking-widest text-gray-400 mb-4">Received Quotes</h3>
                <div id="athJobProposalsList" class="space-y-4"><div class="text-sm text-gray-500">Loading quotes...</div></div>
            </div>`;
        } else if (canQuote) {
             html += `<div class="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
                <h3 class="font-black text-[11px] uppercase tracking-widest text-gray-400 mb-6">Submit Quote</h3>
                <form id="athProposalForm" class="space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-2">Total Price ($)</label>
                            <div class="relative">
                                <span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                <input type="number" name="price" required placeholder="0.00" class="pl-8 block w-full rounded-2xl border-gray-100 dark:border-gray-700 shadow-sm focus:border-teal-500 focus:ring-teal-500 text-lg bg-white dark:bg-gray-900 py-4 px-4 font-black">
                            </div>
                        </div>
                        <div>
                            <label class="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-2">Est. Start Date</label>
                            <input type="date" name="estimated_start" required class="block w-full rounded-2xl border-gray-100 dark:border-gray-700 shadow-sm focus:border-teal-500 focus:ring-teal-500 text-lg bg-white dark:bg-gray-900 py-4 px-4 font-bold">
                        </div>
                    </div>

                    <div>
                        <label class="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-2">Availability</label>
                        <select name="availability" required class="block w-full rounded-2xl border-gray-100 dark:border-gray-700 shadow-sm focus:border-teal-500 focus:ring-teal-500 text-lg bg-white dark:bg-gray-900 py-4 px-4 font-bold appearance-none">
                            <option value="immediate">Available Immediately</option>
                            <option value="this_week" selected>Can start this week</option>
                            <option value="next_week">Available next week</option>
                            <option value="within_month">Within 30 days</option>
                            <option value="flexible">Flexible / Negotiable</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-2">Cover Letter / Details</label>
                        <textarea name="cover_letter" rows="4" required placeholder="Explain why you're the best for this job..." class="block w-full rounded-2xl border-gray-100 dark:border-gray-700 shadow-sm focus:border-teal-500 focus:ring-teal-500 text-lg bg-white dark:bg-gray-900 py-4 px-4 font-medium"></textarea>
                    </div>
                    <div id="athProposalMsg" class="text-base font-black hidden p-4 rounded-2xl"></div>
                </form>
             </div>`;
        }

        content.innerHTML = html;
        if (typeof feather !== 'undefined') feather.replace();

        // Call list population AFTER content is in DOM
        if (isOwner) {
            loadProposalsForOwner(job.id);
        }


        // --- ACTIONS RENDER ---
        let btns = '';
        if (isOwner) {
            btns = `
                <button onclick="window.ATHJobDetails.closeJob('${job.id}')" class="inline-flex w-full justify-center rounded-2xl bg-red-600 px-10 py-4 text-lg font-black text-white shadow-xl hover:bg-red-500 transition sm:ml-3 sm:w-auto transform hover:scale-105">Close Job</button>
                <button onclick="window.ATHJobDetails.close()" class="mt-3 inline-flex w-full justify-center rounded-2xl bg-white dark:bg-gray-800 px-10 py-4 text-lg font-black text-gray-700 dark:text-gray-200 shadow-sm ring-1 ring-inset ring-gray-200 dark:ring-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 sm:mt-0 sm:w-auto">Close</button>
            `;
        } else if (canQuote) {
            btns = `
                <button onclick="window.ATHJobDetails.submitProposal()" class="inline-flex w-full justify-center rounded-2xl bg-teal-600 px-10 py-4 text-lg font-black text-white shadow-xl hover:bg-teal-500 transition sm:ml-3 sm:w-auto transform hover:scale-105 active:scale-95">Submit Quote</button>
                <button onclick="window.ATHJobDetails.close()" class="mt-3 inline-flex w-full justify-center rounded-2xl bg-white dark:bg-gray-800 px-10 py-4 text-lg font-black text-gray-700 dark:text-gray-200 shadow-sm ring-1 ring-inset ring-gray-200 dark:ring-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 sm:mt-0 sm:w-auto">Cancel</button>
            `;
        } else if (!currentUser) {
            btns = `
                <a href="/index.html?action=login&redirect=/pages/jobs.html" class="inline-flex w-full justify-center rounded-xl bg-teal-600 px-8 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-teal-500 transition sm:ml-3 sm:w-auto">Login to Quote</a>
                <button onclick="window.ATHJobDetails.close()" class="mt-3 inline-flex w-full justify-center rounded-xl bg-white dark:bg-gray-800 px-6 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-200 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 sm:mt-0 sm:w-auto">Close</button>
            `;
        } else {
             btns = `<button onclick="window.ATHJobDetails.close()" class="mt-3 inline-flex w-full justify-center rounded-xl bg-white dark:bg-gray-800 px-8 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-200 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 sm:mt-0 sm:w-auto">Close</button>`;
        }
        actions.innerHTML = btns;
    }

    async function closeJob(jobId) {
        if (!confirm('Are you sure you want to close this job? It will no longer be visible on the board.')) return;
        
        try {
            const { error } = await updateJob(jobId, { status: 'closed' });
            if (error) throw error;
            
            alert('Job closed successfully.');
            close();
            
            // Refresh board if standard refresh functions exist
            if (typeof window.refetchJobs === 'function') {
                window.refetchJobs();
            } else if (typeof window.renderAll === 'function') {
                // If it's the jobs page, update local state if possible or reload
                window.location.reload();
            } else {
                window.location.reload();
            }
        } catch (e) {
            console.error('Failed to close job:', e);
            alert('Failed to close job: ' + e.message);
        }
    }

    function loadProposalsForOwner(jobId) {
        const list = document.getElementById('athJobProposalsList');
        if (!list) return;

        const proposals = currentJob.proposals || [];
        
        if (!proposals || proposals.length === 0) {
            list.innerHTML = `<p class="text-gray-500 italic text-sm">No quotes received yet.</p>`;
            return;
        }

        list.innerHTML = proposals.map(p => `
            <div class="border border-gray-100 dark:border-gray-700 rounded-2xl p-4 bg-white dark:bg-gray-800 shadow-sm hover:border-teal-300 transition group">
                <div class="flex justify-between items-center mb-4">
                    <div class="flex items-center gap-3">
                         <img src="${p.tradie?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.tradie?.display_name || 'T')}&background=0d9488&color=fff`}" class="w-12 h-12 rounded-full border-2 border-white dark:border-gray-700 shadow-sm object-cover">
                         <div>
                            <div class="text-[17px] font-black text-gray-900 dark:text-white">${escapeHtml(p.tradie?.display_name || 'Tradie')}</div>
                            <div class="text-lg font-black text-teal-600 tracking-tight">$${p.price}</div>
                         </div>
                    </div>
                    ${renderProposalStatus(p)}
                </div>
                <div class="mt-2 text-[17px] text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl font-medium leading-relaxed">
                    ${escapeHtml(p.cover_letter)}
                </div>
            </div>
        `).join('');
    }

    function renderProposalStatus(p) {
        if (p.status === 'accepted') {
            return `<span class="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">ACCEPTED</span>`;
        }
        if (currentJob.status !== 'open') {
             // Job closed, can't hire
             return `<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">${p.status.toUpperCase()}</span>`;
        }
        // Action Button
        return `
            <button onclick="window.ATHJobDetails.acceptProposal('${p.id}')" 
                    class="px-3 py-1 bg-teal-600 text-white text-xs font-medium rounded hover:bg-teal-700">
                Accept
            </button>
        `;
    }

    async function submitProposal() {
        const form = document.getElementById('athProposalForm');
        if (!form) return;
        
        const price = form.price.value;
        const letter = form.cover_letter.value;
        const startDate = form.estimated_start.value;
        const availability = form.availability.options[form.availability.selectedIndex].text;
        const msg = document.getElementById('athProposalMsg');

        if (!price || !letter || !startDate) {
            alert('Please fill in all required fields');
            return;
        }

        const btn = document.querySelector('#athJobModalActions button'); // primitive selector
        if(btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

        // Format detailed cover letter to include new fields (safe fallback if DB schema isn't updated)
        const detailedLetter = `[ESTIMATED START: ${startDate}]\n[AVAILABILITY: ${availability}]\n\n${letter}`;

        // Create
        const payload = {
            job_id: currentJob.id,
            tradie_id: currentUser.id,
            price: Number(price),
            cover_letter: detailedLetter,
            status: 'pending' // 'submitted' was causing check constraint violation
        };

        const { data, error } = await createProposal(payload);
        
        if (error) {
            console.error(error);
            if(msg) { msg.textContent = 'Error sending quote.'; msg.classList.remove('hidden'); msg.classList.add('text-red-600'); }
            if(btn) { btn.disabled = false; btn.textContent = 'Submit Quote'; }
            return;
        }

        if(msg) { msg.textContent = 'Quote sent successfully!'; msg.classList.remove('hidden'); msg.classList.add('text-green-600'); }
        
        // Refresh list if applicable
        if (typeof window.refetchJobs === 'function') {
            window.refetchJobs();
        }
        
        // Close after short delay
        setTimeout(() => {
            close();
        }, 1500);
    }

    async function acceptProposal(proposalId) {
        // Redirect to new Checkout flow
        window.location.href = `checkout.html?proposalId=${proposalId}`;
    }

    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    return {
        open,
        close,
        submitProposal,
        acceptProposal,
        closeJob
    };
})();

// Assign to window
window.ATHJobDetails = component;
console.log('ATHJobDetails component loaded');
})();

// Auto-init? Only if needed on page load.
// We just define it.
