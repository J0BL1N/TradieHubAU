/**
 * nav-shell.js
 * Shared navigation component for TradieHubAU.
 * Handles consistent rendering, active state, and user menu.
 */

window.ATHNav = (function() {
    let _isInitialized = false;

    // Helper to get relative path based on current location
    const getBasePath = () => {
        return '/'; // Use root-relative paths for consistency with SPA
    };

    const navTemplate = (basePath) => `
    <nav class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50 transition-colors duration-200 h-16">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
            <div class="flex justify-between items-center h-full">
                <!-- Branding -->
                <a href="${basePath}index.html" class="flex items-center gap-2 flex-shrink-0">
                    <div class="w-8 h-8 bg-teal-600 rounded flex items-center justify-center">
                        <i data-feather="tool" class="w-4 h-4 text-white"></i>
                    </div>
                    <span class="text-xl font-bold text-gray-900 dark:text-white hidden sm:inline">AussieTradieHub</span>
                </a>
                
                <!-- Desktop Links -->
                <div id="athNavLinksDesktop" class="hidden md:flex items-center gap-1 lg:gap-4 ml-4 flex-1 justify-center">
                    <a href="${basePath}index.html" data-nav="home" class="ath-nav-link text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all duration-200 border-b-2 border-transparent">
                        <i data-feather="home" class="w-4 h-4"></i> <span>Home</span>
                    </a>
                    <a href="${basePath}pages/browse-trades.html" data-nav="trades" class="ath-nav-link text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all duration-200 border-b-2 border-transparent">
                        <i data-feather="users" class="w-4 h-4"></i> <span>Find Tradies</span>
                    </a>
                    <a href="${basePath}pages/browse-customers.html" data-nav="customers" class="ath-nav-link text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all duration-200 border-b-2 border-transparent">
                        <i data-feather="user-check" class="w-4 h-4"></i> <span>Find Customers</span>
                    </a>
                    <a href="${basePath}pages/jobs.html" data-nav="jobs" class="ath-nav-link text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all duration-200 border-b-2 border-transparent">
                        <i data-feather="briefcase" class="w-4 h-4"></i> <span>Job Board</span>
                    </a>
                    <a href="${basePath}pages/messages.html" data-nav="messages" class="ath-nav-link text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all duration-200 border-b-2 border-transparent">
                        <i data-feather="message-square" class="w-4 h-4"></i> <span>Messages</span>
                    </a>
                    <div id="athAdminSlot" class="contents"></div>
                </div>
                
                <!-- Right Side Controls -->
                <div class="flex items-center gap-2 lg:gap-3 flex-shrink-0">
                    <button id="mobileMenuButton" class="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300" aria-label="Open menu" aria-expanded="false">
                        <i data-feather="menu" class="w-5 h-5"></i>
                    </button>
                    
                    <!-- Dark Mode Toggle -->
                    <button id="darkModeToggle" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300" aria-label="Toggle dark mode">
                        <i data-feather="moon" class="w-5 h-5 dark-mode-icon"></i>
                        <i data-feather="sun" class="w-5 h-5 light-mode-icon hidden"></i>
                    </button>
                    
                    <!-- User Account Slot -->
                    <div id="athUserSlot" class="relative flex items-center min-w-[120px] justify-end">
                        <div class="animate-pulse bg-gray-200 dark:bg-gray-700 h-9 w-24 rounded-lg"></div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Mobile Menu -->
        <div id="mobileMenu" class="md:hidden hidden absolute top-16 left-0 right-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-xl overflow-y-auto max-h-[calc(100vh-64px)] transition-all duration-300">
            <div class="px-4 py-4 space-y-2">
                <a href="${basePath}index.html" class="block px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-700 dark:hover:text-teal-300 font-medium">Home</a>
                <a href="${basePath}pages/browse-trades.html" class="block px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-700 dark:hover:text-teal-300 font-medium">Find Tradies</a>
                <a href="${basePath}pages/browse-customers.html" class="block px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-700 dark:hover:text-teal-300 font-medium">Find Customers</a>
                <a href="${basePath}pages/jobs.html" class="block px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-700 dark:hover:text-teal-300 font-medium">Job Board</a>
                <a href="${basePath}pages/messages.html" class="block px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-700 dark:hover:text-teal-300 font-medium">Messages</a>
                <div id="athAdminSlotMobile" class="contents"></div>
                <div class="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2" id="athUserSlotMobile"></div>
            </div>
        </div>
    </nav>
    <style>
        .ath-nav-link.active {
            color: #0d9488 !important;
            border-bottom-color: #0d9488;
        }
        .dark .ath-nav-link.active {
            color: #2dd4bf !important;
            border-bottom-color: #2dd4bf;
        }
        /* Desktop user menu positioning */
        #athUserDropdown {
            top: calc(100% + 0.5rem);
            right: 0;
            width: 180px;
        }
    </style>
    `;

    function init() {
        if (_isInitialized) return;
        const mount = document.getElementById('athNavMount');
        if (!mount) return;

        const basePath = getBasePath();
        mount.innerHTML = navTemplate(basePath);
        
        setupInteractions();
        updateActiveState();
        
        _isInitialized = true;
        // Listen for SPA navigation to update active state
        window.addEventListener('ath:navigated', updateActiveState);
    }

    function setupInteractions() {
        // Mobile Menu Toggle
        const menuBtn = document.getElementById('mobileMenuButton');
        const mobileMenu = document.getElementById('mobileMenu');
        if (menuBtn && mobileMenu) {
            menuBtn.onclick = () => {
                const isHidden = mobileMenu.classList.toggle('hidden');
                menuBtn.setAttribute('aria-expanded', !isHidden);
            };
        }

        // Dark Mode Toggle (Re-bind)
        const modeBtn = document.getElementById('darkModeToggle');
        if (modeBtn) {
            modeBtn.onclick = () => {
                document.documentElement.classList.toggle('dark');
                const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
                localStorage.setItem('theme', theme);
                if (typeof feather !== 'undefined') feather.replace();
            };
        }
    }

    function updateActiveState() {
        const path = window.location.pathname;
        const links = document.querySelectorAll('.ath-nav-link');
        
        links.forEach(l => {
            const href = l.getAttribute('href');
            // Extract filename from path and href
            const currentFile = path.split('/').pop() || 'index.html';
            const targetFile = href.split('/').pop() || 'index.html';
            
            if (currentFile === targetFile) {
                l.classList.add('active');
            } else {
                l.classList.remove('active');
            }
        });
    }

    return {
        init,
        updateActiveState
    };
})();

// Auto-init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.ATHNav.init);
} else {
    window.ATHNav.init();
}
