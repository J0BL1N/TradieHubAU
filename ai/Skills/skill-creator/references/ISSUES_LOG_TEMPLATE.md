# ISSUES_LOG.md — TradieHubAU

This file is auto-appended by the agent when a task fails after a single repair attempt, per the Safety Valve (Anti-Loop Protocol) defined in SKILL.md.

---

## How to use
- Do not delete old entries.
- Always append new issues at the bottom.
- Keep entries factual and reproducible.

---

## [TEMPLATE ENTRY]

## [YYYY-MM-DD HH:MM] Issue: <short title>

### Context
- Page(s): <e.g., jobs.html, post-job.html>
- Area: <e.g., localStorage, render, event wiring>
- Trigger: <what action causes the issue>

### Expected
<what should happen>

### Actual
<what happens instead>

### Repro Steps
1. ...
2. ...
3. ...

### Console / Error Details
- Error(s):
  - `<paste error text>`
- Suspected cause:
  - <short hypothesis>

### Attempt 1: Fix Implemented
- Files changed:
  - <file list>
- Summary of changes:
  - <what you changed>

### Attempt 1 Result
- Outcome: (Success / Failed)
- Notes: <what still breaks>

### Decision
- Status: ABANDONED (per Safety Valve)
- Next queued item: <what you moved to next>
