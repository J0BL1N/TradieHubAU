# ISSUES_LOG.md — TradieHubAU

## Critical Issues

### 1. **Duplicate Function Definition: `window.inferTradeIdsFromText`**

**Severity:** 🔴 CRITICAL  
**Location:** `js/core/data.js` - Lines 53-69 and Lines 238-252  
**Impact:** Function is defined twice with slightly different logic, causing unpredictable behavior

**Details:**

- First definition (lines 53-69): Returns array, checks for 'electr', 'fence', 'deck', 'repairs', 'fix'
- Second definition (lines 238-252): Returns array from Set, checks for 'electric', 'joiner', 'decor', different behavior
- The second definition overwrites the first, making the earlier one dead code

**Fix Required:** Remove one definition and merge logic if necessary

---

### 2. **Duplicate Code: Job Helper Functions in `search-filter.js`**

**Severity:** 🟡 MEDIUM  
**Location:** `js/components/search-filter.js` vs `js/core/script.js`  
**Impact:** Code duplication, maintenance burden, potential inconsistencies

**Details:**

- `readPostedJobsFromStorage()` - Duplicated in search-filter.js (line 660) and script.js (ATHJobs module)
- `mapPostedJobToCanonical()` - Duplicated in search-filter.js (line 671) and script.js (ATHJobs module)
- search-filter.js DOES check for `window.ATHJobs` existence but falls back to local copies
- This creates sync issues where changes to one don't reflect in the other

**Fix Required:** Always use `window.ATHJobs` methods, remove duplicates from search-filter.js

---

## Architecture Issues

### 3. **Inconsistent localStorage Key Scoping**

**Severity:** 🟡 MEDIUM  
**Location:** Multiple files  
**Impact:** Data isolation issues, potential conflicts

**Details:**

- Conversations use scoped keys: `athConversations:${uid}` (per-user isolation) ✅
- Other data uses global keys: `athJobState`, `athPostedJobs`, `athCurrentUser` ❌
- Jobs, applications, and profiles are NOT scoped per user
- Multiple "signed-in" users would share job applications and saved jobs

**Observation:** This might be intentional for the demo (single-device, single-user prototype), but creates confusion

**Recommendation:** Document the intended behavior or implement consistent scoping

---

### 4. **Module Initialization Order Dependencies**

**Severity:** 🟡 MEDIUM  
**Location:** All HTML pages  
**Impact:** Potential race conditions, initialization failures

**Details:**

- Most pages load scripts in this order:
  1. data.js
  2. script.js
  3. Page-specific components
- Some pages (e.g., messages.html) have comments like "IMPORTANT: data first, then script.js"
- However, no actual error handling exists if modules load out of order
- No checks for required globals (window.JOBS, window.TRADIES) before use

**Fix Required:** Add defensive checks or use proper module system

---

## Data Consistency Issues

### 5. **Tradie Data Structure Inconsistency**

**Severity:** 🟢 LOW  
**Location:** `js/core/data.js`  
**Impact:** Confusing data model

**Details:**

- Tradies have BOTH `trade` (string, legacy, human-readable) AND `trades` (array, canonical IDs)
- `trade` is used for display but `trades` is used for filtering
- Normalization happens at runtime (lines 254-263)
- Creates confusion about which field is source of truth

**Recommendation:** Consolidate to single `trades` array, derive display labels as needed

---

### 6. **Review Data Generation Logic**

**Severity:** 🟢 LOW  
**Location:** `js/core/data.js` lines 71-101  
**Impact:** Demo data quality

**Details:**

- `makeDemoReviews()` generates up to 8 reviews but uses same 8 templates
- Star ratings use deterministic jitter `(i % 3) - 1` which makes patterns obvious
- All reviews have identical 14-day spacing
- Lacks variety in review content

**Recommendation:** Add more review templates, randomize spacing for more realistic demo

---

## Missing Features (Phase 1 Requirements)

### 7. **Missing: Notification Simulation**

**Severity:** 🟡 MEDIUM (Phase 1 Requirement)  
**Status:** ❌ NOT IMPLEMENTED  
**Location:** N/A

**Required for Phase 1 completion:**

- Toast appears when a tradie applies to a job
- Toast appears when a new message is received
- Toast includes: short label + timestamp, auto-dismiss
- Toast system is reusable (single utility)
- Accessible (prefers reduced motion if supported)

---

### 8. **Incomplete: Mobile Polish**

**Severity:** 🟡 MEDIUM (Phase 1 Requirement)  
**Status:** ⚠️ PARTIALLY COMPLETE  
**Location:** Various pages

**Issues:**

- Filter drawer implemented on browse pages ✅
- Messages page may have viewport/scroll issues on small screens ⚠️
- Job details modal may overflow on mobile ⚠️
- Trade picker on post-job.html may be cramped ⚠️
- No testing evidence for tap target sizes

**Testing Required:** Manual testing on actual mobile devices (320px - 428px widths)

---

### 9. **Missing: Onboarding Wizard**

**Severity:** 🟡 MEDIUM (Phase 1 Requirement)  
**Status:** ❌ NOT IMPLEMENTED  
**Location:** N/A

**Required for Phase 1 completion:**

- First-run flow for new users
- Choose role (customer/tradie/dual)
- If tradie/dual: pick trades (multi-select)
- Confirm profile basics
- Saves to localStorage, doesn't repeat unless reset
- Can be skipped but provides clear next actions

---

## Potential Runtime Issues

### 10. **Missing Error Boundaries**

**Severity:** 🟢 LOW  
**Location:** All JavaScript files  
**Impact:** Silent failures

**Details:**

- Most functions don't validate inputs
- localStorage operations assume success (quota errors ignored)
- JSON parse errors caught but not logged
- No global error handler

**Example:**

```javascript
function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback; // Error silently swallowed
  }
}
```

**Recommendation:** Add optional error logging in development mode

---

### 11. **Regex Global Flag State Pollution**

**Severity:** 🟢 LOW  
**Location:** `js/core/script.js` lines 610-659 (ATHIntegrity module)  
**Impact:** Potential regex matching bugs

**Details:**

- Regex with /g flag maintains state via `lastIndex`
- Code manually resets `lastIndex = 0` (lines 656-659)
- This is correct BUT fragile - if code is refactored and reset is removed, bugs occur
- Better to use non-global regex or `String.matchAll()`

**Current code (vulnerable):**

```javascript
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi; // ← /g flag
// ... usage
EMAIL_RE.lastIndex = 0; // ← manual reset required
```

**Fix Required:** Remove /g flags where not needed for `.replace()` or use `new RegExp()` per call

---

## Code Quality Issues

### 12. **Inconsistent HTML Escaping**

**Severity:** 🟢 LOW  
**Location:** Multiple files  
**Impact:** Potential XSS if user-generated content is not properly sanitized

**Details:**

- Some modules have `escapeHtml()` function (ATHJobDetails, search-filter.js)
- Not all dynamic HTML insertion uses escaping
- Example: Messages page renders user input - needs verification

**Recommendation:** Audit all `.innerHTML = ` assignments for XSS risks

---

### 13. **Commented Code / Dead Code**

**Severity:** 🟢 LOW  
**Location:** Various  
**Impact:** Code maintainability

**Details:**

- Backup files present (`index.html.backup`)
- Should be removed for production

---

### 14. **Magic Strings / Hard-coded Values**

**Severity:** 🟢 LOW  
**Location:** Multiple files  
**Impact:** Maintenance difficulty

**Examples:**

- localStorage keys scattered throughout code
- Status strings: 'open', 'in_progress', 'completed'
- Trade IDs: 'electrical', 'plumbing', etc.

**Recommendation:** Centralize constants in a CONSTANTS module

---

## File Organization Issues

### 15. **Supabase Integration Present but Unused**

**Severity:** 🔵 INFO  
**Location:** `js/core/supabase-client.js`, `js/core/auth.js`  
**Impact:** Confusion about which auth system is active

**Details:**

- Project has TWO auth systems:
  1. `ATHAuth` - localStorage-based (in script.js) - CURRENTLY ACTIVE ✅
  2. Supabase client with auth methods - NOT WIRED UP ❌
- Supabase code exists but is not imported/used on any page
- This violates the "static hosting only" principle from SKILL.md

**Clarification Needed:** Is Supabase intended for Phase 2, or should it be removed?

---

## Summary

**Total Issues Found:** 15

**By Severity:**

- 🔴 Critical: 1 (Duplicate function)
- 🟡 Medium: 6 (Duplicated code, architecture, missing Phase 1 features)
- 🟢 Low: 7 (Data consistency, code quality)
- 🔵 Info: 1 (Supabase confusion)

**Phase 1 Blockers:** Issues #7, #8, #9 must be resolved to complete Phase 1

**Immediate Action Required:** Issue #1 (duplicate function definition)

---

## Generated: 2026-01-23T02:44:00+11:00
