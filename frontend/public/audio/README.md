# TradieHubAU Audio Assets

This directory contains approved sound effect (SFX) files for user-selectable app notifications and messages.

## File Instructions

*   **Placement:** Place the approved SFX files in this directory.
*   **Recommended Formats:** `mp3`, `ogg`, `wav`
*   **Recommended Duration:** `0.2s` to `1.5s` (short micro-interaction alerts)
*   **File Sizes:** Keep file sizes as small as possible (preferably < 50KB) to ensure rapid loading.
*   **Copyright Warning:** Do NOT add copyrighted, unlicensed, or royalty-bearing audio assets.

---

## Suggested Filenames & Expected Assets

1.  `message.mp3` (Expected path: `/audio/message.mp3`)
    *   *Selected Sound:* `existentialtaco-confirm-tap-394001.mp3` (or equivalent taps/clicks for message bubbles)
2.  `notification.mp3` (Expected path: `/audio/notification.mp3`)
    *   *Selected Sound:* Standard alert, bell, or digital ping.

*Note: If these files are missing at runtime, the application will degrade gracefully and skip audio playback without crashing.*
