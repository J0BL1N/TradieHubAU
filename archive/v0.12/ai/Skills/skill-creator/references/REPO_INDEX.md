# REPO_INDEX.md — TradieHubAU (Quick Map)

This file is a fast lookup to reduce hallucination and speed up routing.

## Pages
- index.html: Landing/marketing entry point
- browse-trades.html: Tradie discovery (filters, cards, profile links)
- browse-customers.html: Customer discovery
- post-job.html: Customer job creation (writes to localStorage)
- jobs.html: Job board (reads from localStorage)
- messages.html: Conversations (threads + message send/persist)
- my-profile.html: Active user profile editor (role + trade selection)
- profile-tradesman.html: Public tradie profile (hydrate by id/querystring)
- profile-customer.html: Public customer profile (hydrate by id/querystring)

## Core Logic Files
- script.js: App logic (storage, render, events, init)
- data.js: Seed/demo data (used only to initialize localStorage if empty)
- style.css: Global styles
