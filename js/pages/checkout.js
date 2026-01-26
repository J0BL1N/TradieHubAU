
import { getProposalById, updateJob, updateProposalStatus, getOrCreateConversation, sendMessage } from '../core/db.js';

/**
 * Checkout Page Controller
 */
async function initCheckout() {
    console.log('📦 Checkout: Initializing...');

    // 1. Get Params
    const params = new URLSearchParams(window.location.search);
    const proposalId = params.get('proposalId');

    if (!proposalId) {
        console.error('No proposal ID provided');
        alert('Invalid checkout session. Redirecting...');
        window.location.href = 'jobs.html';
        return;
    }

    // 2. Elements
    const els = {
        loading: document.getElementById('loadingSummary'),
        content: document.getElementById('orderContent'),
        tradieAvatar: document.getElementById('tradieAvatar'),
        tradieName: document.getElementById('tradieName'),
        jobTitle: document.getElementById('jobTitle'),
        quoteAmount: document.getElementById('quoteAmount'),
        platformFee: document.getElementById('platformFee'),
        totalAmount: document.getElementById('totalAmount'),
        btnTotal: document.getElementById('btnTotal'),
        paymentForm: document.getElementById('paymentForm'),
        payBtn: document.getElementById('payBtn'),
        successOverlay: document.getElementById('successOverlay')
    };

    try {
        // 3. Fetch Data
        const { data: proposal, error } = await getProposalById(proposalId);
        if (error || !proposal) throw new Error('Proposal not found');

        const job = proposal.job || {};
        const tradie = proposal.tradie || {};

        // 4. Calculate Tiered Fees
        const amount = Number(proposal.price);
        let fee = 0;
        let feeLabel = 'Platform Fee';

        if (amount <= 500) {
            fee = 25;
            feeLabel = 'Flat Service Fee';
        } else if (amount <= 2000) {
            fee = amount * 0.05;
            feeLabel = 'Platform Fee (5%)';
        } else if (amount <= 5000) {
            fee = amount * 0.04;
            feeLabel = 'Platform Fee (4%)';
        } else if (amount <= 15000) {
            fee = amount * 0.03;
            feeLabel = 'Platform Fee (3%)';
        } else {
            fee = 500;
            feeLabel = 'Capped Platform Fee';
        }

        const total = amount + fee;

        // 5. Update UI
        els.tradieAvatar.src = tradie.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(tradie.display_name)}&background=0d9488&color=fff`;
        els.tradieName.textContent = tradie.display_name || 'Tradie';
        els.jobTitle.textContent = job.title || 'Service Request';
        els.quoteAmount.textContent = `$${amount.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        els.platformFee.textContent = `$${fee.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        
        // Update fee label in summary
        const feeLabelEl = document.querySelector('span#platformFee').previousElementSibling;
        if (feeLabelEl) feeLabelEl.textContent = feeLabel;

        els.totalAmount.textContent = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        els.btnTotal.textContent = total.toLocaleString(undefined, {minimumFractionDigits: 2});

        // Switch states
        els.loading.classList.add('hidden');
        els.content.classList.remove('hidden');

        // 6. Handle Payment
        els.paymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (els.payBtn.disabled) return;
            
            // Start loading
            els.payBtn.disabled = true;
            els.payBtn.innerHTML = `
                <div class="flex items-center gap-2">
                    <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verifying Payment...
                </div>
            `;

            try {
                // A. Simulate Real Payment Processing
                await new Promise(r => setTimeout(r, 2500)); 

                // B. Update DB State (Atomic-ish)
                console.log('🔄 Payment success: Updating database...');
                
                // 1. Update Job -> in_progress
                const { error: jErr } = await updateJob(job.id, { status: 'in_progress' });
                if (jErr) throw jErr;

                // 2. Update Proposal -> accepted
                const { error: pErr } = await updateProposalStatus(proposalId, 'accepted');
                if (pErr) throw pErr;

                // 3. Initiate Conversation
                console.log('💬 Initializing conversation...');
                const { data: conv, error: cErr } = await getOrCreateConversation(job.customer_id, tradie.id, job.id);
                if (!cErr && conv) {
                    // Send first automated message
                    const welcomeMsg = `Hi ${tradie.display_name}! I've just accepted your quote and paid for the job: "${job.title}". Looking forward to getting this started!`;
                    await sendMessage(conv.id, job.customer_id, welcomeMsg);
                }

                // C. Show Success
                els.successOverlay.classList.remove('pointer-events-none');
                els.successOverlay.classList.remove('opacity-0');
                els.successOverlay.querySelector('div').classList.remove('scale-95');

                // D. Redirect
                setTimeout(() => {
                    window.location.href = 'messages.html';
                }, 3000);

            } catch (err) {
                console.error('Checkout error:', err);
                alert('An error occurred during payment processing. Please try again.');
                els.payBtn.disabled = false;
                els.payBtn.textContent = `Confirm Hiring & Pay $${total.toFixed(2)}`;
            }
        });

    } catch (err) {
        console.error('Failed to load checkout:', err);
        document.body.innerHTML = `<div class="p-20 text-center font-bold text-red-600">Failed to load order session. Error: ${err.message}</div>`;
    }
}

// Global Feather replace helper
document.addEventListener('DOMContentLoaded', () => {
    initCheckout();
});
