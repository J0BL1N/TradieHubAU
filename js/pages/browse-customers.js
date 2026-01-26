
import { searchCustomers } from '../core/db.js';

async function initBrowseCustomers() {
    console.log('Initializing Browse Customers (Real DB)...');
    
    // State
    let state = {
        filters: {
            search: '',
            state: '',
        },
        sortBy: 'newest',
        currentPage: 1,
        perPage: 12,
        loading: false
    };

    // Elements
    const els = {
        searchInput: document.getElementById('searchInput'),
        locationFilter: document.getElementById('locationFilter'),
        sortBy: document.getElementById('sortBy'),
        resultCount: document.getElementById('resultCount'),
        list: document.getElementById('customersList')
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
    async function fetchCustomers() {
        if (state.loading) return;
        state.loading = true;
        
        if (els.list) els.list.innerHTML = '<div class="col-span-full py-12 text-center text-gray-500">Loading customers...</div>';
        if (els.resultCount) els.resultCount.textContent = 'Searching...';

        try {
            const dbFilters = {
                search: state.filters.search,
                state: state.filters.state === 'all' ? '' : state.filters.state
            };
            
            const { data, error } = await searchCustomers(dbFilters);
            
            if (error) throw error;
            
            // Client-side Sort/Map if needed
            let results = data || [];
            
            renderResults(results);

        } catch (err) {
            console.error('Error fetching customers:', err);
            if (els.list) els.list.innerHTML = '<div class="col-span-full py-12 text-center text-red-500">Failed to load data. Please try again.</div>';
        } finally {
            state.loading = false;
        }
    }

    function renderResults(customers) {
        if (!els.list) return;
        
        if (els.resultCount) els.resultCount.textContent = `${customers.length} customers found`;

        if (customers.length === 0) {
            els.list.innerHTML = `
                <div class="col-span-full text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div class="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i data-feather="search" class="w-10 h-10 text-gray-400"></i>
                    </div>
                    <h3 class="text-base font-bold text-gray-900 dark:text-white mb-2">No customers found</h3>
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

        els.list.innerHTML = customers.map(c => {
            const name = c.display_name || 'Customer';
            const location = [c.suburb, c.state].filter(Boolean).join(', ') || 'Australia';
            const bio = c.about || 'Looking for quality tradies for upcoming projects.';
            const memberSince = c.created_at ? new Date(c.created_at).getFullYear() : '2024';

            return `
                <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:shadow-md transition flex gap-3 ath-result-card">
                    <img src="${c.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D9488&color=fff`}" 
                         class="w-14 h-14 rounded-full border-2 border-teal-500 flex-shrink-0 object-cover" alt="${name}"/>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-start justify-between mb-1">
                            <div>
                                <h3 class="font-semibold text-sm text-gray-900 dark:text-white">${escapeHtml(name)}</h3>
                                <p class="text-xs text-gray-600 dark:text-gray-300">Customer</p>
                            </div>
                            <div class="text-[10px] text-gray-500 font-medium">
                                Member since ${memberSince}
                            </div>
                        </div>
                        <p class="text-gray-600 dark:text-gray-300 text-xs mb-2 line-clamp-1">${escapeHtml(bio)}</p>
                        <div class="flex items-center justify-between ath-card-footer">
                            <div class="flex items-center gap-1 text-xs flex-wrap ath-card-tags">
                                <span class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-full flex items-center gap-0.5">
                                    <i data-feather="map-pin" class="w-2.5 h-2.5"></i> ${escapeHtml(location)}
                                </span>
                                <span class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full flex items-center gap-0.5">
                                    <i data-feather="briefcase" class="w-2.5 h-2.5"></i> 5 Jobs Posted
                                </span>
                            </div>
                            <div class="flex items-center gap-2">
                                <button onclick="window.ATH_ContactUser('${c.id}')"
                                   class="px-3 py-1 border border-teal-600 text-teal-600 dark:text-teal-400 dark:border-teal-400 rounded hover:bg-teal-50 dark:hover:bg-teal-900/20 font-medium text-xs whitespace-nowrap transition flex items-center gap-1">
                                    <i data-feather="message-square" class="w-3 h-3"></i> Contact
                                </button>
                                <a href="profile-customer.html?id=${c.id}" 
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
        state.filters = { search: '', state: '' };
        if (els.searchInput) els.searchInput.value = '';
        if (els.locationFilter) els.locationFilter.value = '';
        fetchCustomers();
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
            fetchCustomers();
        }, 500));
    }

    if (els.locationFilter) {
        els.locationFilter.addEventListener('input', debounce((e) => {
            state.filters.state = e.target.value; 
            fetchCustomers();
        }, 500));
    }

    // URL Params Init
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) {
        state.filters.search = q;
        if (els.searchInput) els.searchInput.value = q;
    }

    // Initial Fetch
    await fetchCustomers();
}

// Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBrowseCustomers);
} else {
    initBrowseCustomers();
}

// Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBrowseCustomers);
} else {
    initBrowseCustomers();
}

// Expose for SPA
window.initBrowseCustomers = initBrowseCustomers;
