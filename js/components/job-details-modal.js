
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
        <div id="athJobModal" class="fixed inset-0 z-[100] hidden items-center justify-center p-3" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <!-- Backdrop -->
            <div class="fixed inset-0 bg-black/40 transition-opacity" onclick="window.ATHJobDetails.close()"></div>

            <div class="relative w-full max-w-5xl overflow-hidden rounded-2xl bg-white dark:bg-gray-800 shadow-xl transition-all">
                <!-- Sticky Header -->
                <div class="sticky top-0 z-10 border-b border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-4">
                    <div class="flex items-center justify-between">
                        <h2 class="text-sm font-extrabold tracking-wide text-slate-900 dark:text-white uppercase" id="modal-title">JOB DETAILS</h2>
                        <button onclick="window.ATHJobDetails.close()" class="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-700" aria-label="Close">
                            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none">
                                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" />
                            </svg>
                        </button>
                    </div>

                    <!-- Posted by (compact) - Injected in render() -->
                    <div id="athJobModalPostedBy"></div>
                </div>

                <!-- Body / Content -->
                <div class="max-h-[78vh] overflow-y-auto px-5 py-5" id="athJobModalBody">
                    <!-- 12-column grid on desktop -->
                    <div class="grid gap-6 lg:grid-cols-12" id="athJobModalGrid">
                        <!-- Left Column (Job Info) -->
                        <div class="lg:col-span-7" id="athJobModalLeft">
                            <!-- Injected in render() -->
                        </div>

                        <!-- Right Column (Quote Form / Proposals) -->
                        <div class="lg:col-span-5" id="athJobModalRight">
                            <!-- Injected in render() -->
                        </div>
                    </div>
                </div>

                <!-- Sticky Footer -->
                <div class="sticky bottom-0 z-10 border-t border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-4" id="athJobModalActions">
                    <!-- Buttons injected in render() -->
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
        modalEl.classList.add('flex'); // Ensure flex for centering
        
        // Reset and show loading state
        document.getElementById('athJobModalPostedBy').innerHTML = `<div class="mt-3 h-16 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-xl"></div>`;
        document.getElementById('athJobModalLeft').innerHTML = `
            <div class="animate-pulse space-y-4">
                <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                <div class="grid grid-cols-4 gap-3">
                    <div class="h-12 bg-gray-100 dark:bg-gray-700 rounded-xl"></div>
                    <div class="h-12 bg-gray-100 dark:bg-gray-700 rounded-xl"></div>
                    <div class="h-12 bg-gray-100 dark:bg-gray-700 rounded-xl"></div>
                    <div class="h-12 bg-gray-100 dark:bg-gray-700 rounded-xl"></div>
                </div>
                <div class="h-32 bg-gray-100 dark:bg-gray-700 rounded-xl"></div>
            </div>`;
        document.getElementById('athJobModalRight').innerHTML = `<div class="h-64 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-2xl"></div>`;
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
        if (modalEl) {
            modalEl.classList.add('hidden');
            modalEl.classList.remove('flex');
        }
    }

    async function render() {
        const postedByEl = document.getElementById('athJobModalPostedBy');
        const leftCol = document.getElementById('athJobModalLeft');
        const rightCol = document.getElementById('athJobModalRight');
        const actions = document.getElementById('athJobModalActions');
        
        const job = currentJob;
        if (!job) return;

        const status = (job.status || 'open').toString().toLowerCase().trim();
        const isOwner = currentUser && (String(currentUser.id) === String(job.customer_id || job.customerId));
        const canQuote = currentUser && !isOwner && (status === 'open');
        
        // Data prep
        const customer = job.customer || {};
        const customerName = customer.display_name || 'Customer';
        const initials = customerName.split(' ').map(n => n[0]).join('').toUpperCase();
        const customerAvatar = customer.avatar_url;

        const cats = job.categories || (job.category ? [job.category] : []);
        const catLabels = cats.map(c => {
             const co = (window.TRADE_CATEGORIES || []).find(x => x.id === c);
             return co ? co.label : c.charAt(0).toUpperCase() + c.slice(1);
        });

        const postedTime = job.created_at || job.postedAt;
        const timeStr = typeof window.timeAgo === 'function' ? window.timeAgo(postedTime) : 'recently';
        const budget = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(job.budget_max || job.budget_min || 0);

        // --- 1. POSTED BY (Header) ---
        postedByEl.innerHTML = `
            <div class="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/50 p-3">
                <div class="h-10 w-10 shrink-0 rounded-full bg-emerald-600 text-white flex items-center justify-center font-semibold overflow-hidden">
                    ${customerAvatar ? `<img src="${customerAvatar}" class="w-full h-full object-cover">` : initials}
                </div>
                <div class="min-w-0">
                    <div class="text-[11px] font-bold tracking-wide text-slate-500 uppercase">POSTED BY</div>
                    <div class="truncate text-sm font-semibold text-slate-900 dark:text-white">${customerName}</div>
                    <div class="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-gray-400">
                        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none">
                            <path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2"/>
                            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2"/>
                        </svg>
                        ${timeStr}
                    </div>
                </div>
            </div>
        `;

        // --- 2. LEFT COLUMN (Job Info) ---
        leftCol.innerHTML = `
            <h1 class="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">${escapeHtml(job.title)}</h1>

            <!-- Quick Stats (compact tiles) -->
            <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="rounded-xl border border-slate-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800">
                    <div class="text-[10px] font-extrabold tracking-wide text-slate-500 uppercase">STATE</div>
                    <div class="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                        <svg class="h-4 w-4 text-emerald-600" viewBox="0 0 24 24" fill="none">
                            <path d="M12 21s7-5 7-11a7 7 0 10-14 0c0 6 7 11 7 11z" stroke="currentColor" stroke-width="2"/>
                            <path d="M12 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" stroke-width="2"/>
                        </svg>
                        ${escapeHtml(job.state || 'VIC')}
                    </div>
                </div>

                <div class="rounded-xl border border-slate-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800">
                    <div class="text-[10px] font-extrabold tracking-wide text-slate-500 uppercase">BUDGET</div>
                    <div class="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-400">${budget}</div>
                </div>

                <div class="rounded-xl border border-slate-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800">
                    <div class="text-[10px] font-extrabold tracking-wide text-slate-500 uppercase">QUOTES</div>
                    <div class="mt-1 text-sm font-semibold text-slate-900 dark:text-white">${job.quoteCount || 0}</div>
                </div>

                <div class="rounded-xl border border-slate-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800">
                    <div class="text-[10px] font-extrabold tracking-wide text-slate-500 uppercase">STATUS</div>
                    <div class="mt-1 inline-flex rounded-md bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        ${status.toUpperCase()}
                    </div>
                </div>
            </div>

            <!-- Requirements -->
            <div class="mt-5">
                <div class="text-[10px] font-extrabold tracking-wide text-slate-500 uppercase">REQUIREMENTS</div>
                <div class="mt-2 flex flex-wrap gap-2">
                    ${catLabels.map(cl => `
                        <span class="rounded-full border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-gray-200 uppercase tracking-tight">
                            ${cl}
                        </span>
                    `).join('')}
                </div>
            </div>

            <!-- Description -->
            <div class="mt-5 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <div class="text-[10px] font-extrabold tracking-wide text-slate-500 uppercase">JOB DESCRIPTION</div>
                <p class="mt-2 text-sm text-slate-800 dark:text-gray-300 whitespace-pre-line leading-relaxed">${escapeHtml(job.description)}</p>
            </div>
        `;

        // --- 3. RIGHT COLUMN (Form / Proposals) ---
        if (isOwner) {
            rightCol.innerHTML = `
                <div class="rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
                    <div class="text-[11px] font-extrabold tracking-wide text-slate-500 uppercase mb-4">RECEIVED QUOTES</div>
                    <div id="athJobProposalsList" class="space-y-4">
                        <div class="text-sm text-gray-500 dark:text-gray-400 italic">Loading quotes...</div>
                    </div>
                </div>
            `;
            loadProposalsForOwner(job.id);
        } else if (canQuote) {
            rightCol.innerHTML = `
                <div class="rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
                    <div class="text-[11px] font-extrabold tracking-wide text-slate-500 uppercase mb-4">SUBMIT QUOTE</div>
                    <form id="athProposalForm">
                        <div class="grid gap-3">
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <!-- Total price -->
                                <label class="block">
                                    <div class="text-[10px] font-extrabold tracking-wide text-slate-500 uppercase">Total price ($)</div>
                                    <input type="number" name="price" inputmode="decimal" required
                                        class="mt-1 w-full rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-none focus:border-emerald-400 dark:text-white"
                                        placeholder="0.00" />
                                </label>

                                <!-- Start date -->
                                <label class="block">
                                    <div class="text-[10px] font-extrabold tracking-wide text-slate-500 uppercase">Est. start date</div>
                                    <div class="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
                                        <input type="date" name="estimated_start" required class="w-full text-sm outline-none bg-transparent dark:text-white" />
                                        <svg class="h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none">
                                            <path d="M7 3v3M17 3v3M4 8h16M6 6h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2z" stroke="currentColor" stroke-width="2"/>
                                        </svg>
                                    </div>
                                </label>
                            </div>

                            <!-- Availability -->
                            <label class="block">
                                <div class="text-[10px] font-extrabold tracking-wide text-slate-500 uppercase">Availability</div>
                                <select name="availability" required class="mt-1 w-full rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-none focus:border-emerald-400 dark:text-white">
                                    <option value="immediate">Available Immediately</option>
                                    <option value="this_week" selected>Can start this week</option>
                                    <option value="next_week">Available next week</option>
                                    <option value="within_month">Within 30 days</option>
                                    <option value="flexible">Flexible / Negotiable</option>
                                </select>
                            </label>

                            <!-- Cover letter -->
                            <label class="block">
                                <div class="text-[10px] font-extrabold tracking-wide text-slate-500 uppercase">Cover letter / details</div>
                                <textarea name="cover_letter" rows="5" required
                                    class="mt-1 w-full resize-none rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-none focus:border-emerald-400 dark:text-white"
                                    placeholder="Explain why you're the best for this job..."></textarea>
                            </label>

                            <p class="text-[10px] text-slate-500 dark:text-gray-400 leading-tight">
                                Keep it brief: timeframe, inclusions, warranty, and any questions.
                            </p>

                            <div id="athProposalMsg" class="text-xs font-bold hidden p-2 rounded-lg"></div>
                        </div>
                    </form>
                </div>
            `;
        } else if (!currentUser) {
            rightCol.innerHTML = `
                <div class="rounded-2xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/30 p-6 text-center shadow-sm">
                    <p class="text-sm font-semibold text-slate-900 dark:text-white mb-4">Are you a tradie?</p>
                    <a href="/index.html?action=login&redirect=/pages/jobs.html" class="inline-flex w-full justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition shadow-md">
                        Login to Quote
                    </a>
                    <p class="mt-2 text-xs text-slate-500">You must be logged in as a tradesperson to submit quotes.</p>
                </div>
            `;
        } else {
            rightCol.innerHTML = `
                <div class="rounded-2xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/30 p-6 text-center shadow-sm">
                    <p class="text-sm font-semibold text-slate-900 dark:text-white italic">Cannot submit quote for this job.</p>
                </div>
            `;
        }

        // --- 4. FOOTER ACTIONS ---
        let btns = '';
        if (isOwner) {
            btns = `
                <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button onclick="window.ATHJobDetails.close()" class="w-full rounded-xl border border-slate-200 dark:border-gray-700 px-6 py-2.5 text-sm font-semibold text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700 sm:w-auto">
                        Back to Board
                    </button>
                    <button onclick="window.ATHJobDetails.closeJob('${job.id}')" class="w-full rounded-xl bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition shadow-md sm:w-auto">
                        Close Job
                    </button>
                </div>
            `;
        } else if (canQuote) {
            btns = `
                <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button onclick="window.ATHJobDetails.close()" class="w-full rounded-xl border border-slate-200 dark:border-gray-700 px-6 py-2.5 text-sm font-semibold text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700 sm:w-auto">
                        Cancel
                    </button>
                    <button onclick="window.ATHJobDetails.submitProposal()" class="w-full rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition shadow-md sm:w-auto transform active:scale-95">
                        Submit Quote
                    </button>
                </div>
            `;
        } else {
            btns = `
                <div class="flex justify-end">
                    <button onclick="window.ATHJobDetails.close()" class="w-full rounded-xl border border-slate-200 dark:border-gray-700 px-8 py-2.5 text-sm font-semibold text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700 sm:w-auto">
                        Close
                    </button>
                </div>
            `;
        }
        actions.innerHTML = btns;

        if (typeof feather !== 'undefined') feather.replace();
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
