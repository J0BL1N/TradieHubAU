/**
 * spa-router.js
 * Simple Client-side Router for TradieHubAU.
 * Prevents full page reloads and maintains persistent nav.
 */

window.ATHRouter = (function() {
    let _transitioning = false;

    function init() {
        // Intercept all link clicks
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            const href = link.getAttribute('href');
            if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

            // Handle internal navigation
            e.preventDefault();
            navigateTo(href);
        });

        // Handle back/forward buttons
        window.addEventListener('popstate', () => {
            loadPage(window.location.pathname, false);
        });
    }

    async function navigateTo(url) {
        if (_transitioning) return;
        
        // Push state
        window.history.pushState({}, '', url);
        await loadPage(url, true);
    }

    async function loadPage(url, shouldScroll = true) {
        _transitioning = true;
        
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to load page');
            
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // 1. Update Title
            document.title = doc.title;
            
            // 2. Update Main Content
            const newMain = doc.querySelector('#athMain');
            const currentMain = document.querySelector('#athMain');
            
            if (newMain && currentMain) {
                currentMain.innerHTML = newMain.innerHTML;
                currentMain.className = newMain.className;
                
                // Copy data attributes
                Array.from(newMain.attributes).forEach(attr => {
                    if (attr.name.startsWith('data-')) {
                        currentMain.setAttribute(attr.name, attr.value);
                    }
                });

                // 2.5 Execute Scripts (inline and external page-specific ones)
                executePageScripts(doc);
            } else {
                console.error('SPA Router: Could not find #athMain in target page');
                window.location.href = url;
                return;
            }

            // 3. Re-run Global Initializations
            reinitializeGlobals();

            if (shouldScroll) window.scrollTo(0, 0);
            
            // 4. Dispatch navigation event
            window.dispatchEvent(new CustomEvent('ath:navigated', { detail: { url } }));

        } catch (err) {
            console.error('SPA Router Error:', err);
            window.location.href = url; // Fallback
        } finally {
            _transitioning = false;
        }
    }

    function executePageScripts(doc) {
        // Find scripts that are NOT the common shell scripts
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(oldScript => {
            const src = oldScript.getAttribute('src');
            
            // Skip core/shell scripts (already loaded)
            if (src && (
                src.includes('nav-shell.js') || 
                src.includes('spa-router.js') || 
                src.includes('supabase-client.js') || 
                src.includes('auth.js') ||
                src.includes('feather.min.js') ||
                src.includes('tailwindcss')
            )) return;

            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
            newScript.textContent = oldScript.textContent;
            
            // Note: If it's a module, it stays a module
            if (oldScript.type === 'module') newScript.type = 'module';

            document.body.appendChild(newScript);
            // Optionally remove it after execution if it's inline
            if (!src) newScript.remove();
        });
    }

    function reinitializeGlobals() {
        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        // Re-run Tailwind JIT (force re-scan) - Verified fix
        // Re-run Tailwind JIT (force re-scan)
        const refreshTailwind = () => {
            if (window.tailwind) {
                window.tailwind.config = { ...window.tailwind.config };
            }
        };
        
        refreshTailwind();
        // Retry after a short delay to ensure DOM is ready
        setTimeout(refreshTailwind, 50);

        // Re-run Auth UI refresh
        if (window.ATHAuth && typeof window.ATHAuth.refreshAuthUI === 'function') {
            window.ATHAuth.refreshAuthUI();
        } else {
            console.warn('SPA Router: ATHAuth.refreshAuthUI not found');
        }
    }

    return {
        init,
        navigateTo
    };
})();

// Auto-init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.ATHRouter.init);
} else {
    window.ATHRouter.init();
}
