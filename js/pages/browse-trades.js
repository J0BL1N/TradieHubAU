
import { searchTradies } from '../core/db.js';
// We also need access to utility functions if not global. 
// auth.js and script.js might be global. 

async function initBrowseTradies() {
    console.log('Initializing Browse Tradies (Real DB)...');
    
    // State
    let state = {
        filters: {
            search: '',
            state: '',
            trades: [],
            verified: false
        },
        sortBy: 'recommended',
        currentPage: 1,
        perPage: 12,
        loading: false
    };

    // Elements
    const els = {
        searchInput: document.getElementById('searchInput'),
        categoryFilter: document.getElementById('categoryFilter'), // This might be a select with trade IDs or names
        locationFilter: document.getElementById('locationFilter'),
        experienceFilter: document.getElementById('experienceFilter'), // DB might not support filtering by exp yet, do client side or ignore? 
        // Note: db.js searchTradies only supports: state, trades, verified, search. 
        // We'll ignore experience/sorting for now or do client-side sort.
        ratingFilter: document.getElementById('ratingFilter'),
        sortBy: document.getElementById('sortBy'),
        resultCount: document.getElementById('resultCount'),
        list: document.getElementById('tradiesList')
    };

    // Helper: Debounce
    const debounce = (fn, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), delay);
        };
    };

    // Load Data
    async function fetchTradies() {
        if (state.loading) return;
        state.loading = true;
        
        if (els.list) els.list.innerHTML = '<div class="col-span-full py-12 text-center text-gray-500">Loading professionals...</div>';
        if (els.resultCount) els.resultCount.textContent = 'Searching...';

        try {
            // Map filters to DB params
            const dbFilters = {
                search: state.filters.search,
                state: state.filters.state === 'all' ? '' : state.filters.state, // locationFilter is usually state or suburb? html uses 'locationFilter'.
                trades: state.filters.trades.length > 0 ? state.filters.trades : null,
                verified: state.filters.verified
            };

            // If locationFilter is text input, treat as 'state' if it matches state? 
            // Or just generic search supplement?
            // db.searchTradies takes 'state' (exact match usually).
            // Let's assume location filter is text for now and maybe just verify if it matches known states.
            // For MVP, if it's not a select, we might need to be careful. 
            // In browse-trades.html it looked like an input? "locationFilter". 
            // Step 1638: logic used `t.serviceArea.includes(locationTerm)`.
            // Real DB `searchTradies` expects strict `state`. 
            // We might need to update db.js to support partial location match or update UI to be a dropdown.
            // For now, let's proceed with what `db.js` offers.
            
            // Timeout wrapper
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timed out')), 5000)
            );

            const result = await Promise.race([
                searchTradies(dbFilters),
                timeoutPromise
            ]);

            const { data, error } = result;
            
            if (error) throw error;
            
            // Client-side filtering for things DB doesn't do yet (Experience, Rating)
            // And Sorting
            let results = data || [];
            
            // Experience (Optional, DB doesn't have it explicitly maybe? 'year_level' or similar in metadata?)
            // users table schema? 
            // Assume we simplify for now.

            // Render
            renderResults(results);

        } catch (err) {
            console.error('Error fetching tradies:', err);
            if (els.list) els.list.innerHTML = '<div class="col-span-full py-12 text-center text-red-500">Failed to load data. Please try again.</div>';
        } finally {
            state.loading = false;
        }
    }

    function renderResults(tradies) {
        if (!els.list) return;
        
        if (els.resultCount) els.resultCount.textContent = `${tradies.length} tradies found`;

        if (tradies.length === 0) {
            els.list.innerHTML = `
                <div class="col-span-full text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div class="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i data-feather="search" class="w-10 h-10 text-gray-400"></i>
                    </div>
                    <h3 class="text-base font-bold text-gray-900 dark:text-white mb-2">No professionals found</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Try adjusting your filters or search terms</p>
                    <button id="clearFiltersBtn" class="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium text-sm">
                        Clear All Filters
                    </button>
                    <!-- Demo Seed Prompt -->
                    <div class="mt-4 text-xs text-gray-400">
                        (Database might be empty. <a href="#" onclick="window.seedDemoData?.(); return false;" class="underline hover:text-teal-600">Seed Demo Data</a>)
                    </div>
                </div>
            `;
            
            const clearBtn = document.getElementById('clearFiltersBtn');
            if (clearBtn) clearBtn.addEventListener('click', clearFilters);
            
            if (typeof feather !== 'undefined') feather.replace();
            return;
        }

        els.list.innerHTML = tradies.map(t => {
            // Safety checks
            const name = t.display_name || 'Tradie';
            const trade = t.trade || (t.trades && t.trades[0]) || 'General';
            const location = [t.suburb, t.state].filter(Boolean).join(', ') || 'Australia';
            const rating = t.rating || '5.0';
            const reviewCount = t.review_count || 0;
            const bio = t.about || 'Experienced professional ready to help.';
            
            return `
                <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:shadow-md transition flex gap-3 ath-result-card">
                    <img src="${t.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D9488&color=fff`}" 
                         class="w-14 h-14 rounded-full border-2 border-teal-500 flex-shrink-0 object-cover" alt="${name}"/>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-start justify-between mb-1">
                            <div>
                                <h3 class="font-semibold text-sm text-gray-900 dark:text-white">${escapeHtml(name)}</h3>
                                <p class="text-xs text-gray-600 dark:text-gray-300">${escapeHtml(trade)}</p>
                            </div>
                            <div class="flex items-center gap-0.5 text-yellow-500">
                                <i data-feather="star" class="w-3 h-3 fill-current"></i>
                                <span class="text-gray-900 dark:text-white font-semibold text-xs">${rating}</span>
                                <span class="text-gray-500 dark:text-gray-400 text-xs">(${reviewCount})</span>
                            </div>
                        </div>
                        <p class="text-gray-600 dark:text-gray-300 text-xs mb-2 line-clamp-1">${escapeHtml(bio)}</p>
                        <div class="flex items-center justify-between ath-card-footer">
                            <div class="flex items-center gap-1 text-xs flex-wrap ath-card-tags">
                                <span class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-full flex items-center gap-0.5">
                                    <i data-feather="map-pin" class="w-2.5 h-2.5"></i> ${escapeHtml(location)}
                                </span>
                                ${t.verified ? `
                                <span class="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-full flex items-center gap-0.5">
                                    <i data-feather="check-circle" class="w-2.5 h-2.5"></i> Verified
                                </span>` : ''}
                            </div>
                            <div class="flex items-center gap-2">
                                <button onclick="window.ATH_ContactUser('${t.id}')"
                                   class="px-3 py-1 border border-teal-600 text-teal-600 dark:text-teal-400 dark:border-teal-400 rounded hover:bg-teal-50 dark:hover:bg-teal-900/20 font-medium text-xs whitespace-nowrap transition flex items-center gap-1">
                                    <i data-feather="message-square" class="w-3 h-3"></i> Contact
                                </button>
                                <a href="profile-tradesman.html?id=${t.id}" 
                                   class="bg-teal-600 text-white px-3 py-1 rounded hover:bg-teal-700 font-medium text-xs whitespace-nowrap transition">
                                    View
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (typeof feather !== 'undefined') feather.replace();
    }

    function clearFilters() {
        state.filters = { search: '', state: '', trades: [], verified: false };
        if (els.searchInput) els.searchInput.value = '';
        if (els.categoryFilter) els.categoryFilter.value = '';
        if (els.locationFilter) els.locationFilter.value = '';
        if (els.experienceFilter) els.experienceFilter.value = '';
        if (els.ratingFilter) els.ratingFilter.value = '';
        fetchTradies();
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

    // Event Listeners
    if (els.searchInput) {
        els.searchInput.addEventListener('input', debounce((e) => {
            state.filters.search = e.target.value;
            fetchTradies();
        }, 500));
    }

    if (els.locationFilter) {
        els.locationFilter.addEventListener('input', debounce((e) => {
            state.filters.state = e.target.value; 
            fetchTradies();
        }, 500));
    }

    if (els.categoryFilter) {
        els.categoryFilter.addEventListener('change', (e) => {
            const val = e.target.value;
            state.filters.trades = val ? [val] : [];
            fetchTradies();
        });
    }

    // URL Params Init
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) {
        state.filters.search = q;
        if (els.searchInput) els.searchInput.value = q;
    }

    // Initial Fetch
    await fetchTradies();
}

// Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBrowseTradies);
} else {
    initBrowseTradies();
}

// Expose for SPA
window.initBrowseTradies = initBrowseTradies;
