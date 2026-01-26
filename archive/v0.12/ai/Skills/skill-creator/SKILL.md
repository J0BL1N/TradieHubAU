---
name: tradiehub-autonomous-builder
description: Use this skill whenever working on TradieHubAU. This includes auditing, fixing, refactoring, extending features, improving UX/UI, and completing the static HTML/CSS/Vanilla JS marketplace using localStorage as the data layer.
allowed-tools: Read, Write, Bash
---

# TradieHubAU — Autonomous Full-Stack Builder Skill

## EXECUTION CONTRACT (NON-NEGOTIABLE)
- You MUST read existing files before changing them.
- You MUST reuse and refactor existing logic instead of rewriting.
- You MUST continue working autonomously after completing a task.
- You MUST keep all changes compatible with static hosting (GitHub Pages).
- You MUST NOT introduce frameworks, backends, or build tools unless explicitly told.
- You MUST document assumptions inside code comments when behavior is inferred.

Failure to follow these rules is considered a bug.

---

## PROJECT IDENTITY

### What TradieHubAU Is
TradieHubAU is a **two-sided Australian services marketplace** connecting:
- Customers who post local jobs
- Tradies who apply, message, and build reputation

The platform is:
- Privacy-first
- Trust-driven
- Front-end only
- Designed for progressive enhancement

This is not a demo. Treat it as a real MVP.

---

## TECH STACK (AUTHORITATIVE)

### Frontend
- HTML5 (semantic, accessible)
- CSS3 (single global stylesheet)
- Vanilla JavaScript (ES6+)

### State & Data
- localStorage = single source of truth
- data.js = seed/demo data only
- script.js = core logic layer

### Hosting
- Static hosting (GitHub Pages compatible)
- No server-side execution

---

## AUTONOMOUS TASK LOOP

When idle:
1. Identify broken flow
2. Trace data source
3. Fix minimally
4. Test across pages
5. Move to next issue

Repeat indefinitely.

### SAFETY VALVE (ANTI-LOOP PROTOCOL)
If a task or fix fails (e.g., console errors persist or behavior is broken) after implementation:
1. You may attempt to repair the code exactly **ONE (1)** time.
2. If the error persists after the repair attempt, you MUST STOP.
3. Log the failure details into a new file named `ISSUES_LOG.md`.
4. Abandon the specific task immediately and proceed to the next item in the queue.
5. NEVER retry a failed task more than once.

---

## FINAL DIRECTIVE

Treat TradieHubAU as a real startup codebase.

## ROADMAP & PHASE GATES (AUTHORITATIVE)

### Active Phase
- Current phase is **PHASE 1** (High-Fidelity Prototype).
- You MUST prioritize Phase 1 remaining items before proposing or starting Phase 2+ work.

### Phase 1 (Current) — Definition
**Goal:** A fully immersive, “feels real” application running continuously in the browser using `localStorage`.

Phase 1 is only considered “done” when these are completed and verified:
- Notification Simulation: in-app toast notifications for “New Application” and “Message Received”.
- Mobile Polish: complex modals and tables are usable on small screens without layout breakage.
- Onboarding Wizard: guided first-run flow for new users (e.g., role selection + trade selection).

### Hard Lock for Phase 2+ (Activation Required)
- You MUST NOT start Phase 2, Phase 3, or Phase 4 tasks unless the user explicitly types:
  - `ACTIVATE PHASE 2`
  - `ACTIVATE PHASE 3`
  - `ACTIVATE PHASE 4`
- If the user has not activated the phase, you may ONLY:
  - mention Phase 2+ as future consideration, and
  - keep all implementation strictly within Phase 1 scope.

### Phase 2 (Locked) — Backend Migration (Summary Only)
Examples (DO NOT implement unless activated):
- Payment gateway integration
- Identity verification + admin queue
- Backend chat scrubbing for contact details until payment clearance
- Admin dashboard for reports/disputes

### Phase 4 (Locked) — Production Readiness (Summary Only)
Examples (DO NOT implement unless activated):
- SEO + metadata (OpenGraph, sitemap, structured data)
- Transactional email
- Performance optimization (splitting/caching/images)
- Legal finalization

---

## OWNER PROFILE (PROJECT ATTRIBUTION)

- Project owner name: **Jayden Lardelli-Newton**
- Use this name where it is most appropriate:
  - Preferred: git configuration (`git config user.name`) outside of code changes.
  - Avoid hardcoding owner name into UI unless explicitly asked (keeps white-label option open).

---

## PERSONAL PREFERENCES (MUST FOLLOW)

### Engineering style
- Prefer **clean refactors** over quick patches, but keep changes incremental (small diffs).
- Structure code so core business logic is separable from DOM rendering (helps future app work).

### Design consistency
- Maintain existing visual design system and overall look/feel.
- Do not introduce a redesign or new design language unless explicitly instructed.
- Fix layout/spacing/contrast issues, but keep styling consistent.

### Change-risk policy (recommended default)
- Default to **backwards-compatible** changes.
- If a refactor would be breaking, you MUST:
  1) stop and log it as a risk,
  2) propose a safer alternative,
  3) only proceed with breaking changes if the user explicitly approves.

---

## SECURITY RULES (ABSOLUTE)

- NEVER request, store, echo, or embed passwords, API keys, tokens, or secrets in any file or message.
- Git authentication must be handled externally (SSH keys or credential helper / PAT stored locally).
- If `git push` fails due to auth/network, follow the Git strategy: log in `ISSUES_LOG.md` and continue locally.
