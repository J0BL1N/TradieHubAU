/**
 * ongoing-job.js
 * Controller for the single job workspace page.
 */

import { 
    getJobById, getJobAssignment, getInvoicesForJob, getJobEvents, logJobEvent, 
    createInvoice, updateInvoice, sendMessage,
    getVariationsForJob, getDisputesForJob, createVariation, updateVariationStatus, createDispute 
} from '../core/db.js';

let currentJob = null;
let currentAssignment = null;
let currentUser = null;
let invoiceItems = [];
let variations = [];
let disputes = [];
let activeTab = 'timeline';

async function initOngoingJob() {
    console.log('👷 Ongoing Job: Initializing...');

    // 1. Get Params
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get('id');

    if (!jobId) {
        window.location.href = 'jobs.html';
        return;
    }

    // 2. Auth Check
    currentUser = window.ATHAuth?.getSession?.();
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }

    try {
        // 3. Parallel Load Data
        const [jobRes, assignRes, invoicesRes, eventsRes, variationsRes, disputesRes] = await Promise.all([
            getJobById(jobId),
            getJobAssignment(jobId),
            getInvoicesForJob(jobId),
            getJobEvents(jobId),
            getVariationsForJob(jobId),
            getDisputesForJob(jobId)
        ]);

        if (jobRes.error || !jobRes.data) throw new Error('Job not found');
        currentJob = jobRes.data;

        if (assignRes.error || !assignRes.data) {
            alert('You do not have permission to view this job.');
            window.location.href = 'jobs.html';
            return;
        }
        currentAssignment = assignRes.data;

        // Verify participant
        const isParticipant = (currentUser.userId === currentAssignment.customer_id || currentUser.userId === currentAssignment.tradie_id);
        if (!isParticipant) {
            const main = document.getElementById('athMain');
            if (main) {
                main.innerHTML = `
                    <div class="flex flex-col items-center justify-center p-20 text-center">
                        <div class="w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-6">
                            <i data-feather="lock" class="w-10 h-10 text-red-600"></i>
                        </div>
                        <h2 class="text-2xl font-black text-slate-900 dark:text-white mb-2">Not Authorized</h2>
                        <p class="text-slate-500 max-w-sm mx-auto">You do not have permission to view this job workspace. Only the customer and assigned tradie can access this area.</p>
                        <a href="jobs.html" class="mt-8 px-6 py-3 bg-teal-600 text-white font-bold rounded-2xl hover:bg-teal-700 transition shadow-lg shadow-teal-500/20">Return to Board</a>
                    </div>
                `;
                if (typeof feather !== 'undefined') feather.replace();
            }
            return;
        }

        variations = variationsRes.data || [];
        disputes = disputesRes.data || [];

        // 4. Update UI
        renderJobInfo();
        renderParticipants();
        renderInvoices(invoicesRes.data || []);
        renderActivityTimeline(eventsRes.data || []);
        renderVariations();
        renderDisputes();
        renderWorkflowActions();
        
        switchTab('timeline'); // Default tab

        // 5. Handle Direct Links (Codex Step 4)
        const targetInvoiceId = params.get('invoice');
        if (targetInvoiceId) {
            const targetInv = (invoicesRes.data || []).find(i => i.id === targetInvoiceId);
            if (targetInv) {
                switchTab('invoices');
                showInvoiceViewer(targetInv);
            }
        }
        
        const targetVarId = params.get('variation');
        if (targetVarId) {
            const targetVar = (variationsRes.data || []).find(v => v.id === targetVarId);
            if (targetVar) {
                switchTab('variations');
                // Could highlight or open modal if needed, but switching tab is most reliable for now
            }
        }
        
    } catch (err) {
        console.error('Failed to load ongoing job:', err);
        const main = document.getElementById('athMain');
        if (main) {
            main.innerHTML = `
                <div class="p-20 text-center">
                    <div class="text-red-600 font-black text-xl mb-2">Load Error</div>
                    <div class="text-slate-500 text-sm">${err.message}</div>
                </div>
            `;
        }
    }

    if (typeof feather !== 'undefined') feather.replace();
}


function renderJobInfo() {
    setText('jobTitle', currentJob.title);
    setText('jobIdDisplay', `ID: ${currentJob.id.substring(0, 8)}`);
    setText('jobDescription', currentJob.description);
    setText('jobLocationText', `${currentJob.suburb}, ${currentJob.state}`);

    const reqsMount = document.getElementById('jobRequirements');
    if (reqsMount && currentJob.requirements) {
        reqsMount.innerHTML = currentJob.requirements.map(req => `
            <span class="px-3 py-1 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 rounded-full text-xs font-semibold">
                ${req}
            </span>
        `).join('');
    }

    const datesMount = document.getElementById('jobDates');
    if (datesMount) {
        datesMount.innerHTML = `
            <div class="flex justify-between text-sm">
                <span class="text-slate-400">Accepted</span>
                <span class="font-bold text-slate-700 dark:text-white">${new Date(currentAssignment.accepted_at).toLocaleDateString()}</span>
            </div>
            <div class="flex justify-between text-sm">
                <span class="text-slate-400">Target End</span>
                <span class="font-bold text-slate-700 dark:text-white">${currentJob.timeline || 'Flexible'}</span>
            </div>
        `;
    }
}

function renderParticipants() {
    const mount = document.getElementById('jobParticipants');
    if (!mount) return;

    const customer = currentAssignment.customer;
    const tradie = currentAssignment.tradie;

    mount.innerHTML = `
        <!-- Customer -->
        <div class="flex items-center gap-3">
            <img src="${customer.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(customer.display_name)}&background=f1f5f9&color=64748b`}" class="w-10 h-10 rounded-full object-cover border border-slate-100 dark:border-gray-600">
            <div>
                <div class="text-xs font-bold text-slate-400 uppercase tracking-wide">Customer</div>
                <div class="text-sm font-bold text-slate-900 dark:text-white">${customer.display_name}</div>
            </div>
        </div>
        <!-- Tradie -->
        <div class="flex items-center gap-3">
            <img src="${tradie.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(tradie.display_name)}&background=0d9488&color=fff`}" class="w-10 h-10 rounded-full object-cover border border-teal-100 dark:border-gray-600">
            <div>
                <div class="text-xs font-bold text-teal-600 uppercase tracking-wide">Tradie</div>
                <div class="text-sm font-bold text-slate-900 dark:text-white">${tradie.display_name}</div>
            </div>
        </div>
    `;
}

function renderInvoices(invoices) {
    const mount = document.getElementById('invoicesList');
    if (!mount) return;

    if (invoices.length === 0) {
        mount.innerHTML = `<div class="text-sm text-slate-500 italic p-4 bg-slate-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-slate-200 dark:border-gray-700">No invoices yet.</div>`;
        return;
    }

    mount.innerHTML = invoices.map(inv => {
        const isMeTradie = currentUser.userId === currentAssignment.tradie_id;
        const statusColors = {
            draft: 'bg-slate-100 text-slate-600',
            sent: 'bg-amber-100 text-amber-700',
            paid: 'bg-green-100 text-green-700',
            void: 'bg-red-100 text-red-700'
        };

        return `
            <div class="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-4 shadow-sm hover:border-teal-200 transition group cursor-pointer" onclick='window.handleInvoiceClick(${JSON.stringify(inv)})'>
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">INV-${inv.invoice_number}</div>
                        <div class="text-sm font-extrabold text-slate-900 dark:text-white">$${Number(inv.total).toFixed(2)}</div>
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${statusColors[inv.status] || 'bg-slate-100'}">${inv.status}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-[10px] text-slate-400">${new Date(inv.issue_date).toLocaleDateString()}</span>
                    <button class="text-[10px] font-bold text-teal-600 opacity-0 group-hover:opacity-100 transition">VIEW DETAILS →</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderActivityTimeline(events) {
    const mount = document.getElementById('activityTimeline');
    if (!mount) return;

    const icons = {
        quote_accepted: 'check-circle',
        invoice_created: 'file-text',
        invoice_sent: 'send',
        invoice_paid: 'dollar-sign',
        status_changed: 'refresh-cw'
    };

    mount.innerHTML = events.map(ev => {
        const date = new Date(ev.created_at);
        const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

        return `
            <div class="flex gap-4">
                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 dark:bg-gray-700 flex items-center justify-center border border-slate-200 dark:border-gray-600">
                    <i data-feather="${icons[ev.type] || 'info'}" class="w-4 h-4 text-slate-500"></i>
                </div>
                <div class="flex-1">
                    <div class="text-sm font-bold text-slate-900 dark:text-white">${formatEventTitle(ev)}</div>
                    <div class="text-xs text-slate-400">${dateStr} • ${timeStr}</div>
                </div>
            </div>
        `;
    }).join('');
    if (typeof feather !== 'undefined') feather.replace();
}

function formatEventTitle(ev) {
    switch (ev.type) {
        case 'quote_accepted': return 'Job accepted & activated';
        case 'invoice_created': return 'Invoice draft created';
        case 'invoice_sent': return `Invoice sent ($${Number(ev.payload.total).toFixed(2)})`;
        case 'invoice_paid': return 'Invoice marked as paid';
        case 'status_changed': return `Job status changed to ${ev.payload.status}`;
        default: return ev.type.replace('_', ' ');
    }
}

// --- TABS LOGIC ---
window.switchTab = function(tabName) {
    activeTab = tabName;
    
    // Hide all panes
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
    
    // Show active pane
    const pane = document.getElementById(`view-${tabName}`);
    if (pane) pane.classList.remove('hidden');

    // Update buttons
    ['timeline', 'invoices', 'variations', 'disputes'].forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        if(t === tabName) {
            btn.classList.add('bg-teal-50', 'dark:bg-teal-900/20', 'text-teal-600');
            btn.classList.remove('text-slate-400');
        } else {
            btn.classList.remove('bg-teal-50', 'dark:bg-teal-900/20', 'text-teal-600');
            btn.classList.add('text-slate-400');
        }
    });

    renderWorkflowActions();
}

function renderWorkflowActions() {
    const mount = document.getElementById('workflowActions');
    if (!mount) return;

    // Check for open disputes
    const hasOpenDispute = disputes.some(d => d.status === 'open');
    
    if (hasOpenDispute) {
        mount.innerHTML = `
            <div class="w-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
                <i data-feather="alert-triangle" class="w-5 h-5 text-red-600"></i>
                <div>
                    <div class="text-sm font-bold text-red-700 dark:text-red-400">Job is Disputed</div>
                    <div class="text-xs text-red-600 dark:text-red-300">Actions are locked until the dispute is resolved.</div>
                </div>
            </div>
        `;
        return;
    }

    const isTradie = currentUser.userId === currentAssignment.tradie_id;
    const isCustomer = currentUser.userId === currentAssignment.customer_id;

    // Invoices Tab Actions
    const btnCreateInvoice = document.getElementById('btnCreateInvoice');
    if (btnCreateInvoice) {
        btnCreateInvoice.style.display = (activeTab === 'invoices' && isTradie && !hasOpenDispute) ? 'flex' : 'none';
    }

    // Variations Tab Actions
    const btnRequestVariation = document.getElementById('btnRequestVariation');
    if (btnRequestVariation) {
        btnRequestVariation.style.display = (activeTab === 'variations' && isTradie && !hasOpenDispute) ? 'flex' : 'none';
    }
}

// --- VARIATIONS LOGIC ---
function renderVariations() {
    const mount = document.getElementById('variationsList');
    if (!mount) return;

    // Codex Step 6: Show banner if ANY variation is declined
    const hasDeclined = variations.some(v => v.status === 'declined');
    const bannerHtml = hasDeclined ? `
        <div class="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-center gap-3">
            <i data-feather="info" class="w-5 h-5 text-amber-600"></i>
            <div class="text-xs font-bold text-amber-800 dark:text-amber-400">
                Additional work requires approval. Declining a variation does not cancel the original job agreement.
            </div>
        </div>
    ` : '';

    if (variations.length === 0) {
        mount.innerHTML = bannerHtml + `<div class="text-sm text-slate-500 italic text-center py-8">No variations requested.</div>`;
        return;
    }

    const isCustomer = currentUser.userId === currentAssignment.customer_id;

    mount.innerHTML = bannerHtml + variations.map(v => {
        const statusColors = {
            pending_customer: 'bg-amber-100 text-amber-700',
            approved: 'bg-teal-100 text-teal-700',
            declined: 'bg-red-100 text-red-700',
            cancelled: 'bg-slate-100 text-slate-600'
        };

        const showActions = isCustomer && v.status === 'pending_customer';

        return `
            <div class="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <div class="text-sm font-bold text-slate-900 dark:text-white">${v.title}</div>
                        <div class="text-xs text-slate-500 mt-1">${v.description}</div>
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${statusColors[v.status]}">${v.status.replace('_', ' ')}</span>
                </div>
                <div class="flex justify-between items-end mt-3">
                     <span class="text-sm font-black text-slate-900 dark:text-white">+$${Number(v.amount).toFixed(2)}</span>
                     
                     ${showActions ? `
                        <div class="flex gap-2">
                            <button onclick="updateVariation('${v.id}', 'declined')" class="px-3 py-1 bg-red-50 text-red-600 text-xs font-bold rounded-lg hover:bg-red-100">Decline</button>
                            <button onclick="updateVariation('${v.id}', 'approved')" class="px-3 py-1 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 shadow-sm">Approve</button>
                        </div>
                     ` : ''}
                </div>
            </div>
        `;
    }).join('');
    if (typeof feather !== 'undefined') feather.replace();
}

window.openVariationModal = () => {
    document.getElementById('variationModal').classList.remove('hidden');
    document.getElementById('variationModal').classList.add('flex');
}
window.hideVariationModal = () => {
    document.getElementById('variationModal').classList.add('hidden');
    document.getElementById('variationModal').classList.remove('flex');
}

window.submitVariation = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
        job_id: currentJob.id,
        tradie_id: currentUser.userId,
        customer_id: currentAssignment.customer_id,
        title: formData.get('title'),
        description: formData.get('description'),
        amount: formData.get('amount'),
        status: 'pending_customer'
    };

    try {
        const res = await createVariation(data);
        if (res.error) throw res.error;

        await logJobEvent(currentJob.id, 'variation_requested', currentUser.userId, { 
            variation_id: res.data.id, 
            amount: data.amount 
        });

        // Send message (Codex Step 6)
        const conv = await window.ATHDB.getOrCreateConversation(currentAssignment.customer_id, currentAssignment.tradie_id, currentJob.id);
        if (conv.data) {
            const cleanUrl = `/jobs/${currentJob.id}?variation=${res.data.id}`;
            await sendMessage(conv.data.id, currentUser.userId, `Requested a variation: ${data.title} ($${data.amount}) [Review Details](${cleanUrl})`, 'variation', { 
                job_id: currentJob.id, variation_id: res.data.id, amount: data.amount 
            });
        }

        alert('Variation requested!');
        hideVariationModal();
        initOngoingJob();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

window.updateVariation = async (id, status) => {
    if (!confirm(`Are you sure you want to ${status} this variation?`)) return;
    try {
        await updateVariationStatus(id, status);
        await logJobEvent(currentJob.id, `variation_${status}`, currentUser.userId, { variation_id: id });
        
        // Send decision message
        const conv = await window.ATHDB.getOrCreateConversation(currentAssignment.customer_id, currentAssignment.tradie_id, currentJob.id);
        if (conv.data) {
            const statusText = status === 'approved' ? 'APPROVED' : 'DECLINED';
            await sendMessage(conv.id, currentUser.userId, `Variation ${statusText}.`, 'system', { 
                job_id: currentJob.id, variation_id: id, status: status 
            });
        }

        initOngoingJob();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// --- DISPUTES LOGIC ---
function renderDisputes() {
    const mount = document.getElementById('disputesList');
    if (!mount) return;

    if (disputes.length === 0) {
        mount.innerHTML = `<div class="text-sm text-slate-500 italic text-center py-8">No active disputes.</div>`;
        return;
    }

    mount.innerHTML = disputes.map(d => `
        <div class="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl p-4">
            <div class="flex justify-between mb-2">
                <span class="text-xs font-bold text-red-600 uppercase tracking-wider">${d.reason.replace('_', ' ')}</span>
                <span class="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold uppercase">${d.status}</span>
            </div>
            <p class="text-sm text-slate-700 dark:text-red-100">${d.description}</p>
            <div class="mt-3 text-[10px] text-slate-400">Opened by ${d.opened_by === currentUser.userId ? 'You' : 'Other Party'} on ${new Date(d.created_at).toLocaleDateString()}</div>
        </div>
    `).join('');
}

window.openDisputeModal = () => {
    document.getElementById('disputeModal').classList.remove('hidden');
    document.getElementById('disputeModal').classList.add('flex');
}
window.hideDisputeModal = () => {
    document.getElementById('disputeModal').classList.add('hidden');
    document.getElementById('disputeModal').classList.remove('flex');
}

window.submitDispute = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
        job_id: currentJob.id,
        opened_by: currentUser.userId,
        against_party: currentUser.userId === currentAssignment.tradie_id ? currentAssignment.customer_id : currentAssignment.tradie_id,
        reason: formData.get('reason'),
        description: formData.get('description'),
        status: 'open'
    };

    try {
        const res = await createDispute(data);
        if (res.error) throw res.error;

        // Codex Step 7: Update assignment status & log event
        await window.ATHDB.updateJobAssignmentStatus(currentJob.id, 'disputed');
        await logJobEvent(currentJob.id, 'dispute_opened', currentUser.userId, { dispute_id: res.data.id });
        
        // Send system message
        const conv = await window.ATHDB.getOrCreateConversation(currentAssignment.customer_id, currentAssignment.tradie_id, currentJob.id);
        if (conv.data) {
            await sendMessage(conv.data.id, currentUser.userId, `A dispute has been opened regarding this job. Workflow actions are now locked.`, 'system', { 
                job_id: currentJob.id, dispute_id: res.data.id 
            });
        }

        alert('Dispute opened. Support will review shortly.');
        hideDisputeModal();
        initOngoingJob();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// --- Invoice Management ---

// --- Invoice Management ---

window.applyDuePreset = function(val) {
    if (val === 'custom') return;
    const issueDate = document.getElementById('invIssueDate').value;
    const date = issueDate ? new Date(issueDate) : new Date();
    
    if (val === 'receipt') {
        document.getElementById('invDueDate').value = date.toISOString().split('T')[0];
    } else {
        date.setDate(date.getDate() + parseInt(val));
        document.getElementById('invDueDate').value = date.toISOString().split('T')[0];
    }
}

window.toggleAdvanced = function() {
    const sec = document.getElementById('advancedSection');
    const icon = document.getElementById('advIcon');
    const isHidden = sec.classList.contains('hidden');
    
    sec.classList.toggle('hidden');
    if (icon) {
        icon.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
    }
}

window.showInvoiceEditor = function(invoice = null) {
    const modal = document.getElementById('invoiceModal');
    const form = document.getElementById('invoiceForm');
    const title = document.getElementById('invoiceModalTitle');
    const btnSend = document.getElementById('btnSendInvoice');
    const btnSave = document.getElementById('btnSaveInvoice');
    const numDisplay = document.getElementById('invoiceNumberDisplay');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    form.reset();
    
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('invIssueDate').value = today;
    
    invoiceItems = [{ description: '', qty: 1, unit_price: 0 }];
    if (invoice) {
        title.textContent = `Edit Invoice`;
        numDisplay.textContent = `Invoice INV-${invoice.invoice_number}`;
        document.getElementById('invIssueDate').value = invoice.issue_date;
        document.getElementById('invDueDate').value = invoice.due_date;
        document.getElementById('invNotes').value = invoice.notes || '';
        document.getElementById('invInclusions').value = invoice.notes_inclusions || '';
        document.getElementById('invExclusions').value = invoice.notes_exclusions || '';
        document.getElementById('invWarranty').value = invoice.notes_warranty || '';
        document.getElementById('invTerms').value = invoice.notes_payment_terms || '';
        document.getElementById('invMessage').value = invoice.accompanying_message || '';
        document.getElementById('gstToggle').checked = !!invoice.gst_enabled;
        
        invoiceItems = invoice.items || [{ description: '', qty: 1, unit_price: 0 }];
        
        // Disable editing if sent
        const isLocked = ['sent', 'paid', 'void'].includes(invoice.status);
        [...form.elements].forEach(el => el.disabled = isLocked);
        btnSend.style.display = isLocked ? 'none' : '';
        btnSave.style.display = isLocked ? 'none' : '';
    } else {
        title.textContent = 'New Invoice';
        numDisplay.textContent = 'Draft #---';
        btnSend.style.display = '';
        btnSave.style.display = '';
        [...form.elements].forEach(el => el.disabled = false);
    }

    renderInvoiceItems();
    updateInvoiceTotal();

    // Attach listeners
    btnSave.onclick = (e) => saveInvoice(e, invoice?.id, 'draft');
    btnSend.onclick = (e) => saveInvoice(e, invoice?.id, 'submitted');
}

window.hideInvoiceModal = function() {
    const modal = document.getElementById('invoiceModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function renderInvoiceItems() {
    const mount = document.getElementById('invoiceItemsList');
    mount.innerHTML = invoiceItems.map((item, idx) => `
        <div class="flex gap-3 items-end group">
            <div class="flex-1">
                <input type="text" placeholder="Description" value="${item.description}" 
                    class="w-full px-4 py-3 bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-2xl text-sm font-medium"
                    onchange="updateItem(${idx}, 'description', this.value)">
            </div>
            <div class="w-20">
                <input type="number" placeholder="Qty" value="${item.qty}"
                    class="w-full px-4 py-3 bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-2xl text-sm font-bold text-center"
                    onchange="updateItem(${idx}, 'qty', this.value)">
            </div>
            <div class="w-32">
                <div class="relative">
                    <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                    <input type="number" step="0.01" placeholder="0.00" value="${item.unit_price}"
                        class="w-full pl-8 pr-4 py-3 bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-2xl text-sm font-bold"
                        onchange="updateItem(${idx}, 'unit_price', this.value)">
                </div>
            </div>
            <button type="button" onclick="removeInvoiceItem(${idx})" class="p-3 text-slate-300 hover:text-red-500 transition-colors">
                <i data-feather="trash-2" class="w-4 h-4"></i>
            </button>
        </div>
    `).join('');
    if (typeof feather !== 'undefined') feather.replace();
}

window.addInvoiceItem = function() {
    invoiceItems.push({ description: '', qty: 1, unit_price: 0 });
    renderInvoiceItems();
}

window.removeInvoiceItem = function(idx) {
    if (invoiceItems.length > 1) {
        invoiceItems.splice(idx, 1);
        renderInvoiceItems();
        updateInvoiceTotal();
    }
}

window.updateItem = function(idx, field, value) {
    invoiceItems[idx][field] = field === 'description' ? value : Number(value);
    updateInvoiceTotal();
}

function updateInvoiceTotal() {
    // Codex Step 5: Enforce read-only total based on (Quote + Approved Variations)
    const quoteAmount = Number(currentAssignment.quote?.price || 0);
    const approvedVariationsSum = variations
        .filter(v => v.status === 'approved')
        .reduce((sum, v) => sum + Number(v.amount), 0);
    
    const escrowTotal = quoteAmount + approvedVariationsSum;

    // We still show the calculated items total for UI feedback, 
    // but the final invoice.total is locked to the escrowTotal for the completion invoice.
    // However, if we want to allow partial invoices, that's different. 
    // But the requirement says "invoice.total is read-only and equals accepted quote total + sum(approved variations)".
    // This implies ONE completion invoice.

    const subtotal = escrowTotal; // Simplified: we treat the contract value as the subtotal
    const gstEnabled = document.getElementById('gstToggle')?.checked;
    const gst = gstEnabled ? subtotal * 0.1 : 0;
    const total = subtotal + (gstEnabled ? gst : 0);

    setText('invoiceSubtotalDisplay', `$${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`);
    setText('invoiceGstDisplay', `$${gst.toLocaleString(undefined, {minimumFractionDigits: 2})}`);
    setText('invoiceTotal', `$${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`);

    document.getElementById('gstRow')?.classList.toggle('hidden', !gstEnabled);
}
window.updateInvoiceTotal = updateInvoiceTotal;

async function saveInvoice(e, existingId, targetStatus) {
    e.preventDefault();
    const btn = e.target;
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';

    const subtotal = invoiceItems.reduce((acc, item) => acc + (item.qty * item.unit_price), 0);
    const gstEnabled = document.getElementById('gstToggle').checked;
    const gst = gstEnabled ? subtotal * 0.1 : 0;
    const total = subtotal + gst;

    const invoiceData = {
        job_id: currentJob.id,
        tradie_id: currentAssignment.tradie_id,
        customer_id: currentAssignment.customer_id,
        issue_date: document.getElementById('invIssueDate').value,
        due_date: document.getElementById('invDueDate').value || null,
        notes: document.getElementById('invNotes').value,
        notes_inclusions: document.getElementById('invInclusions').value,
        notes_exclusions: document.getElementById('invExclusions').value,
        notes_warranty: document.getElementById('invWarranty').value,
        notes_payment_terms: document.getElementById('invTerms').value,
        accompanying_message: document.getElementById('invMessage').value,
        gst_enabled: gstEnabled,
        subtotal: subtotal,
        tax: gst,
        total: total,
        status: targetStatus,
        sent_at: targetStatus === 'sent' ? new Date().toISOString() : null
    };

    const items = invoiceItems.map((it, idx) => ({
        description: it.description,
        qty: it.qty,
        unit_price: it.unit_price,
        line_total: it.qty * it.unit_price,
        sort_order: idx
    }));

    try {
        let res;
        if (existingId) {
            res = await updateInvoice(existingId, invoiceData, items);
        } else {
            res = await createInvoice(invoiceData, items);
        }

        if (res.error) throw res.error;

        // Log Event
        const eventType = targetStatus === 'submitted' ? 'invoice_submitted' : 'invoice_created';
        await logJobEvent(currentJob.id, eventType, currentUser.userId, {
            invoice_id: res.data.id,
            total: total
        });

        // If submitted, send message card (Codex Step 5)
        if (targetStatus === 'submitted') {
            const conv = await window.ATHDB.getOrCreateConversation(currentAssignment.customer_id, currentAssignment.tradie_id, currentJob.id);
            if (conv.data) {
                const customMsg = invoiceData.accompanying_message || `Completion invoice submitted: $${total.toFixed(2)}`;
                // Use clean route /jobs/:jobId
                const cleanUrl = `/jobs/${currentJob.id}?invoice=${res.data.id}`;
                
                await sendMessage(
                    conv.data.id, 
                    currentUser.userId, 
                    `${customMsg} [View Invoice](${cleanUrl})`,
                    'invoice',
                    { 
                        job_id: currentJob.id, 
                        invoice_id: res.data.id,
                        total: total,
                        due_date: invoiceData.due_date,
                        gst_enabled: gstEnabled,
                        status: 'submitted'
                    }
                );
            }
        }

        hideInvoiceModal();
        initOngoingJob(); // Refresh

    } catch (err) {
        console.error('Save invoice error:', err);
        alert('Failed to save invoice: ' + err.message);
        btn.disabled = false;
        btn.textContent = originalText;
    }
}
window.saveInvoice = saveInvoice;

window.handleInvoiceClick = function(inv) {
    const isMeTradie = currentUser.userId === currentAssignment.tradie_id;
    if (isMeTradie && inv.status === 'draft') {
        showInvoiceEditor(inv);
    } else {
        showInvoiceViewer(inv);
    }
}

function showInvoiceViewer(inv) {
    const isMeCustomer = currentUser.userId === currentAssignment.customer_id;
    const itemsHtml = inv.items.map(it => `
        <div class="flex justify-between py-3 border-b border-slate-50 dark:border-gray-700/50 text-sm">
            <div class="text-slate-700 dark:text-gray-300 font-medium">${it.description} <span class="text-slate-400 font-normal ml-1">x ${it.qty}</span></div>
            <div class="font-extrabold text-slate-900 dark:text-white">$${Number(it.line_total).toFixed(2)}</div>
        </div>
    `).join('');

    const modal = document.getElementById('invoiceModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    document.getElementById('invoiceModalTitle').textContent = `View Invoice`;
    document.getElementById('invoiceNumberDisplay').textContent = `Invoice INV-${inv.invoice_number}`;
    
    const body = modal.querySelector('.p-6.overflow-y-auto');
    body.innerHTML = `
        <div class="space-y-8">
            <div class="grid grid-cols-2 gap-4">
               <div class="bg-slate-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-slate-100 dark:border-gray-700">
                  <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">STATUS</div>
                  <span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-teal-500/10 text-teal-600 border border-teal-500/20">${inv.status}</span>
               </div>
               <div class="bg-slate-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-slate-100 dark:border-gray-700">
                  <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">DUE DATE</div>
                  <div class="text-sm font-extrabold text-slate-900 dark:text-white">${inv.due_date ? new Date(inv.due_date).toLocaleDateString() : 'On Receipt'}</div>
               </div>
            </div>

            <div>
                <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">BILLING SUMMARY</div>
                <div class="bg-white dark:bg-gray-800 rounded-3xl border border-slate-100 dark:border-gray-700 p-6 shadow-sm">
                    ${itemsHtml}
                    <div class="space-y-2 mt-4 pt-4 border-t border-slate-50 dark:border-gray-700/50">
                        <div class="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
                            <span>Subtotal</span>
                            <span>$${Number(inv.subtotal || 0).toFixed(2)}</span>
                        </div>
                        ${inv.gst_enabled ? `
                        <div class="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
                            <span>GST (10%)</span>
                            <span>$${Number(inv.tax || 0).toFixed(2)}</span>
                        </div>
                        ` : ''}
                        <div class="flex justify-between pt-4 mt-2 border-t border-slate-100 dark:border-gray-700">
                            <span class="font-black text-slate-900 dark:text-white uppercase tracking-tighter">Total Due</span>
                            <span class="text-2xl font-black text-teal-600 tracking-tighter">$${Number(inv.total).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>

            ${(inv.notes_inclusions || inv.notes_exclusions || inv.notes_warranty || inv.notes_payment_terms) ? `
                <div class="space-y-4">
                    <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest">PROJECT DETAILS</div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${inv.notes_inclusions ? `<div><div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Inclusions</div><div class="text-xs text-slate-600 dark:text-gray-400">${inv.notes_inclusions}</div></div>` : ''}
                        ${inv.notes_exclusions ? `<div><div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Exclusions</div><div class="text-xs text-slate-600 dark:text-gray-400">${inv.notes_exclusions}</div></div>` : ''}
                        ${inv.notes_warranty ? `<div><div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Warranty</div><div class="text-xs text-slate-600 dark:text-gray-400">${inv.notes_warranty}</div></div>` : ''}
                        ${inv.notes_payment_terms ? `<div><div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Terms</div><div class="text-xs text-slate-600 dark:text-gray-400">${inv.notes_payment_terms}</div></div>` : ''}
                    </div>
                </div>
            ` : ''}

            ${inv.notes ? `
                <div>
                    <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">GENERAL NOTES</div>
                    <div class="text-xs text-slate-600 dark:text-gray-400 bg-slate-50 dark:bg-gray-900 p-4 rounded-2xl border border-slate-100 dark:border-gray-700/50">${inv.notes}</div>
                </div>
            ` : ''}
        </div>
    `;

    const footer = modal.querySelector('.p-6.border-t');
    
    // ACTION BUTTONS LOGIC
    let actionButtons = '';
    
    // Customer Actions
    if (isMeCustomer) {
        if (inv.status === 'submitted') {
            actionButtons = `
                <button onclick="approveRelease('${inv.id}')" class="w-full md:w-auto px-6 py-3 rounded-2xl text-sm font-black bg-teal-600 text-white hover:bg-teal-700 transition shadow-xl shadow-teal-500/20 uppercase tracking-wider flex items-center justify-center gap-2">
                    <i data-feather="check-circle" class="w-4 h-4"></i> Approve & Release Funds
                </button>
            `;
        } else if (inv.status === 'approved') {
            actionButtons = `
                <div class="flex items-center gap-2 text-teal-600 font-bold text-sm bg-teal-50 px-4 py-2 rounded-xl border border-teal-100">
                    <i data-feather="check-circle" class="w-4 h-4"></i> Funds Released on ${new Date(inv.approved_at).toLocaleDateString()}
                </div>
            `;
        }
    } 
    // Tradie Actions
    else if (!isMeCustomer && inv.status === 'draft') {
        actionButtons = `
            <button onclick="showInvoiceEditor(currentInvoice)" class="px-6 py-3 rounded-2xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition">Edit Draft</button>
        `;
    }

    footer.innerHTML = `
        <button onclick="hideInvoiceModal()" class="w-full md:w-auto px-8 py-3 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition">Close Preview</button>
        ${actionButtons}
    `;
    
    // Store current invoice for edit reference
    window.currentInvoice = inv;
    if (typeof feather !== 'undefined') feather.replace();
}

window.approveRelease = async function(invoiceId) {
    if (!confirm('This will approve the work and release funds to the tradie. Proceed?')) return;
    
    try {
        // 1. Update invoice status to approved
        const res = await updateInvoice(invoiceId, { 
            status: 'approved', 
            approved_at: new Date().toISOString() 
        });
        if (res.error) throw res.error;

        // 2. Log event
        await logJobEvent(currentJob.id, 'invoice_approved', currentUser.userId, { invoice_id: invoiceId });

        // 3. Send system message
        const conv = await window.ATHDB.getOrCreateConversation(currentAssignment.customer_id, currentAssignment.tradie_id, currentJob.id);
        if (conv.data) {
            await sendMessage(conv.data.id, currentUser.userId, `Invoice approved. Funds have been released.`, 'system', { 
                job_id: currentJob.id, invoice_id: invoiceId 
            });
        }

        alert('Funds released successfully!');
        hideInvoiceModal();
        initOngoingJob();

    } catch (err) {
        console.error('Approval error:', err);
        alert('Error: ' + err.message);
    }
}

// --- Utils ---
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// Intercept SPA navigation or simple direct load
document.addEventListener('DOMContentLoaded', () => {
    initOngoingJob();
});

// For SPA
window.initOngoingJobPage = initOngoingJob;
window.openInvoiceModal = () => showInvoiceEditor();
