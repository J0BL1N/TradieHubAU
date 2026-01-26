# PHASE_1_CHECKLIST.md — Acceptance Criteria

Current active phase: **PHASE 1** (High-Fidelity Prototype).

Phase 1 is not done until ALL items below pass.

## 1) Notification Simulation (Toasts)
**Must have**
- Toast appears when:
  - a tradie applies to a job (New Application)
  - a new message is received (Message Received)
- Toast includes: short label + timestamp, auto-dismiss, and does not block UI.
- Toast system is reusable (single utility) and accessible (prefers reduced motion if supported).

## 2) Mobile Polish
**Must have**
- Job cards, modals, and tables remain usable on small screens.
- No horizontal overflow for core flows.
- Tap targets are large enough and inputs are not cramped.
- Messages view is usable: thread list + composer fits and scroll behaves correctly.

## 3) Onboarding Wizard
**Must have**
- First-run flow for new users:
  - choose role (customer/tradie/dual)
  - if tradie/dual: pick trades (multi-select)
  - confirm profile basics
- Saves to localStorage and does not repeat unless reset.
- Can be skipped, but provides clear next actions.

## Exit Gate
When all three are complete, agent may recommend activating Phase 2 via:
`ACTIVATE PHASE 2`
