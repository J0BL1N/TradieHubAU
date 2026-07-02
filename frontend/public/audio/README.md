# TradieHubAU Audio Assets

This directory contains approved sound effect (SFX) files for user-selectable app notifications and messages.

## File Mappings & Intended Uses

The following files are present and wired in the application settings:

1.  `message-confirm-tap.mp3` (Path: `/audio/message-confirm-tap.mp3`)
    *   *Source:* `existentialtaco-confirm-tap-394001.mp3`
    *   *Description:* Soft tactile tap confirm, used as the default incoming message sound.
2.  `notification-soft-alert.mp3` (Path: `/audio/notification-soft-alert.mp3`)
    *   *Source:* `Soft Alert.mp3`
    *   *Description:* Soft ping chime, used as the default notification alert.
3.  `notification-bright-chime.mp3` (Path: `/audio/notification-bright-chime.mp3`)
    *   *Source:* `universfield-new-notification-09-352705.mp3`
    *   *Description:* High-pitch digital chime indicator.
4.  `notification-gentle-ping.mp3` (Path: `/audio/notification-gentle-ping.mp3`)
    *   *Source:* `universfield-new-notification-010-352755.mp3`
    *   *Description:* Clean organic digital bell drop.
5.  `notification-clean-pop.mp3` (Path: `/audio/notification-clean-pop.mp3`)
    *   *Source:* `universfield-new-notification-040-493469.mp3`
    *   *Description:* Short round pop alert (Source sound copied/reserved for support chatbot answers).
6.  `bot-reply.mp3` (Path: `/audio/bot-reply.mp3`)
    *   *Description:* Reserved support chatbot response sound (Clean pop style).
7.  `notification-echo-chime.mp3` (Path: `/audio/notification-echo-chime.mp3`)
    *   *Source:* `universfield-new-notification-051-494246.mp3`
    *   *Description:* Multi-tone echo bell alert.
8.  `notification-light-sweep.mp3` (Path: `/audio/notification-light-sweep.mp3`)
    *   *Source:* `universfield-new-notification-059-494262.mp3`
    *   *Description:* Rising synthesizer chime sweep.
9.  `notification-digital-blip.mp3` (Path: `/audio/notification-digital-blip.mp3`)
    *   *Source:* `universfield-new-notification-062-494544.mp3`
    *   *Description:* Short electronic digital beep.

---

## File Instructions

*   **Placement:** Place the approved SFX files in this directory.
*   **Recommended Formats:** `mp3`, `ogg`, `wav`
*   **Recommended Duration:** `0.2s` to `1.5s` (short micro-interaction alerts)
*   **File Sizes:** Keep file sizes as small as possible (preferably < 100KB) to ensure rapid loading.
*   **Copyright Warning:** Do NOT add copyrighted, unlicensed, or royalty-bearing audio assets.

*Note: If these files are missing at runtime, the application will degrade gracefully and skip audio playback without crashing.*
