
/**
 * Device & Browser Detection Utility
 * Applies classes to the <body> tag for CSS targeting and exposes window.ATHDevice
 */
(function() {
    const ua = navigator.userAgent;
    const html = document.documentElement;
    const body = document.body;

    const device = {
        isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua),
        isIOS: /iPhone|iPad|iPod/i.test(ua),
        isAndroid: /Android/i.test(ua),
        isWindows: /Windows/i.test(ua),
        isMac: /Macintosh/i.test(ua),
        isLinux: /Linux/i.test(ua) && !/Android/i.test(ua),
        
        // Browser Detection
        isChrome: /Chrome/.test(ua) && !/Edge/.test(ua) && !/OPR/.test(ua),
        isFirefox: /Firefox/.test(ua),
        isSafari: /Safari/.test(ua) && !/Chrome/.test(ua),
        isEdge: /Edg/.test(ua),
        
        // Touch Support
        isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0
    };

    // Apply classes to HTML/Body
    if (device.isMobile) html.classList.add('is-mobile');
    else html.classList.add('is-desktop');

    if (device.isTouch) html.classList.add('is-touch');
    
    if (device.isIOS) html.classList.add('is-ios');
    if (device.isAndroid) html.classList.add('is-android');
    if (device.isWindows) html.classList.add('is-windows');
    if (device.isMac) html.classList.add('is-mac');
    console.log('[Detector] Detected device:', device);
    
    // Expose valid global
    window.ATHDevice = device;

    // Optional: Adaptive Layout Helper
    // Add specific tweaks for mobile/desktop
    document.addEventListener('DOMContentLoaded', () => {
        // Example: Increase tap targets on mobile if not using a specific framework class
        if (device.isTouch) {
            // Find small clickable elements that might need help, or just leave it to CSS
            // This is where specific "layout catering" logic would go
            document.documentElement.style.setProperty('--hover-trigger', 'none'); // Disable hover effects on touch
        } else {
             document.documentElement.style.setProperty('--hover-trigger', 'hover');
        }
    });

})();
