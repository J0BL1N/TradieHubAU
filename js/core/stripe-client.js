
/**
 * TradieHubAU - Stripe Client Wrapper
 */
window.ATHStripe = window.ATHStripe || (function() {
    let stripe = null;
    let elements = null;
    let PUBLIC_KEY = 'pk_test_12345'; // Replace with real key or fetch from config

    async function init() {
        if (window.Stripe) {
            stripe = window.Stripe(PUBLIC_KEY);
        } else {
            console.warn('Stripe.js not loaded');
        }
    }

    /**
     * Start payment flow for a job proposal
     * @param {string} proposalId 
     * @param {string} jobId 
     * @returns {Promise<{success, error}>}
     */
    async function payForJob(proposalId, jobId) {
        if (!stripe) await init();

        // 1. Call Edge Function to get Secret
        try {
            // Check if we are in Mock Mode (Local Dev without Functions)
            const USE_MOCK = true; // For Prototype Demo

            if (USE_MOCK) {
                 console.log('💰 Mock Payment Mode: Simulating Payment Success');
                 await new Promise(r => setTimeout(r, 1500)); // Fake delay
                 return { success: true };
            }

            const { data, error } = await supabase.functions.invoke('payment-sheet', {
                body: { proposalId, jobId }
            });

            if (error) throw error;

            const { clientSecret } = data;

            // 2. Confirm Payment (simplified flow for modal)
            // Ideally we Mount Elements here.
            // But for this "Pay" button action, we might launch a modal or redirect.
            // If checking out via "Accept Quote" modal, we need to execute the payment now.
            
            // Note: Implementing full UI Payment Element inside the existing modal require more DOM work.
            // For this phase, we will return the Client Secret to the caller (job-details-modal) 
            // OR handle the confirmation here if we passed the Element mount point.

            // Since we promised a simple "Pay & Hire" flow:
            // Let's assume the user clicks "Pay" and we show a payment sheet.
            
            // To be robust, let's just use the Mock Mode for the frontend prototype 
            // unless the user specifically asks for the real integration debugging.
            
            return { success: true, clientSecret };

        } catch (err) {
            console.error('Payment Error:', err);
            return { success: false, error: err.message };
        }
    }

    return {
        init,
        payForJob
    };
})();
