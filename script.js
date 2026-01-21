// script.js — AussieTradieHub (safe on all pages)


// ----------------------------
// Batch N3: Storage helpers
// ----------------------------
window.ATHStore = window.ATHStore || (function () {
  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // ignore quota/serialization failures in demo
    }
  }

  function seedOnce(key, seedValue) {
    const existing = get(key, null);
    if (existing !== null && existing !== undefined) return existing;
    const seeded = seedValue || {};
    set(key, seeded);
    return seeded;
  }

  return { get, set, seedOnce };
})();

// ----------------------------
// v0.026: Prototype auth (email/password) + session
// ----------------------------
// Client-side only (localStorage). This is for MVP UX testing.
// It is intentionally separated from `athCurrentUser` so the existing demo
// identity/profile/job-ownership model continues to work unchanged.
window.ATHAuth = window.ATHAuth || (function () {
  const USERS_KEY = 'athAuthUsers';
  const SESSION_KEY = 'athAuthSession';

  function readUsers() {
    const u = window.ATHStore?.get(USERS_KEY, []);
    return Array.isArray(u) ? u : [];
  }

  function writeUsers(users) {
    window.ATHStore?.set(USERS_KEY, Array.isArray(users) ? users : []);
  }

  function getSession() {
    const s = window.ATHStore?.get(SESSION_KEY, null);
    return (s && typeof s === 'object') ? s : null;
  }

  function setSession(session) {
    window.ATHStore?.set(SESSION_KEY, session);
    try {
      window.dispatchEvent(new CustomEvent('ath:authchange', { detail: { session: getSession() } }));
    } catch { }
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch { }
    try {
      window.dispatchEvent(new CustomEvent('ath:authchange', { detail: { session: null } }));
    } catch { }
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function isValidEmail(email) {
    const e = normalizeEmail(email);
    // permissive RFC-ish check for MVP
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  }

  async function sha256Hex(input) {
    const str = String(input || '');
    try {
      if (!window.crypto?.subtle) throw new Error('no-subtle');
      const enc = new TextEncoder();
      const buf = await window.crypto.subtle.digest('SHA-256', enc.encode(str));
      const bytes = Array.from(new Uint8Array(buf));
      return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback: not cryptographically strong. Still avoids plaintext storage.
      let h = 0;
      for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i);
      return `weak-${Math.abs(h)}`;
    }
  }

  function makeId() {
    return `auth-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function signUp(email, password) {
    const e = normalizeEmail(email);
    if (!isValidEmail(e)) return { ok: false, error: 'Please enter a valid email.' };
    const p = String(password || '');
    if (p.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };

    const users = readUsers();
    if (users.some(u => normalizeEmail(u?.email) === e)) {
      return { ok: false, error: 'An account with that email already exists.' };
    }

    const passwordHash = await sha256Hex(p);
    const user = {
      id: makeId(),
      email: e,
      passwordHash,
      emailVerified: false,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    writeUsers(users);
    setSession({ userId: user.id, email: user.email, signedInAt: new Date().toISOString() });
    return { ok: true, user };
  }

  async function signIn(email, password) {
    const e = normalizeEmail(email);
    if (!isValidEmail(e)) return { ok: false, error: 'Please enter a valid email.' };
    const p = String(password || '');

    const users = readUsers();
    const user = users.find(u => normalizeEmail(u?.email) === e);
    if (!user) return { ok: false, error: 'Incorrect email or password.' };

    const hash = await sha256Hex(p);
    if (String(user.passwordHash) !== String(hash)) {
      return { ok: false, error: 'Incorrect email or password.' };
    }
    return { ok: true, user };
  }

  async function signInWithGoogle(googleUser) {
    // googleUser: { email, name, picture, sub }
    const e = normalizeEmail(googleUser.email);
    const users = readUsers();

    // Check if user exists
    let user = users.find(u => normalizeEmail(u?.email) === e);

    if (!user) {
      // Create new user from Google data
      user = {
        id: makeId(),
        email: e,
        // No password hash for google-only users, or we could set a random one
        passwordHash: 'google-auth-no-pass',
        displayName: googleUser.name,
        avatar: googleUser.picture, // Store Google avatar URL
        emailVerified: true, // Google emails are verified
        createdAt: new Date().toISOString(),
        authProvider: 'google'
      };
      users.push(user);
      writeUsers(users);
    } else {
      // Update existing user with latest Google info (optional, but good for avatar)
      // Only update if they don't have a custom avatar set locally? 
      // For MVP, let's update basic info if it's missing or if they are a google user.
      if (!user.displayName) user.displayName = googleUser.name;
      if (!user.avatar) user.avatar = googleUser.picture;

      // Merge changes
      const idx = users.indexOf(user);
      if (idx !== -1) {
        users[idx] = user;
        writeUsers(users);
      }
    }

    setSession({ userId: user.id, email: user.email, signedInAt: new Date().toISOString(), provider: 'google' });
    return { ok: true, user };
  }

  function signOut() {
    clearSession();
  }

  function getCurrentAuthUser() {
    const s = getSession();
    if (!s?.userId) return null;
    const users = readUsers();
    return users.find(u => String(u?.id) === String(s.userId)) || null;
  }

  return {
    readUsers,
    getSession,
    setSession,
    clearSession,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    getCurrentAuthUser,
    normalizeEmail,
    isValidEmail,
  };
})();

// ----------------------------
// v0.016: Image helpers (shared)
// ----------------------------
// Reusable client-side image processing for localStorage-only uploads.
// This is used for avatar upload and job completion photos.
window.ATHImages = window.ATHImages || (function () {
  async function readFileAsDataUrl(file) {
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('read-failed'));
      r.readAsDataURL(file);
    });
  }

  async function loadImage(dataUrl) {
    return await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('img-load-failed'));
      i.src = dataUrl;
    });
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // Options:
  // - maxBytes (default 3MB)
  // - maxDim (default 1024)
  // - cropSquare (default false)
  // - mimePrefer (default 'image/webp')
  // - quality (default 0.85)
  async function processImageFile(file, opts) {
    const o = opts || {};
    if (!file) return null;
    if (!file.type || !file.type.startsWith('image/')) return null;

    const MAX_BYTES = Number(o.maxBytes || (3 * 1024 * 1024));
    if (file.size > MAX_BYTES) return null;

    const dataUrl = await readFileAsDataUrl(file);
    const img = await loadImage(dataUrl);

    const maxDim = clamp(Number(o.maxDim || 1024), 128, 2048);
    const cropSquare = !!o.cropSquare;
    const quality = clamp(Number(o.quality ?? 0.85), 0.5, 0.95);

    let srcW = img.width;
    let srcH = img.height;
    if (!srcW || !srcH) return null;

    // Determine destination size.
    let dstW = srcW;
    let dstH = srcH;

    if (cropSquare) {
      const s = Math.min(srcW, srcH);
      dstW = Math.min(maxDim, s);
      dstH = dstW;
    } else {
      const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
      dstW = Math.max(1, Math.round(srcW * scale));
      dstH = Math.max(1, Math.round(srcH * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (cropSquare) {
      const s = Math.min(srcW, srcH);
      const sx = Math.floor((srcW - s) / 2);
      const sy = Math.floor((srcH - s) / 2);
      ctx.drawImage(img, sx, sy, s, s, 0, 0, dstW, dstH);
    } else {
      ctx.drawImage(img, 0, 0, dstW, dstH);
    }

    // Prefer webp when supported; fallback to jpeg.
    const prefer = String(o.mimePrefer || 'image/webp');
    let out = '';
    try {
      out = canvas.toDataURL(prefer, quality);
      if (!out || !out.startsWith('data:image/')) throw new Error('encode-failed');
      // Some browsers may ignore webp; detect mismatch.
      if (prefer.includes('webp') && !out.startsWith('data:image/webp')) throw new Error('no-webp');
    } catch (e) {
      out = canvas.toDataURL('image/jpeg', quality);
    }
    return out;
  }

  return { processImageFile };
})();

// ----------------------------
// v0.012: Jobs helpers (shared across pages)
// ----------------------------
// Single source of truth for:
// - job list composition (seed + posted)
// - job state overrides (athJobState)
//
// IMPORTANT: This is intentionally incremental. We keep existing localStorage
// keys and data shapes, and only add the minimum helpers needed to avoid
// duplicating job-state logic across the Job Board and Profiles.
window.ATHJobs = window.ATHJobs || (function () {
  const JOB_STATE_KEY = 'athJobState';
  const POSTED_JOBS_KEY = 'athPostedJobs';

  function readJson(key, fallback) {
    if (window.ATHStore && typeof window.ATHStore.get === 'function') {
      return window.ATHStore.get(key, fallback);
    }
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    if (window.ATHStore && typeof window.ATHStore.set === 'function') {
      window.ATHStore.set(key, value);
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { }
  }

  // ---- Posted jobs (local) ----
  function readPostedJobsFromStorage() {
    const parsed = readJson(POSTED_JOBS_KEY, []);
    return Array.isArray(parsed) ? parsed : [];
  }

  // Canonical mapping for jobs created via post-job.html
  function getCurrentUserIdForJobs() {
    try {
      const raw = localStorage.getItem('athCurrentUser');
      const u = raw ? JSON.parse(raw) : null;
      if (u && u.id) return String(u.id);
    } catch { }
    return 'me';
  }

  function mapPostedJobToCanonical(j) {
    const state = (j?.state || '').toString().trim().toUpperCase();
    const budget = (j?.budget === 0 || j?.budget) ? Number(j.budget) : null;

    const postedCats = Array.isArray(j?.categories)
      ? j.categories
      : (j?.categories ? String(j.categories).split(',') : (j?.category ? [j.category] : []));

    const categories = (typeof window.normalizeTradeIds === 'function')
      ? window.normalizeTradeIds(postedCats)
      : (postedCats || []).map(v => String(v || '').trim().toLowerCase()).filter(Boolean);

    return {
      id: String(j?.id || `posted-${Date.now()}`),
      title: String(j?.title || 'Untitled Job'),
      description: String(j?.description || ''),
      categories: Array.from(new Set(categories.length ? categories : ['other'])),
      location: state ? `Australia, ${state}` : 'Australia',
      state: state || 'ALL',
      budgetMin: budget || 0,
      budgetMax: budget || 0,
      timeline: j?.date ? `Preferred: ${j.date}` : 'Flexible',
      urgency: 'flexible',
      type: 'one-off',
      quotes: 0,
      // Default to current user ("me") so posted jobs show the correct customer profile.
      customerId: String(j?.customerId || getCurrentUserIdForJobs()),
      postedAt: j?.createdAt || new Date().toISOString(),
      status: 'open',
      _source: 'local'
    };
  }

  // ---- Job state overrides (athJobState) ----
  function readJobStateMap() {
    const parsed = readJson(JOB_STATE_KEY, {});
    return (parsed && typeof parsed === 'object') ? parsed : {};
  }

  function writeJobStateMap(map) {
    writeJson(JOB_STATE_KEY, map && typeof map === 'object' ? map : {});
  }

  function getJobState(jobId) {
    const map = readJobStateMap();
    const s = map?.[String(jobId)] || {};
    return (s && typeof s === 'object') ? s : {};
  }

  function setJobState(jobId, patch) {
    const map = readJobStateMap();
    const id = String(jobId);
    const base = (map[id] && typeof map[id] === 'object') ? map[id] : {};
    map[id] = { ...base, ...(patch || {}), updatedAt: new Date().toISOString() };
    writeJobStateMap(map);
    return map[id];
  }

  function applyOverrides(job) {
    const s = getJobState(job?.id);
    if (!s || typeof s !== 'object') return job;
    return {
      ...job,
      status: s.status || job.status,
      assignedTradieId: s.assignedTradieId || job.assignedTradieId,
      completedAt: s.completedAt || job.completedAt,
      inProgressAt: s.inProgressAt || job.inProgressAt,
      agreedAt: s.agreedAt || job.agreedAt,
      tradieAcceptedTermsAt: s.tradieAcceptedTermsAt || job.tradieAcceptedTermsAt,
    };
  }

  // ---- Composition: seed + posted + overrides ----
  function getAllJobs() {
    const baseJobs = Array.isArray(window.JOBS) ? window.JOBS : [];
    const postedCanonical = readPostedJobsFromStorage().map(mapPostedJobToCanonical);

    const byId = new Map();
    [...postedCanonical, ...baseJobs].forEach((j) => {
      if (!j || !j.id) return;
      byId.set(String(j.id), j);
    });

    return Array.from(byId.values()).map(applyOverrides);
  }

  return {
    JOB_STATE_KEY,
    POSTED_JOBS_KEY,
    readPostedJobsFromStorage,
    mapPostedJobToCanonical,
    readJobStateMap,
    writeJobStateMap,
    getJobState,
    setJobState,
    applyOverrides,
    getAllJobs,
  };
})();

// ----------------------------
// v0.029 (incremental): Shared job details modal
// ----------------------------
// Allows pages outside jobs.html (e.g. profile-customer.html) to open a
// lightweight, read-only job details modal.
//
// Design constraints:
// - Do not re-architect: reuse ATHJobs.getAllJobs() (seed + posted + overrides).
// - Do not introduce new storage keys.
// - Keep UI minimal and consistent with jobs.html modal.
window.ATHJobDetails = window.ATHJobDetails || (function () {
  const MODAL_ID = 'athJobModal';
  const TITLE_ID = 'athJobModalTitle';
  const BODY_ID = 'athJobModalBody';
  const CLOSE_ID = 'athJobModalClose';

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function money(n) {
    const v = Number(n || 0);
    if (!isFinite(v) || v <= 0) return '—';
    try {
      return v.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
    } catch {
      return `$${Math.round(v)}`;
    }
  }

  function budgetLabel(job) {
    const min = Number(job?.budgetMin || 0);
    const max = Number(job?.budgetMax || 0);
    if (max && min && max !== min) return `${money(min)} – ${money(max)}`;
    if (max || min) return money(max || min);
    return '—';
  }

  function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;

    // Inject a modal identical in structure to jobs.html.
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div id="${MODAL_ID}" class="fixed inset-0 bg-black/50 hidden z-50 flex items-center justify-center p-4">
        <div class="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-gray-200">
          <div class="flex items-center justify-between p-5 border-b border-gray-200">
            <h3 id="${TITLE_ID}" class="text-lg font-bold text-gray-900">Job</h3>
            <button id="${CLOSE_ID}" class="p-2 rounded-lg hover:bg-gray-100" type="button" aria-label="Close">
              <i data-feather="x" class="w-5 h-5 text-gray-700"></i>
            </button>
          </div>
          <div id="${BODY_ID}" class="p-5"></div>
        </div>
      </div>`;
    document.body.appendChild(wrap.firstElementChild);
    modal = document.getElementById(MODAL_ID);

    // Wire close behavior.
    const closeBtn = document.getElementById(CLOSE_ID);
    const close = () => {
      modal?.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    };
    closeBtn?.addEventListener('click', close);
    modal?.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    if (typeof feather !== 'undefined') feather.replace();
    return modal;
  }

  function open(jobId) {
    const all = window.ATHJobs?.getAllJobs?.() || [];
    const job = all.find(j => String(j?.id) === String(jobId));
    if (!job) return;

    const modal = ensureModal();
    const titleEl = document.getElementById(TITLE_ID);
    const bodyEl = document.getElementById(BODY_ID);
    if (!modal || !titleEl || !bodyEl) return;

    const catIds = Array.isArray(job.categories)
      ? job.categories
      : (typeof window.normalizeTradeIds === 'function' ? window.normalizeTradeIds(job.categories) : []);
    const chips = (catIds || []).map((cid) => {
      const label = (typeof window.tradeLabel === 'function') ? window.tradeLabel(cid) : String(cid || '');
      return `<span class="inline-flex items-center px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">${escapeHtml(label)}</span>`;
    }).join('');

    const timeline = String(job.timeline || 'Flexible');
    const desc = window.ATHIntegrity ? window.ATHIntegrity.sanitizeText(job.description || '').text : (job.description || '');
    const st = String(job.status || 'open').replace('_', ' ');

    titleEl.textContent = job.title || 'Job details';
    bodyEl.innerHTML = `
      <div class="space-y-4">
        <div class="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 inline-flex">Status: <span class="ml-1 font-semibold">${escapeHtml(st)}</span></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <p class="text-xs text-gray-500">Categories</p>
            <div class="mt-1 flex flex-wrap gap-2">${chips || '<span class="text-xs text-gray-500">—</span>'}</div>
          </div>
          <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <p class="text-xs text-gray-500">Location</p>
            <p class="font-semibold text-gray-900">${escapeHtml(job.location || '—')}</p>
          </div>
          <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <p class="text-xs text-gray-500">Budget</p>
            <p class="font-semibold text-gray-900">${escapeHtml(budgetLabel(job))}</p>
          </div>
          <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <p class="text-xs text-gray-500">Timeline</p>
            <p class="font-semibold text-gray-900">${escapeHtml(timeline)}</p>
          </div>
        </div>
        <div>
          <p class="text-sm font-semibold text-gray-900 mb-1">Description</p>
          <p class="text-sm text-gray-700 whitespace-pre-line">${escapeHtml(desc)}</p>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    if (typeof feather !== 'undefined') feather.replace();
  }

  return { open, ensureModal };
})();

// ----------------------------
// Batch N3: Integrity (no direct contact until payment)
// ----------------------------
window.ATHIntegrity = window.ATHIntegrity || (function () {
  // Batch N3+: Integrity (no direct contact until payment)
  const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
  // Best-effort phone matcher: long digit runs with optional separators
  const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
  // URLs with scheme or www
  const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<]+/ig;
  // Bare domains (e.g., example.com, example.com.au). TLD must be letters.
  const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,})(?:\/[\w\-./?%&=+#]*)?/ig;

  function canShareContact() {
    // Future: flip true after payment confirmation.
    // For now: privacy-first prototype rule.
    return false;
  }

  function normalizeForScan(input) {
    let t = String(input || '').toLowerCase();
    // normalize whitespace
    t = t.replace(/[\r\n\t]+/g, ' ');
    // normalize common obfuscations
    t = t.replace(/[\[(\{]\s*dot\s*[\]\)\}]/g, '.');
    t = t.replace(/[\[(\{]\s*at\s*[\]\)\}]/g, '@');
    t = t.replace(/\s+dot\s+/g, '.');
    t = t.replace(/\s+at\s+/g, '@');
    // collapse spaced-out words: "t r a d i e" -> "tradie"
    t = t.replace(/\b(?:[a-z]\s+){2,}[a-z]\b/g, (m) => m.replace(/\s+/g, ''));
    return t;
  }

  function scanText(input) {
    if (canShareContact()) return { hasContact: false, types: { email: false, phone: false, url: false } };

    const original = String(input || '');
    const norm = normalizeForScan(original);
    const compact = norm.replace(/[\s\u200B\u200C\u200D\uFEFF_\-()\[\]{}<>|]+/g, '');

    // Email: direct OR obfuscated (at/dot)
    const email = EMAIL_RE.test(original) || EMAIL_RE.test(norm) || EMAIL_RE.test(compact);

    // Phone: direct pattern OR obfuscated digit runs (e.g., 0x4x1x...)
    const digits = compact.replace(/x/g, '').replace(/\D/g, '');
    const phone = PHONE_RE.test(original) || (digits.length >= 8);

    // URL/domain: direct or obfuscated
    const url = URL_RE.test(original) || DOMAIN_RE.test(norm) || DOMAIN_RE.test(compact);

    // Reset global regex state after .test on /g
    EMAIL_RE.lastIndex = 0;
    PHONE_RE.lastIndex = 0;
    URL_RE.lastIndex = 0;
    DOMAIN_RE.lastIndex = 0;

    return { hasContact: !!(email || phone || url), types: { email: !!email, phone: !!phone, url: !!url } };
  }

  function sanitizeTextJs(input) {
    const original = String(input || '');
    if (canShareContact()) return { text: original, changed: false };

    let out = original;

    // Remove emails
    out = out.replace(EMAIL_RE, '•••••');

    // Remove phone-ish sequences
    out = out.replace(PHONE_RE, (m) => {
      const digits = String(m).toLowerCase().replace(/x/g, '').replace(/\D/g, '');
      if (digits.length < 8) return m;
      return '•••••';
    });

    // Remove URLs + bare domains
    out = out.replace(URL_RE, '•••••');
    out = out.replace(DOMAIN_RE, (m) => {
      // avoid nuking version strings like v0.029
      const hasAlpha = /[a-z]/i.test(m);
      const hasDot = m.includes('.');
      if (!hasAlpha || !hasDot) return m;
      return '•••••';
    });

    return { text: out, changed: out !== original };
  }

  function renderBanner(mountEl) {
    if (!mountEl) return;
    if (canShareContact()) {
      mountEl.innerHTML = '';
      return;
    }
    mountEl.innerHTML = `
      <div class="ath-integrity-banner flex items-start gap-3 p-3 rounded-xl border border-teal-200 bg-teal-50 text-teal-900">
        <div class="mt-0.5"><i data-feather="lock" class="w-4 h-4"></i></div>
        <div class="text-sm">
          <div class="font-semibold">Contact details are locked until payment is confirmed.</div>
          <div class="text-teal-800">Keep chat and job info inside TradieHub to stay protected.</div>
        </div>
      </div>
    `;
    if (typeof feather !== 'undefined') feather.replace();
  }

  function setInlineNotice(el, msg) {
    if (!el) return;
    el.textContent = msg || '';
    if (!msg) el.classList.add('hidden');
    else el.classList.remove('hidden');
  }

  return { canShareContact, scanText, sanitizeText: sanitizeTextJs, renderBanner, setInlineNotice };
})();

// ----------------------------
// v0.0295: Tradie mini availability calendar (profile block)
// ----------------------------
window.ATHAvailability = window.ATHAvailability || (function () {
  const KEY_PREFIX = 'athTradieAvailability:';

  function keyFor(tradieId) {
    return `${KEY_PREFIX}${String(tradieId || 'unknown')}`;
  }

  function read(tradieId) {
    const v = window.ATHStore?.get(keyFor(tradieId), null);
    if (v && typeof v === 'object') {
      const overrides = (v.overrides && typeof v.overrides === 'object') ? v.overrides : {};
      return { overrides };
    }
    return { overrides: {} };
  }

  function write(tradieId, data) {
    const overrides = (data && typeof data === 'object' && data.overrides && typeof data.overrides === 'object') ? data.overrides : {};
    window.ATHStore?.set(keyFor(tradieId), { overrides });
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toYmd(d) {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = pad2(dt.getMonth() + 1);
    const day = pad2(dt.getDate());
    return `${y}-${m}-${day}`;
  }

  function defaultAvailableForDate(d) {
    // Default: available Mon–Sat, unavailable Sun.
    const wd = new Date(d).getDay(); // 0=Sun
    return wd !== 0;
  }

  function isAvailable(tradieId, d, store) {
    const s = store || read(tradieId);
    const ymd = toYmd(d);
    if (s.overrides && Object.prototype.hasOwnProperty.call(s.overrides, ymd)) {
      return s.overrides[ymd] === 'available';
    }
    return defaultAvailableForDate(d);
  }

  function toggle(tradieId, d, store) {
    const s = store || read(tradieId);
    const ymd = toYmd(d);
    const curr = isAvailable(tradieId, d, s);
    const next = !curr;

    const def = defaultAvailableForDate(d);
    // Only store an override when needed.
    if (next === def) {
      try { delete s.overrides[ymd]; } catch { }
    } else {
      s.overrides[ymd] = next ? 'available' : 'unavailable';
    }
    write(tradieId, s);
    return s;
  }

  function monthLabel(monthDate) {
    const d = new Date(monthDate);
    const fmt = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return fmt;
  }

  function startOfMonth(d) {
    const dt = new Date(d);
    dt.setDate(1);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  function addMonths(d, n) {
    const dt = new Date(d);
    dt.setMonth(dt.getMonth() + Number(n || 0));
    return startOfMonth(dt);
  }

  function render(el, opts, monthDate) {
    if (!el) return;
    const tradieId = opts?.tradieId;
    const editable = !!opts?.editable;
    const m0 = startOfMonth(monthDate || new Date());
    const store = read(tradieId);

    const daysInMonth = new Date(m0.getFullYear(), m0.getMonth() + 1, 0).getDate();
    const firstDow = new Date(m0.getFullYear(), m0.getMonth(), 1).getDay();
    // Monday-first offset (0..6)
    const offset = (firstDow + 6) % 7;

    const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const header = `
      <div class="flex items-center justify-between">
        <div class="text-sm font-semibold text-gray-900">Availability</div>
        <div class="flex items-center gap-2">
          <button type="button" data-ath-cal="prev" class="p-1 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Previous month">
            <i data-feather="chevron-left" class="w-4 h-4"></i>
          </button>
          <div class="text-xs font-medium text-gray-700" data-ath-cal="label">${monthLabel(m0)}</div>
          <button type="button" data-ath-cal="next" class="p-1 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Next month">
            <i data-feather="chevron-right" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;

    let grid = '<div class="mt-2 grid grid-cols-7 gap-1">';
    for (const w of weekday) {
      grid += `<div class="text-[10px] font-semibold text-gray-500 text-center">${w}</div>`;
    }

    const totalCells = 42; // 6 weeks
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - offset + 1;
      if (dayNum < 1 || dayNum > daysInMonth) {
        grid += '<div class="h-8 rounded-lg bg-gray-50 border border-gray-100"></div>';
        continue;
      }

      const date = new Date(m0.getFullYear(), m0.getMonth(), dayNum);
      const avail = isAvailable(tradieId, date, store);
      const today = (toYmd(date) === toYmd(new Date()));

      const base = 'h-8 rounded-lg border text-xs flex items-center justify-center relative select-none';
      const stateCls = avail
        ? 'bg-teal-50 border-teal-200 text-teal-900'
        : 'bg-gray-50 border-gray-200 text-gray-600';
      const todayRing = today ? ' ring-2 ring-teal-300' : '';
      const cursor = editable ? ' cursor-pointer hover:opacity-90' : '';

      grid += `
        <div class="${base}${todayRing}${cursor} ${stateCls}" data-ath-cal-day="${dayNum}" title="${avail ? 'Available' : 'Unavailable'}">
          <span>${dayNum}</span>
        </div>
      `;
    }
    grid += '</div>';

    const hint = editable
      ? '<div class="mt-2 text-[11px] text-gray-500">Tip: click days to toggle availability.</div>'
      : '<div class="mt-2 text-[11px] text-gray-500">Green days mean this tradie is generally available.</div>';

    el.innerHTML = `
      <div class="border border-gray-200 rounded-xl p-3 bg-white">
        ${header}
        ${grid}
        ${hint}
      </div>
    `;

    // Wire nav
    const prev = el.querySelector('[data-ath-cal="prev"]');
    const next = el.querySelector('[data-ath-cal="next"]');
    if (prev) prev.onclick = () => {
      el.dataset.athCalMonth = String(addMonths(m0, -1).toISOString());
      render(el, opts, addMonths(m0, -1));
    };
    if (next) next.onclick = () => {
      el.dataset.athCalMonth = String(addMonths(m0, 1).toISOString());
      render(el, opts, addMonths(m0, 1));
    };

    // Wire toggles (editable only)
    if (editable) {
      el.querySelectorAll('[data-ath-cal-day]')?.forEach((cell) => {
        cell.addEventListener('click', () => {
          const dn = Number(cell.getAttribute('data-ath-cal-day'));
          if (!dn) return;
          toggle(tradieId, new Date(m0.getFullYear(), m0.getMonth(), dn));
          render(el, opts, m0);
        });
      });
    }

    if (typeof feather !== 'undefined') feather.replace();
  }

  function mountMiniCalendar(el, opts) {
    if (!el) return;
    const initial = (() => {
      try {
        const raw = el.dataset.athCalMonth;
        if (raw) return startOfMonth(new Date(raw));
      } catch { }
      return startOfMonth(new Date());
    })();
    render(el, opts || {}, initial);
  }

  return { mountMiniCalendar, read, write, isAvailable };
})();

// ----------------------------
// v0.0297: Customer booked-jobs calendar (profile block)
// ----------------------------
// Calendar mental model: show commitments (accepted jobs), not all posted jobs.
// - Customer view: jobs with status agreed or in_progress.
// - Booking date (for now): agreedAt (fallback inProgressAt, then postedAt).
// - Clicking a booked day opens ATHJobDetails modal.
window.ATHCustomerBookings = window.ATHCustomerBookings || (function () {
  function pad2(n) { return String(n).padStart(2, '0'); }

  function toYmd(d) {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }

  function startOfMonth(d) {
    const dt = new Date(d);
    dt.setDate(1);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  function addMonths(d, n) {
    const dt = new Date(d);
    dt.setMonth(dt.getMonth() + Number(n || 0));
    return startOfMonth(dt);
  }

  function monthLabel(monthDate) {
    const d = new Date(monthDate);
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  function bookingDateForJob(job) {
    const status = String(job?.status || '').toLowerCase();
    const raw = (status === 'agreed')
      ? (job?.agreedAt || job?.inProgressAt || job?.postedAt)
      : (status === 'in_progress')
        ? (job?.inProgressAt || job?.agreedAt || job?.postedAt)
        : null;
    if (!raw) return null;
    const dt = new Date(raw);
    if (isNaN(dt.getTime())) return null;
    return dt;
  }

  function jobsForDay(customerId, dayDate) {
    const cid = String(customerId || '');
    const all = window.ATHJobs?.getAllJobs?.() || [];
    const ymd = toYmd(dayDate);
    return all.filter((j) => {
      if (String(j?.customerId || '') !== cid) return false;
      const st = String(j?.status || '').toLowerCase();
      if (!(st === 'agreed' || st === 'in_progress')) return false;
      const bd = bookingDateForJob(j);
      if (!bd) return false;
      return toYmd(bd) === ymd;
    });
  }

  function render(el, opts, monthDate) {
    if (!el) return;
    const customerId = opts?.customerId;
    const m0 = startOfMonth(monthDate || new Date());

    const daysInMonth = new Date(m0.getFullYear(), m0.getMonth() + 1, 0).getDate();
    const firstDow = new Date(m0.getFullYear(), m0.getMonth(), 1).getDay();
    const offset = (firstDow + 6) % 7; // Monday-first

    const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const header = `
      <div class="flex items-center justify-between">
        <div class="text-sm font-semibold text-gray-900">Booked jobs</div>
        <div class="flex items-center gap-2">
          <button type="button" data-ath-book="prev" class="p-1 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Previous month">
            <i data-feather="chevron-left" class="w-4 h-4"></i>
          </button>
          <div class="text-xs font-medium text-gray-700" data-ath-book="label">${monthLabel(m0)}</div>
          <button type="button" data-ath-book="next" class="p-1 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Next month">
            <i data-feather="chevron-right" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;

    let grid = '<div class="mt-2 grid grid-cols-7 gap-1">';
    for (const w of weekday) {
      grid += `<div class="text-[10px] font-semibold text-gray-500 text-center">${w}</div>`;
    }

    const totalCells = 42;
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - offset + 1;
      if (dayNum < 1 || dayNum > daysInMonth) {
        grid += '<div class="h-8 rounded-lg bg-gray-50 border border-gray-100"></div>';
        continue;
      }

      const date = new Date(m0.getFullYear(), m0.getMonth(), dayNum);
      const today = (toYmd(date) === toYmd(new Date()));
      const jobs = jobsForDay(customerId, date);
      const has = jobs.length > 0;

      const base = 'h-8 rounded-lg border text-xs flex items-center justify-center relative select-none';
      const stateCls = has
        ? 'bg-teal-50 border-teal-200 text-teal-900'
        : 'bg-gray-50 border-gray-200 text-gray-600';
      const todayRing = today ? ' ring-2 ring-teal-300' : '';
      const cursor = has ? ' cursor-pointer hover:opacity-90' : '';
      const badge = has && jobs.length > 1
        ? `<span class="absolute -top-1 -right-1 text-[10px] bg-teal-600 text-white rounded-full px-1.5 py-0.5">${jobs.length}</span>`
        : '';

      const ids = has ? jobs.map(j => String(j.id)).join(',') : '';

      grid += `
        <div class="${base}${todayRing}${cursor} ${stateCls}" data-ath-book-day="${dayNum}" data-ath-book-ids="${ids}" title="${has ? 'Booked job(s)' : 'No booked jobs'}">
          <span>${dayNum}</span>
          ${badge}
        </div>
      `;
    }

    grid += '</div>';

    const hint = '<div class="mt-2 text-[11px] text-gray-500">Shows jobs you have agreed with a tradie (or currently in progress).</div>';

    el.innerHTML = `
      <div class="border border-gray-200 rounded-xl p-3 bg-white">
        ${header}
        ${grid}
        ${hint}
      </div>
    `;

    const prev = el.querySelector('[data-ath-book="prev"]');
    const next = el.querySelector('[data-ath-book="next"]');
    if (prev) prev.onclick = () => {
      el.dataset.athBookMonth = String(addMonths(m0, -1).toISOString());
      render(el, opts, addMonths(m0, -1));
    };
    if (next) next.onclick = () => {
      el.dataset.athBookMonth = String(addMonths(m0, 1).toISOString());
      render(el, opts, addMonths(m0, 1));
    };

    el.querySelectorAll('[data-ath-book-day]')?.forEach((cell) => {
      cell.addEventListener('click', () => {
        const ids = String(cell.getAttribute('data-ath-book-ids') || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        if (!ids.length) return;
        window.ATHJobDetails?.open?.(ids[0]);
      });
    });

    if (typeof feather !== 'undefined') feather.replace();
  }

  function mountMiniCalendar(el, opts) {
    if (!el) return;
    const initial = (() => {
      try {
        const raw = el.dataset.athBookMonth;
        if (raw) return startOfMonth(new Date(raw));
      } catch { }
      return startOfMonth(new Date());
    })();
    render(el, opts || {}, initial);
  }

  return { mountMiniCalendar };
})();



document.addEventListener('DOMContentLoaded', () => {
  if (typeof feather !== 'undefined') feather.replace();
  initAuthUI();
  // Allow deep-link: index.html#signin
  try {
    if (String(window.location.hash || '').toLowerCase() === '#signin') openAuthModal('signin');
  } catch { }
  // initMobileMenu(); // Removed v0.0298
  initMessagesPage();
  initMyProfilePage();
  initFilterDrawer();
  initIntegrityBanners();
});


// ----------------------------
// Batch N3: Page banners
// ----------------------------
function initIntegrityBanners() {
  window.ATHIntegrity?.renderBanner(document.getElementById('athIntegrityBannerMountJobs'));
  // Optional mounts on other pages
  window.ATHIntegrity?.renderBanner(document.getElementById('athIntegrityBannerMountProfileTradie'));
  window.ATHIntegrity?.renderBanner(document.getElementById('athIntegrityBannerMountProfileCustomer'));
}

// ----------------------------
// Batch M: Mobile filter drawer
// ----------------------------
function initFilterDrawer() {
  const drawer = document.getElementById('athFiltersDrawer');
  const openBtn = document.getElementById('athOpenFilters');
  const backdrop = document.getElementById('athFiltersBackdrop');
  const closeBtn = document.getElementById('athCloseFilters');

  if (!drawer || (!openBtn && !backdrop)) return; // only on pages that include the drawer

  const open = () => {
    drawer.classList.add('ath-open');
    if (backdrop) backdrop.classList.remove('hidden');
    document.body.classList.add('ath-body-lock');
  };

  const close = () => {
    drawer.classList.remove('ath-open');
    if (backdrop) backdrop.classList.add('hidden');
    document.body.classList.remove('ath-body-lock');
  };

  if (openBtn) openBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (backdrop) backdrop.addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // If user resizes to desktop, ensure drawer state doesn't trap scroll.
  const mq = window.matchMedia('(min-width: 1024px)');
  const onMq = () => {
    if (mq.matches) close();
  };
  if (mq.addEventListener) mq.addEventListener('change', onMq);
  else if (mq.addListener) mq.addListener(onMq);
}


// ----------------------------
// Current User (localStorage)
// ----------------------------
function getCurrentUser() {
  try {
    const raw = localStorage.getItem('athCurrentUser');
    if (raw) return JSON.parse(raw);
  } catch (e) { }
  return (window.CURRENT_USER_DEFAULT && typeof window.CURRENT_USER_DEFAULT === 'object')
    ? JSON.parse(JSON.stringify(window.CURRENT_USER_DEFAULT))
    : { id: 'me', role: 'dual', displayName: 'Me', avatar: '', location: { suburb: '', state: '', postcode: '' }, contact: { phone: '', email: '' }, privacy: { showLocation: true, addressRule: 'afterAccepted' }, verification: { verified: false, abnFull: '', licenseFull: '' } };
}

function setCurrentUser(user) {
  localStorage.setItem('athCurrentUser', JSON.stringify(user));
}

// Merge helper (keeps nested objects intact). Useful for future auth/backends.
function saveCurrentUser(patch) {
  const base = getCurrentUser();
  const merged = {
    ...base,
    ...patch,
    location: { ...(base.location || {}), ...((patch || {}).location || {}) },
    contact: { ...(base.contact || {}), ...((patch || {}).contact || {}) },
    privacy: { ...(base.privacy || {}), ...((patch || {}).privacy || {}) },
    verification: { ...(base.verification || {}), ...((patch || {}).verification || {}) },
    auth: { ...(base.auth || {}), ...((patch || {}).auth || {}) },
  };
  setCurrentUser(merged);
  return merged;
}

function maskSensitiveKeepLast4(value) {
  const v = String(value || '').replace(/\s+/g, '');
  if (!v) return '—';
  const last4 = v.slice(-4);
  // safest: only reveal last 4
  return `**** **** ${last4}`;
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
  // Call other existing inits if they exist and aren't called elsewhere
  if (typeof initAuthUI === 'function') initAuthUI();
  if (typeof initMessagesPage === 'function') initMessagesPage();
  if (typeof initProfilePage === 'function') initProfilePage();
});


// ----------------------------
// v0.026: Auth UI (nav button + modal)
// ----------------------------
function initAuthUI() {
  // Safe guard for pages that don't load fully or run twice
  try {
    ensureAuthNavButtons();
    ensureAuthModal();
    syncAuthNavState();
  } catch (e) {
    // keep page usable even if auth UI fails
  }
}

function ensureAuthNavButtons() {
  // "My Profile" appears in the top nav as an anchor with responsive display
  // classes (e.g. "hidden md:inline-flex"). Tailwind's responsive display can
  // override the "hidden" class at larger breakpoints, so we force-hide via
  // inline style when logged out.
  const navEl = document.querySelector('nav');
  const desktopProfileLink = navEl
    ? Array.from(navEl.querySelectorAll('a[href^="my-profile.html"]')).find(a => !a.closest('#mobileMenu'))
    : null;
  const mobileProfileLink = document.querySelector('#mobileMenu a[href^="my-profile.html"]');

  const forceProfileVisibility = (a, visible) => {
    if (!a) return;
    a.style.display = visible ? '' : 'none';
    a.setAttribute('aria-hidden', visible ? 'false' : 'true');
    a.tabIndex = visible ? 0 : -1;
  };

  // v0.026b: default-hide profile links until authenticated (avoids flash before syncAuthNavState runs).
  try {
    const session = window.ATHAuth?.getSession?.();
    const loggedIn = !!session?.userId;
    forceProfileVisibility(desktopProfileLink, loggedIn);
  } catch { }

  // If logged out, block My Profile navigation and open Sign in instead.
  const guardProfileLink = (a) => {
    if (!a || a.getAttribute('data-auth-guarded') === '1') return;
    a.setAttribute('data-auth-guarded', '1');
    a.addEventListener('click', (e) => {
      const session = window.ATHAuth?.getSession?.();
      if (session?.userId) return; // allow
      e.preventDefault();
      openAuthModal('signin');
    });
  };
  guardProfileLink(desktopProfileLink);

  // v0.027: If logged out, block Messages navigation (requires signed-in account)
  const allMessagesLinks = Array.from(document.querySelectorAll('a[href^="messages.html"]'));
  const guardMessagesLink = (a) => {
    if (!a || a.getAttribute('data-auth-guarded-messages') === '1') return;
    a.setAttribute('data-auth-guarded-messages', '1');
    a.addEventListener('click', (e) => {
      const session = window.ATHAuth?.getSession?.();
      if (session?.userId) return;
      e.preventDefault();
      openAuthModal('signin');
    });
  };
  allMessagesLinks.forEach(guardMessagesLink);

  if (desktopProfileLink && !document.getElementById('athAuthNavBtn')) {
    const btn = document.createElement('button');
    btn.id = 'athAuthNavBtn';
    btn.type = 'button';
    btn.className = 'ml-3 px-3 py-2 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200 transition';
    btn.addEventListener('click', onAuthNavClick);
    desktopProfileLink.insertAdjacentElement('afterend', btn);
  }

  // authNavBtn for desktop
  if (desktopProfileLink && !document.getElementById('athAuthNavBtn')) {
    const btn = document.createElement('button');
    btn.id = 'athAuthNavBtn';
    btn.type = 'button';
    btn.className = 'ml-3 px-3 py-2 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200 transition';
    btn.addEventListener('click', onAuthNavClick);
    desktopProfileLink.insertAdjacentElement('afterend', btn);
  }
}

// Simple route guard for pages that should require auth.
function requireAuthOnPage(opts) {
  const cfg = opts || {};
  const onMissing = cfg.onMissing || 'overlay'; // overlay | redirect
  const current = (window.location && window.location.pathname) ? window.location.pathname.split('/').pop() : '';

  const session = window.ATHAuth?.getSession?.();
  if (session?.userId) return true;

  // Ensure modal exists then prompt
  ensureAuthModal();
  openAuthModal('signin');

  if (onMissing === 'redirect') {
    // Send them home; keep a hint so we can reopen the modal.
    try { window.location.href = `index.html#signin`; } catch { }
    return false;
  }

  // Overlay the page content
  const main = document.querySelector('main');
  if (main && !document.getElementById('athAuthGate')) {
    main.classList.add('blur-sm', 'pointer-events-none', 'select-none');
    const gate = document.createElement('div');
    gate.id = 'athAuthGate';
    gate.className = 'fixed inset-0 z-[90] flex items-center justify-center p-4';
    gate.innerHTML = `
      <div class="absolute inset-0 bg-black/40"></div>
      <div class="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 p-5">
        <h3 class="text-lg font-extrabold text-gray-900">Sign in required</h3>
        <p class="text-sm text-gray-600 mt-1">You need to be signed in to view your profile.</p>
        <div class="mt-4 flex gap-2">
          <button id="athAuthGateSignIn" type="button" class="flex-1 px-4 py-2 rounded-lg bg-gray-900 text-white font-semibold hover:bg-black transition">Sign in</button>
          <a href="index.html" class="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-800 font-semibold text-center hover:bg-gray-50 transition">Go home</a>
        </div>
        <p class="mt-3 text-xs text-gray-500">Prototype note: accounts are stored locally in your browser.</p>
      </div>
    `;
    document.body.appendChild(gate);
    gate.querySelector('#athAuthGateSignIn')?.addEventListener('click', () => openAuthModal('signin'));

    // Un-gate once the user signs in.
    const onAuth = (ev) => {
      const s = ev?.detail?.session || window.ATHAuth?.getSession?.();
      if (!s?.userId) return;
      try { document.getElementById('athAuthGate')?.remove(); } catch { }
      try { main.classList.remove('blur-sm', 'pointer-events-none', 'select-none'); } catch { }
      try { window.removeEventListener('ath:authchange', onAuth); } catch { }
      // If this page has its own init relying on auth, reload to keep it simple.
      try { window.location.reload(); } catch { }
    };
    window.addEventListener('ath:authchange', onAuth);
  }

  return false;
}

function ensureAuthModal() {
  if (document.getElementById('athAuthModal')) return;

  const wrap = document.createElement('div');
  wrap.id = 'athAuthModal';
  wrap.className = 'fixed inset-0 z-[100] hidden';
  wrap.innerHTML = `
    <div class="absolute inset-0 bg-black/50" data-auth-close></div>
    <div class="relative h-full w-full flex items-center justify-center p-4">
      <div class="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div class="p-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-extrabold text-gray-900">Sign in</h2>
            <p class="text-xs text-gray-600 mt-1">Prototype auth (local only). Email verification coming soon.</p>
          </div>
          <button type="button" class="p-2 rounded-lg hover:bg-gray-100" aria-label="Close" data-auth-close>
            <i data-feather="x"></i>
          </button>
        </div>

        <div class="p-5">
          <div class="flex gap-2 mb-4">
            <button type="button" class="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white" data-auth-tab="signin">Sign in</button>
            <button type="button" class="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200" data-auth-tab="signup">Sign up</button>
          </div>

          <div id="athAuthError" class="hidden mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"></div>
          <div id="athAuthNote" class="mb-4 text-xs text-gray-600">
            <span class="font-semibold">Note:</span> accounts are stored in your browser only. Other users won't see them.
          </div>

          <form id="athAuthForm" class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-1">Email</label>
              <input id="athAuthEmail" type="email" autocomplete="email" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="you@example.com" required />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-1">Password</label>
              <input id="athAuthPassword" type="password" autocomplete="current-password" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="••••••••" required />
            </div>
            <div id="athAuthConfirmWrap" class="hidden">
              <label class="block text-xs font-semibold text-gray-700 mb-1">Confirm password</label>
              <input id="athAuthPassword2" type="password" autocomplete="new-password" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="••••••••" />
            </div>

            <button id="athAuthSubmit" type="submit" class="w-full px-4 py-2 rounded-lg bg-gray-900 text-white font-semibold hover:bg-black transition">Continue</button>

            <div class="relative my-3">
              <div class="h-px bg-gray-200"></div>
              <div class="absolute inset-x-0 -top-2 flex justify-center">
                <span class="px-2 bg-white text-xs text-gray-500">or</span>
              </div>
            </div>

            <div id="googleSignInBtn" class="w-full flex justify-center"></div>

            <div class="mt-3 text-xs text-gray-600">
              <span class="inline-flex items-center gap-2">
                <span class="px-2 py-0.5 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700 font-semibold">Unverified</span>
                Email verification is not implemented yet.
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(wrap);
  if (typeof feather !== 'undefined') feather.replace();

  // Wire close
  wrap.querySelectorAll('[data-auth-close]').forEach((el) => {
    el.addEventListener('click', () => closeAuthModal());
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAuthModal();
  });

  // Wire tabs
  wrap.querySelectorAll('[data-auth-tab]').forEach((btn) => {
    btn.addEventListener('click', () => setAuthTab(String(btn.getAttribute('data-auth-tab') || 'signin')));
  });

  // Wire submit
  const form = wrap.querySelector('#athAuthForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleAuthSubmit();
    });
  }

  // Init Google Sign-In (check immediately, and retry if needed)
  tryInitGoogleAuth(wrap);
}

function tryInitGoogleAuth(wrap) {
  if (window.google?.accounts?.id) {
    window.google.accounts.id.initialize({
      client_id: '470923800576-9326rggc6nsrukjbgdtvgbcckof6en09.apps.googleusercontent.com',
      callback: handleGoogleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true
    });

    const googleBtn = wrap ? wrap.querySelector('#googleSignInBtn') : document.getElementById('googleSignInBtn');
    if (googleBtn) {
      window.google.accounts.id.renderButton(
        googleBtn,
        { theme: 'outline', size: 'large', width: 250 }
      );
    }
  } else {
    // Retry once after a short delay in case script is racing
    setTimeout(() => {
      if (window.google?.accounts?.id && typeof tryInitGoogleAuth === 'function') {
        tryInitGoogleAuth(wrap);
      }
    }, 500);
  }
}

// Make handler global for Google callback
window.handleGoogleCredentialResponse = handleGoogleCredentialResponse;

// JWT Decode Helper
function parseJwt(token) {
  try {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

async function handleGoogleCredentialResponse(response) {
  const data = parseJwt(response.credential);
  if (data) {
    const googleUser = {
      email: data.email,
      name: data.name,
      picture: data.picture,
      sub: data.sub
    };

    const res = await window.ATHAuth?.signInWithGoogle?.(googleUser);
    if (res?.ok) {
      syncAuthNavState();
      closeAuthModal();
    } else {
      setAuthError(res?.error || 'Google sign in failed.');
    }
  } else {
    setAuthError('Failed to process Google login.');
  }

}


function onAuthNavClick() {
  const session = window.ATHAuth?.getSession?.();
  if (session?.userId) {
    window.ATHAuth?.signOut?.();
    syncAuthNavState();
    // v0.028: If the user logs out while on messages, immediately redirect to Home
    // to avoid leaving a partly-interactive page behind.
    try {
      const p = String(window.location?.pathname || '');
      if (p.endsWith('/messages.html') || p.endsWith('messages.html')) {
        window.location.href = 'index.html';
        return;
      }
    } catch { }
    return;
  }
  openAuthModal('signin');
}

function syncAuthNavState() {
  const session = window.ATHAuth?.getSession?.();
  const email = session?.email ? String(session.email) : '';
  const desktop = document.getElementById('athAuthNavBtn');
  const mobile = document.getElementById('athAuthNavBtnMobile');

  // v0.026c: Hide "My Profile" until authenticated.
  // NOTE: the nav link uses responsive display classes (e.g. "hidden md:inline-flex"),
  // which can override the "hidden" class at larger breakpoints. Force-hide via inline style.
  const navEl = document.querySelector('nav');
  const desktopProfileLink = navEl
    ? Array.from(navEl.querySelectorAll('a[href^="my-profile.html"]')).find(a => !a.closest('#mobileMenu'))
    : null;

  const loggedIn = !!session?.userId;
  const forceProfileVisibility = (a, visible) => {
    if (!a) return;
    a.style.display = visible ? '' : 'none';
    a.setAttribute('aria-hidden', visible ? 'false' : 'true');
    a.tabIndex = visible ? 0 : -1;
  };
  forceProfileVisibility(desktopProfileLink, loggedIn);

  const label = session?.userId
    ? (email ? `Logout (${email})` : 'Logout')
    : 'Sign in';

  if (desktop) desktop.textContent = label;
}

function openAuthModal(tab) {
  ensureAuthModal();
  setAuthTab(tab || 'signin');
  const wrap = document.getElementById('athAuthModal');
  if (!wrap) return;
  wrap.classList.remove('hidden');
  // reset error
  setAuthError('');
  // focus email
  setTimeout(() => {
    try { document.getElementById('athAuthEmail')?.focus(); } catch { }
  }, 50);
}

function closeAuthModal() {
  const wrap = document.getElementById('athAuthModal');
  if (!wrap) return;
  wrap.classList.add('hidden');
}

function setAuthError(msg) {
  const el = document.getElementById('athAuthError');
  if (!el) return;
  const m = String(msg || '').trim();
  if (!m) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }
  el.textContent = m;
  el.classList.remove('hidden');
}

function setAuthTab(tab) {
  const t = (tab === 'signup') ? 'signup' : 'signin';
  const wrap = document.getElementById('athAuthModal');
  if (!wrap) return;

  const title = wrap.querySelector('h2');
  if (title) title.textContent = (t === 'signup') ? 'Sign up' : 'Sign in';

  const btnSignin = wrap.querySelector('[data-auth-tab="signin"]');
  const btnSignup = wrap.querySelector('[data-auth-tab="signup"]');
  const confirmWrap = document.getElementById('athAuthConfirmWrap');
  const pass = document.getElementById('athAuthPassword');
  const pass2 = document.getElementById('athAuthPassword2');

  const setBtn = (btn, active) => {
    if (!btn) return;
    if (active) {
      btn.className = 'flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white';
    } else {
      btn.className = 'flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200';
    }
  };
  setBtn(btnSignin, t === 'signin');
  setBtn(btnSignup, t === 'signup');

  if (confirmWrap) confirmWrap.classList.toggle('hidden', t !== 'signup');
  if (pass) pass.autocomplete = (t === 'signup') ? 'new-password' : 'current-password';
  if (pass2) pass2.value = '';

  wrap.setAttribute('data-auth-mode', t);
  setAuthError('');
}

async function handleAuthSubmit() {
  const wrap = document.getElementById('athAuthModal');
  if (!wrap) return;

  const mode = String(wrap.getAttribute('data-auth-mode') || 'signin');
  const email = document.getElementById('athAuthEmail')?.value || '';
  const password = document.getElementById('athAuthPassword')?.value || '';
  const password2 = document.getElementById('athAuthPassword2')?.value || '';

  if (mode === 'signup') {
    if (String(password2) !== String(password)) {
      setAuthError('Passwords do not match.');
      return;
    }
    const res = await window.ATHAuth?.signUp?.(email, password);
    if (!res?.ok) {
      setAuthError(res?.error || 'Sign up failed.');
      return;
    }
  } else {
    const res = await window.ATHAuth?.signIn?.(email, password);
    if (!res?.ok) {
      setAuthError(res?.error || 'Sign in failed.');
      return;
    }
  }

  syncAuthNavState();
  closeAuthModal();
}

// ----------------------------
// Messages Page
// ----------------------------
function initMessagesPage() {
  const list = document.getElementById('conversationsList');
  const emptyEl = document.getElementById('conversationsEmpty');
  const searchInput = document.getElementById('conversationsSearch');

  const chat = document.getElementById('chatScroll');
  const input = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendButton');

  const chatName = document.getElementById('chatName');
  const chatMeta = document.getElementById('chatMeta');
  const chatStatus = document.getElementById('chatStatus');
  const chatAvatar = document.getElementById('chatAvatar');
  const chatOnlineDot = document.getElementById('chatOnlineDot');
  const unreadLabel = document.getElementById('unreadCountLabel');

  // v0.027a: UI containment + empty-state handling
  const chatPane = document.getElementById('athChatPane');
  const emptyPane = document.getElementById('athMessagesEmptyState');
  const emptyTitle = document.getElementById('athMessagesEmptyTitle');
  const emptyBody = document.getElementById('athMessagesEmptyBody');
  const jobDetailsCard = document.getElementById('jobDetailsCard');
  const contextMount = document.getElementById('athMessagesContextPanel');

  // Mobile View Logic
  const msgContainer = document.getElementById('athMessagesContainer');
  const backBtn = document.getElementById('chatBackBtn');

  const activateMobileList = () => {
    if (msgContainer) {
      msgContainer.classList.add('ath-mobile-list-view');
      msgContainer.classList.remove('ath-mobile-chat-view');
    }
  };

  const activateMobileChat = () => {
    if (msgContainer) {
      msgContainer.classList.remove('ath-mobile-list-view');
      msgContainer.classList.add('ath-mobile-chat-view');
    }
  };

  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      activateMobileList();
    });
  }

  const showEmpty = (title, body) => {
    if (chatPane) chatPane.style.display = 'none';
    if (jobDetailsCard) jobDetailsCard.style.display = 'none';
    if (emptyTitle) emptyTitle.textContent = title || 'No conversations yet';
    if (emptyBody) emptyBody.textContent = body || 'Start a conversation from a job listing.';
    if (emptyPane) emptyPane.classList.remove('hidden');
  };

  const showChat = () => {
    if (emptyPane) emptyPane.classList.add('hidden');
    if (chatPane) chatPane.style.display = '';
    if (jobDetailsCard) jobDetailsCard.style.display = '';
  };

  // Not on messages page
  if (!list || !chat || !chatName || !chatMeta || !chatStatus || !chatAvatar) return;

  // v0.027: Require auth for messages + scope conversations per account
  const session = window.ATHAuth?.getSession?.();
  if (!session?.userId) {
    try { openAuthModal('signin'); } catch { }
    // Minimal UI: hide chat panes + show sign-in empty state
    if (input) {
      input.disabled = true;
      input.classList.add('opacity-50', 'cursor-not-allowed');
    }
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    if (unreadLabel) unreadLabel.textContent = '—';
    showEmpty('Sign in to view messages', 'Sign in to see your conversations and send messages.');
    if (list) list.innerHTML = '';
    if (emptyEl) {
      emptyEl.textContent = 'Sign in to view your messages.';
      emptyEl.classList.remove('hidden');
    }
    return;
  }

  const uid = session.userId;
  const STORE_KEY = `athConversations:${uid}`;
  const lastActiveKey = `lastActiveConversation:${uid}`;

  // File attachment handlers
  const imageInput = document.getElementById('imageInput');
  const fileInput = document.getElementById('fileInput');
  
  if (imageInput) {
    imageInput.addEventListener('change', (e) => handleFileUpload(e, 'image'));
  }
  if (fileInput) {
    fileInput.addEventListener('change', (e) => handleFileUpload(e, 'file'));
  }

  // Pending upload state (v0.080)
  window.pendingUpload = null;

  function sendAttachment(fileData, caption = '') {
      const id = getConversationIdFromUrl() || getDefaultConversationId();
      if (!id || !DATA[id]) return;

      const now = Date.now();
      const newMessage = {
        from: 'me',
        time: 'Now',
        ts: now,
        text: caption || (fileData.type === 'image' ? '📷 Photo' : `📎 ${fileData.name}`),
        attachment: fileData,
        status: 'sent'
      };

      DATA[id].messages.push(newMessage);
      window.ATHStore.set(STORE_KEY, DATA);

      renderMessages(DATA[id]);
      renderConversationList(searchInput?.value || '');
      setActiveRow(id);

      // Simulate status updates
      setTimeout(() => {
        newMessage.status = 'delivered';
        window.ATHStore.set(STORE_KEY, DATA);
        renderMessages(DATA[id]);
        
        setTimeout(() => {
          newMessage.status = 'read';
          window.ATHStore.set(STORE_KEY, DATA);
          renderMessages(DATA[id]);
        }, 1500);
      }, 500);
  }

  async function handleFileUpload(event, type) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (type === 'image') {
      // v0.085: Compress image (Limit 10MB input but store compressed)
      if (file.size > 10 * 1024 * 1024) {
         alert('Image too large (max 10MB)');
         event.target.value = '';
         return;
      }
      
      try {
        // Use increased limit here because we want to accept it for compression
        const compressedData = await window.ATHImages.processImageFile(file, {
          maxDim: 1600,
          quality: 0.8,
          maxBytes: 15 * 1024 * 1024 
        });
        
        if (!compressedData) throw new Error('Compression failed');
        
        // Calculate savings
        const originalBytes = file.size;
        const compressedBytes = Math.round((compressedData.length * 3) / 4);
        const savedPercent = Math.round((1 - compressedBytes/originalBytes) * 100);
        
        // UI Stats
        const statsEl = document.getElementById('previewStats');
        if (statsEl) {
           const origFmt = (originalBytes / 1024).toFixed(0) + 'KB';
           const compFmt = (compressedBytes / 1024).toFixed(0) + 'KB';
           statsEl.textContent = `Compressed: ${compFmt} (was ${origFmt}, saved ${savedPercent}%)`;
           statsEl.classList.remove('hidden');
        }

        const fileData = {
          type: type,
          name: file.name,
          size: compressedBytes,
          data: compressedData
        };

        // Show Preview
        window.pendingUpload = fileData;
        const modal = document.getElementById('imagePreviewModal');
        const img = document.getElementById('previewImage');
        const panel = document.getElementById('previewPanel');
        
        if (modal && img) {
          img.src = fileData.data;
          document.getElementById('previewCaption').value = '';
          modal.classList.remove('hidden');
          requestAnimationFrame(() => {
             modal.classList.remove('opacity-0');
             if(panel) {
                panel.classList.remove('scale-95');
                panel.classList.add('scale-100');
             }
          });
        }
      } catch (err) {
        console.error('Image processing error:', err);
        alert('Failed to process image.');
      }
      event.target.value = ''; 
      return;
    }

    // Normal file handling
    // Size limit: 5MB
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const fileData = {
        type: type,
        name: file.name,
        size: file.size,
        data: e.target.result
      };
      
      sendAttachment(fileData);
      event.target.value = ''; 
    };
    reader.readAsDataURL(file);
  }

  // v0.080: Global Modal Handlers
  window.confirmSendImage = function() {
    if (!window.pendingUpload) return;
    const caption = document.getElementById('previewCaption').value.trim();
    sendAttachment(window.pendingUpload, caption);
    window.closePreviewModal();
  };

  window.closePreviewModal = function() {
    const modal = document.getElementById('imagePreviewModal');
    const panel = document.getElementById('previewPanel');
    if (modal) {
       modal.classList.add('opacity-0');
       if(panel) {
         panel.classList.remove('scale-100');
         panel.classList.add('scale-95');
       }
       setTimeout(() => {
         modal.classList.add('hidden');
         window.pendingUpload = null;
       }, 200);
    }
  };
  
  window.openLightbox = function(src) {
    const modal = document.getElementById('lightboxModal');
    const img = document.getElementById('lightboxImage');
    if (modal && img) {
      img.src = src;
      modal.classList.remove('hidden');
    }
  };

  window.closeLightbox = function() {
    const modal = document.getElementById('lightboxModal');
    if (modal) modal.classList.add('hidden');
  };

  // Emoji Picker
  const emojiPickerBtn = document.getElementById('emojiPickerBtn');
  let isTogglingPicker = false;
  
  if (emojiPickerBtn && input) {
    emojiPickerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      isTogglingPicker = true;
      setTimeout(() => { isTogglingPicker = false; }, 300);
      showEmojiPicker();
    });
  }

  function showEmojiPicker() {
    const container = document.getElementById('emojiPickerContainer');
    if (!container) {
      console.error('Emoji picker container not found');
      return;
    }
    
    // Toggle - remove existing picker
    const existingPicker = document.getElementById('emojiPickerPopup');
    if (existingPicker) {
      existingPicker.remove();
      return;
    }

    const emojis = {
      'Smileys': ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳'],
      'Gestures': ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾'],
      'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
      'Symbols': ['✅', '❌', '⭐', '🌟', '💫', '✨', '⚡', '🔥', '💥', '💯', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉']
    };

    const picker = document.createElement('div');
    picker.id = 'emojiPickerPopup';
    picker.className = 'bg-white border-2 border-gray-300 rounded-lg shadow-2xl p-4 w-80 max-h-96 overflow-y-auto z-50';
    picker.style.position = 'relative';
    picker.style.zIndex = '9999';
    
    let pickerHTML = '<div class="space-y-3">';
    for (const [category, emojiList] of Object.entries(emojis)) {
      pickerHTML += `
        <div>
          <div class="text-xs font-semibold text-gray-600 mb-2">${category}</div>
          <div class="grid grid-cols-8 gap-1">
            ${emojiList.map(emoji => `
              <button type="button" class="text-2xl hover:bg-gray-100 rounded p-1 transition" onclick="window.insertEmoji('${emoji}')">${emoji}</button>
            `).join('')}
          </div>
        </div>
      `;
    }
    pickerHTML += '</div>';
    picker.innerHTML = pickerHTML;
    
    container.appendChild(picker);
    console.log('Emoji picker created and appended');
    
    // Close picker on Escape key (accessibility)
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        picker.remove();
        document.removeEventListener('keydown', escapeHandler);
        document.removeEventListener('click', closeHandler);
        input.focus(); // Return focus to message input
      }
    };
    document.addEventListener('keydown', escapeHandler);
    
    // Close picker on click outside - with proper button detection and toggle prevention
    setTimeout(() => {
      const closeHandler = (e) => {
        // Don't close if we're currently toggling
        if (isTogglingPicker) return;
        
        // Check if click is inside picker OR inside the button (including its children like SVG)
        if (!picker.contains(e.target) && !emojiPickerBtn.contains(e.target)) {
          picker.remove();
          document.removeEventListener('click', closeHandler);
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 300); // Delay to ensure toggle flag is set
  }

  window.insertEmoji = function(emoji) {
    if (!input) return;
    const cursorPos = input.selectionStart || 0;
    const textBefore = input.value.substring(0, cursorPos);
    const textAfter = input.value.substring(cursorPos);
    input.value = textBefore + emoji + textAfter;
    input.focus();
    input.setSelectionRange(cursorPos + emoji.length, cursorPos + emoji.length);
    
    // Close picker
    const picker = document.getElementById('emojiPickerPopup');
    if (picker) picker.remove();
  };

  // Message menu toggle
  window.toggleMessageMenu = function(ts) {
    const menu = document.getElementById(`menu-${ts}`);
    if (!menu) return;
    
    // Close all other menus
    document.querySelectorAll('[id^="menu-"]').forEach(m => {
      if (m.id !== `menu-${ts}`) m.classList.add('hidden');
    });
    
    menu.classList.toggle('hidden');
    
    // Close menu on click outside OR Escape key
    if (!menu.classList.contains('hidden')) {
      // Escape key handler
      const escapeHandler = (e) => {
        if (e.key === 'Escape') {
          menu.classList.add('hidden');
          document.removeEventListener('keydown', escapeHandler);
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);
      
      setTimeout(() => {
        const closeHandler = (e) => {
          if (!menu.contains(e.target)) {
            menu.classList.add('hidden');
            document.removeEventListener('click', closeHandler);
            document.removeEventListener('keydown', escapeHandler);
          }
        };
        document.addEventListener('click', closeHandler);
      }, 100);
    }
  };

  // Edit message
  window.startEditMessage = function(ts) {
    const id = getConversationIdFromUrl() || getDefaultConversationId();
    if (!id || !DATA[id]) return;
    
    const message = DATA[id].messages.find(m => m.ts === Number(ts));
    if (!message || message.deleted) return;
    
    const messageEl = document.getElementById(`msg-${ts}`);
    if (!messageEl) return;
    
    // Close menu
    const menu = document.getElementById(`menu-${ts}`);
    if (menu) menu.classList.add('hidden');
    
    // Show edit input
    const bubbleEl = messageEl.querySelector('.bg-teal-600');
    if (!bubbleEl) return;
    
    const originalText = message.text;
    const escapedText = String(originalText).replace(/"/g, '&quot;');
    bubbleEl.innerHTML = `
      <input type="text" 
             id="edit-input-${ts}" 
             value="${escapedText}" 
             class="w-full bg-white text-black px-2 py-1 rounded border-2 border-teal-400 focus:outline-none"
             onkeydown="if(event.key==='Enter') window.saveEdit('${ts}'); if(event.key==='Escape') window.cancelEdit('${ts}');">
      <div class="mt-2 text-xs opacity-80">Press Enter to save, Esc to cancel</div>
    `;
    
    const editInput = document.getElementById(`edit-input-${ts}`);
    if (editInput) {
      editInput.focus();
      editInput.select();
    }
  };

  window.saveEdit = function(ts) {
    const id = getConversationIdFromUrl() || getDefaultConversationId();
    if (!id || !DATA[id]) return;
    
    const editInput = document.getElementById(`edit-input-${ts}`);
    if (!editInput) return;
    
    const newText = editInput.value.trim();
    if (!newText) {
      alert('Message cannot be empty');
      return;
    }
    
    const message = DATA[id].messages.find(m => m.ts === Number(ts));
    if (message) {
      message.text = newText;
      message.editedAt = Date.now();
      window.ATHStore.set(STORE_KEY, DATA);
      renderMessages(DATA[id]);
      renderConversationList(searchInput?.value || '');
    }
  };

  window.cancelEdit = function(ts) {
    const id = getConversationIdFromUrl() || getDefaultConversationId();
    if (!id || !DATA[id]) return;
    renderMessages(DATA[id]);
  };

  // Delete message
  window.deleteMessage = function(ts) {
    if (!confirm('Delete this message?')) return;
    
    const id = getConversationIdFromUrl() || getDefaultConversationId();
    if (!id || !DATA[id]) return;
    
    const message = DATA[id].messages.find(m => m.ts === Number(ts));
    if (message) {
      message.deleted = true;
      message.text = '';
      message.attachment = null;
      window.ATHStore.set(STORE_KEY, DATA);
      renderMessages(DATA[id]);
      renderConversationList(searchInput?.value || '');
    }
    
    // Close menu
    const menu = document.getElementById(`menu-${ts}`);
    if (menu) menu.classList.add('hidden');
  };

  // Batch N3: integrity banner + disable off-platform call/video actions
  window.ATHIntegrity?.renderBanner(document.getElementById('athIntegrityBannerMountMessages'));
  document.querySelectorAll('[aria-label="Call"], [aria-label="Video call"]')?.forEach((btn) => {
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    btn.title = 'Locked until payment is confirmed';
  });

  // v0.045: Create pinned messages section if it doesn't exist
  const chatScroll = document.getElementById('chatScroll');
  if (chatScroll && !document.getElementById('pinnedMessagesSection')) {
    const pinnedSection = document.createElement('div');
    pinnedSection.id = 'pinnedMessagesSection';
    pinnedSection.className = 'hidden border-b border-gray-200 bg-gradient-to-r from-amber-50 to-yellow-50 px-4 py-3';
    pinnedSection.innerHTML = `
      <div class="text-xs font-semibold text-amber-800 mb-2 flex items-center">
        <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"></path>
        </svg>
        Pinned Messages
      </div>
      <div id="pinnedMessagesList" class="space-y-2 max-h-60 overflow-y-auto">
        <!-- Rendered by script.js -->
      </div>
    `;
    chatScroll.parentElement.insertBefore(pinnedSection, chatScroll);
  }

  let DATA = window.ATHStore.get(STORE_KEY, {});
  if (!DATA || typeof DATA !== 'object') DATA = {};

  // Seed conversations from window.CONVERSATIONS if empty (first load for this user)
  if (Object.keys(DATA).length === 0 && window.CONVERSATIONS) {
    DATA = JSON.parse(JSON.stringify(window.CONVERSATIONS)); // Deep clone
    window.ATHStore.set(STORE_KEY, DATA);
  }

  const safeText = (t) => (window.ATHIntegrity ? window.ATHIntegrity.sanitizeText(t).text : String(t || ''));

  const sanitizeNoteEl = document.getElementById('athMessageSanitizeNote');


  // ----------------------------
  // Helpers (messages)
  // ----------------------------
  const getLastMessage = (id) => {
    const msgs = DATA?.[id]?.messages || [];
    return msgs.length ? msgs[msgs.length - 1] : null;
  };

  const getLastTs = (id) => {
    const m = getLastMessage(id);
    return m?.ts || 0;
  };

  const getReadTsKey = (id) => `readts:${uid}:${id}`;
  const getReadTs = (id) => Number(localStorage.getItem(getReadTsKey(id)) || 0);

  const getUnreadCount = (id) => {
    const last = getLastMessage(id);
    if (!last) return 0;
    // Only treat as unread if the latest message is from them and we haven't read up to that timestamp.
    if (last.from !== 'them') return 0;
    return getLastTs(id) > getReadTs(id) ? 1 : 0;
  };

  const getTotalUnread = () => Object.keys(DATA).reduce((acc, id) => acc + getUnreadCount(id), 0);

  function updateUnreadUI() {
    if (!unreadLabel) return;
    const unread = getTotalUnread();
    unreadLabel.textContent = unread ? `${unread} unread` : 'All read';
  }

  function markRead(id) {
    const ts = getLastTs(id);
    localStorage.setItem(getReadTsKey(id), String(ts));
  }

  function setActiveRow(id) {
    list.querySelectorAll('.conversation-item').forEach((row) => {
      const isActive = row.dataset.conversation === id;
      row.classList.toggle('bg-teal-50', isActive);
      row.classList.toggle('hover:bg-gray-50', !isActive);
    });
  }

  // ----------------------------
  // Render: sidebar
  // ----------------------------
  function renderConversationList(filterText = '') {
    const q = (filterText || '').trim().toLowerCase();

    const ids = Object.keys(DATA)
      .sort((a, b) => getLastTs(b) - getLastTs(a))
      .filter((id) => {
        if (!q) return true;
        const c = DATA[id];
        const last = getLastMessage(id);
        const hay = [c?.name, c?.meta, last?.text].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });

    // Empty / no-results states
    if (ids.length === 0) {
      list.innerHTML = '';
      if (emptyEl) {
        emptyEl.textContent = q ? 'No conversations match your search.' : 'No conversations yet.';
        emptyEl.classList.remove('hidden');
      }
      updateUnreadUI();
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    const active = getConversationIdFromUrl() || getDefaultConversationId();

    list.innerHTML = ids.map((id, idx) => {
      const c = DATA[id];
      const last = getLastMessage(id);
      const preview = safeText(last?.text || '');
      const time = last?.time || '';
      const unread = getUnreadCount(id);
      const online = !!c?.online;
      const tag = c?.tag;

      const dotClass = online ? 'bg-green-500' : 'bg-gray-400';
      const activeClass = (id === active) ? 'bg-teal-50' : '';
      const borderClass = idx === ids.length - 1 ? '' : 'border-b border-gray-200';

      return `
        <a href="messages.html?conversation=${encodeURIComponent(id)}"
           class="conversation-item block p-4 hover:bg-gray-50 ${borderClass} ${activeClass}"
           data-conversation="${escapeHtml(id)}">
          <div class="flex items-start space-x-3">
            <div class="relative">
              <img src="${escapeHtml(c?.avatar || '')}" alt="${escapeHtml(c?.name || '')}" class="w-10 h-10 rounded-full object-cover border-2 border-teal-100">
              <span class="absolute -bottom-1 -right-1 w-3 h-3 ${dotClass} rounded-full border-2 border-white"></span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex justify-between items-start mb-1">
                <h3 class="font-bold text-gray-900 truncate pr-2">${escapeHtml(c?.name || 'Conversation')}</h3>
                <span class="text-xs text-gray-500 whitespace-nowrap">${escapeHtml(time)}</span>
              </div>
              <p class="text-sm text-gray-600 truncate mb-1">${escapeHtml(preview)}</p>
              <div class="flex items-center">
                ${tag ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${escapeHtml(tag.color || '')} mr-2">${escapeHtml(tag.label || '')}</span>` : ''}
                ${unread ? `<span class="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">${unread}</span>` : ''}
              </div>
            </div>
          </div>
        </a>
      `;
    }).join('');

    updateUnreadUI();
  }

  // ----------------------------
  // Render: chat header + body
  // ----------------------------
  function renderHeader(c) {
    chatName.textContent = c?.name || 'Messages';
    chatMeta.textContent = c?.meta || '';

    const online = !!c?.online;
    chatStatus.textContent = online ? 'Online now' : 'Offline';
    chatStatus.classList.toggle('text-green-600', online);
    chatStatus.classList.toggle('text-gray-500', !online);

    chatAvatar.src = c?.avatar || '';
    chatAvatar.alt = c?.name || 'Avatar';

    if (chatOnlineDot) {
      chatOnlineDot.classList.toggle('bg-green-500', online);
      chatOnlineDot.classList.toggle('bg-gray-400', !online);
    }
  }

  function formatMessageTime(ts) {
    const d = new Date(ts || Date.now());
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  function formatDateSeparator(ts) {
    const d = new Date(ts || Date.now());
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function shouldShowDateSeparator(currentMsg, previousMsg) {
    if (!previousMsg) return true;
    const current = new Date(currentMsg.ts || Date.now());
    const previous = new Date(previousMsg.ts || Date.now());
    return current.toDateString() !== previous.toDateString();
  }

  function shouldGroupWithPrevious(currentMsg, previousMsg) {
    if (!previousMsg) return false;
    if (currentMsg.from !== previousMsg.from) return false;
    const timeDiff = (currentMsg.ts || 0) - (previousMsg.ts || 0);
    return timeDiff < 60000; // Group if within 1 minute
  }

  function getStatusIcon(status) {
    if (!status || status === 'sent') return '✓';
    if (status === 'delivered') return '✓✓';
    if (status === 'read') return '<span style="color: #0d9488">✓✓</span>';
    return '';
  }

  function renderMessages(c) {
    chat.innerHTML = '';

    const msgs = c?.messages || [];
    msgs.forEach((m, idx) => {
      const previousMsg = idx > 0 ? msgs[idx - 1] : null;
      const nextMsg = idx < msgs.length - 1 ? msgs[idx + 1] : null;
      
      // Add date separator if needed
      if (shouldShowDateSeparator(m, previousMsg)) {
        const separator = document.createElement('div');
        separator.className = 'flex justify-center my-4';
        separator.innerHTML = `
          <div class="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full">
            ${formatDateSeparator(m.ts)}
          </div>
        `;
        chat.appendChild(separator);
      }

      const isGrouped = shouldGroupWithPrevious(m, previousMsg);
      const isLastInGroup = !nextMsg || !shouldGroupWithPrevious(nextMsg, m); // Check if next msg exists first
      const wrap = document.createElement('div');
      wrap.className = m.from === 'me' 
        ? `flex justify-end ${isGrouped ? 'mb-1' : 'mb-4'}` 
        : `flex justify-start ${isGrouped ? 'mb-1' : 'mb-4'}`;

      const messageTime = formatMessageTime(m.ts);
      const statusIcon = m.from === 'me' ? getStatusIcon(m.status) : '';
      const timeHtml = `<div class="text-xs text-gray-500 mt-1 ${m.from === 'me' ? 'text-right' : 'text-left'}">${messageTime} ${statusIcon}</div>`;
      
      // Attachment rendering
      let attachmentHtml = '';
      if (m.attachment) {
        if (m.attachment.type === 'image') {
          attachmentHtml = `
            <img src="${m.attachment.data}" alt="${escapeHtml(m.attachment.name)}" 
                 class="max-w-xs rounded-lg cursor-pointer hover:opacity-90 cursor-zoom-in" 
                 onclick="window.openLightbox('${m.attachment.data}')" />
          `;
        } else {
          const fileSize = (m.attachment.size / 1024).toFixed(1) + ' KB';
          attachmentHtml = `
            <div class="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 max-w-xs">
              <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
              </svg>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-900 truncate">${escapeHtml(m.attachment.name)}</div>
                <div class="text-xs text-gray-500">${fileSize}</div>
              </div>
              <a href="${m.attachment.data}" download="${escapeHtml(m.attachment.name)}" class="text-teal-600 hover:text-teal-700">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                </svg>
              </a>
            </div>
          `;
        }
      }

      // Voice message rendering (v0.075 - Enhanced Playback)
      let voiceHtml = '';
      if (m.type === 'voice' && m.voiceData) {
        const durationDisplay = window.formatVoiceDuration ? window.formatVoiceDuration(m.duration) : '0:00';
        
        voiceHtml = `
          <div class="voice-message-content flex items-center gap-3 w-full min-w-[240px]">
              <button id="voice-play-btn-${m.ts}" onclick="window.playVoiceMessage('${m.ts}')" 
                      class="voice-play-button">
                <svg id="voice-icon-${m.ts}" class="w-5 h-5 fill-current" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
                </svg>
              </button>
              
              <div class="flex-1">
                <input type="range" id="voice-seek-${m.ts}" min="0" max="100" value="0" step="0.1"
                  class="voice-scrubber mb-1"
                  oninput="window.seekVoiceMessage('${m.ts}', this.value)"
                  onclick="event.stopPropagation()"
                >
                <div class="flex justify-between text-[10px] opacity-90 font-mono">
                  <span id="voice-curr-${m.ts}">0:00</span>
                  <span>${durationDisplay}</span>
                </div>
              </div>

              <button id="voice-speed-${m.ts}" onclick="window.toggleVoiceSpeed('${m.ts}')" class="voice-speed-btn">
                1x
              </button>
              
              <audio id="voice-audio-${m.ts}" src="${m.voiceData}" preload="metadata" 
                   ontimeupdate="window.handleVoiceTimeUpdate('${m.ts}')" 
                   onended="window.handleVoiceEnded('${m.ts}')"></audio>
          </div>
        `;
      }

      // Link preview rendering
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const messageText = safeText(m.text);
      const urls = messageText.match(urlRegex);
      let linkPreviewHtml = '';
      
      if (urls && urls.length > 0 && !m.attachment) {
        const url = urls[0]; // Preview first URL only
        const domain = new URL(url).hostname.replace('www.', '');
        linkPreviewHtml = `
          <div class="mt-2 border border-gray-200 rounded-lg overflow-hidden max-w-sm">
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="block hover:bg-gray-50 transition">
              <div class="p-3">
                <div class="flex items-start gap-2">
                  <svg class="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
                  </svg>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 truncate">${escapeHtml(domain)}</div>
                    <div class="text-xs text-gray-500 truncate">${escapeHtml(url)}</div>
                  </div>
                  <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                  </svg>
                </div>
              </div>
            </a>
          </div>
        `;
      }
      
      
      // v0.100: Photo Set Rendering
      if (m.type === 'photoSet' && Array.isArray(m.photos)) {
        const photosHtml = m.photos.map((p, idx) => {
            // Determine grid size classes based on count
            const isSingle = m.photos.length === 1;
            const sizeClass = isSingle ? 'h-48 w-full' : 'h-24 w-full';
            
            return `
              <div class="relative overflow-hidden rounded-lg bg-gray-100 cursor-pointer group border border-gray-200" onclick="window.openLightbox('${escapeHtml(p.src)}')">
                <img src="${escapeHtml(p.src)}" class="${sizeClass} object-cover group-hover:scale-105 transition-transform duration-500" />
                ${p.label ? `<span class="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded border border-white/20 uppercase tracking-wide">${escapeHtml(p.label)}</span>` : ''}
              </div>
            `;
        }).join('');
        
        const gridClass = m.photos.length === 1 ? 'grid-cols-1' : (m.photos.length === 2 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3');

        wrap.innerHTML = m.from === 'me'
        ? `
          <div class="flex flex-col items-end max-w-lg">
            <div class="relative group">
              <div class="bg-teal-600 p-3 rounded-xl text-white">
                <div class="flex items-center gap-2 mb-2 border-b border-teal-500/50 pb-2">
                    <i data-feather="layers" class="w-4 h-4 text-teal-200"></i>
                    <span class="font-bold text-sm">${escapeHtml(m.caption || 'Photo Set')}</span>
                </div>
                <div class="grid ${gridClass} gap-2 mb-1">
                    ${photosHtml}
                </div>
              </div>
              ${timeHtml}
            </div>
          </div>
        `
        : `
          <div class="flex flex-col items-start max-w-lg">
             <div class="relative group">
              <div class="bg-white border border-gray-200 p-3 rounded-xl">
                <div class="flex items-center gap-2 mb-2 border-b border-gray-100 pb-2">
                    <i data-feather="layers" class="w-4 h-4 text-teal-600"></i>
                    <span class="font-bold text-sm text-gray-800">${escapeHtml(m.caption || 'Photo Set')}</span>
                </div>
                <div class="grid ${gridClass} gap-2 mb-1">
                    ${photosHtml}
                </div>
              </div>
              ${timeHtml}
            </div>
          </div>
        `;
        chat.appendChild(wrap);
        // Ensure feather icons render inside the specific message
        if (typeof feather !== 'undefined') setTimeout(() => feather.replace(), 0);
        return; // Skip default rendering
      }
      
      // Convert URLs in text to clickable links

      let displayText = escapeHtml(messageText);
      if (urls) {
        urls.forEach(url => {
          displayText = displayText.replace(
            escapeHtml(url),
            `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="underline hover:text-teal-300">${escapeHtml(url)}</a>`
          );
        });
      }
      
      // Reactions
      const reactionsHtml = m.reactions && Object.keys(m.reactions).length > 0
        ? `<div class="flex gap-1 mt-1 flex-wrap">${Object.entries(m.reactions).map(([emoji, count]) => 
            `<span class="bg-gray-100 border border-gray-300 rounded-full px-2 py-0.5 text-xs cursor-pointer hover:bg-gray-200" onclick="window.toggleReaction('${m.ts}', '${emoji}')">${emoji} ${count > 1 ? count : ''}</span>`
          ).join('')}</div>`
        : '';
      
      const messageId = `msg-${m.ts}`;
      const editedLabel = m.editedAt ? ' <span class="text-xs opacity-70">(edited)</span>' : '';
      const isDeleted = m.deleted;
      
      // v0.040: Reply context HTML
      const replyHtml = m.replyTo ? `
        <div class="bg-white/20 border-l-2 border-white/40 pl-2 py-1 mb-2 text-xs cursor-pointer hover:bg-white/30 transition rounded" onclick="window.scrollToMessage('${m.replyTo.ts}')">
          <div class="font-semibold opacity-90">${escapeHtml(m.replyTo.from)}</div>
          <div class="opacity-75 truncate">${escapeHtml(m.replyTo.text.substring(0, 50))}${m.replyTo.text.length > 50 ? '...' : ''}</div>
        </div>
      ` : '';
      
      wrap.innerHTML = m.from === 'me'
        ? `
          <div class="flex flex-col items-end max-w-lg">
            <div class="relative group" id="${messageId}">
              ${!isDeleted ? `
                <div class="bg-teal-600 text-white p-3 rounded-xl">
                  ${replyHtml}
                  ${voiceHtml ? voiceHtml : ''}
                  ${attachmentHtml ? attachmentHtml : ''}
                  ${(attachmentHtml || voiceHtml) && m.text && !m.text.match(/^(📷|📎)/) ? `<div class="mt-2">${displayText}</div>` : ''}
                  ${!attachmentHtml && !voiceHtml ? displayText : ''}
                </div>
                ${linkPreviewHtml}
                <button class="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-300 rounded-full p-1 text-gray-600 hover:bg-gray-50" onclick="window.showReactionPicker('${m.ts}', event)" title="Add reaction">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </button>
                <div class="absolute -left-16 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button class="bg-white border border-gray-300 rounded-full p-1 text-gray-600 hover:bg-gray-50" onclick="window.toggleMessageMenu('${m.ts}')" title="More options">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                  </button>
                  <div id="menu-${m.ts}" class="hidden absolute left-0 bottom-8 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-32 z-50">
                    <button class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-gray-700" onclick="window.startReply('${m.ts}')">
                      Reply
                    </button>
                    <button class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-gray-700" onclick="window.togglePin('${m.ts}')">
                      ${isPinned(c?.id, m.ts) ? 'Unpin' : 'Pin'}
                    </button>
                    <button class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-gray-700" onclick="window.startEditMessage('${m.ts}')">Edit</button>
                    <button class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-red-600" onclick="window.deleteMessage('${m.ts}')">Delete</button>
                  </div>
                </div>
              ` : `
                <div class="bg-gray-100 text-gray-500 p-3 rounded-xl italic text-sm">
                  This message was deleted
                </div>
              `}
            </div>
            ${reactionsHtml}
            ${isLastInGroup ? timeHtml + editedLabel : ''}
          </div>
        `
        : `
          <div class="flex flex-col items-start max-w-lg">
            <div class="relative group" id="${messageId}">
              <div class="bg-white border border-gray-200 p-3 rounded-xl">
                ${m.replyTo ? `
                  <div class="bg-gray-100 border-l-2 border-gray-400 pl-2 py-1 mb-2 text-xs cursor-pointer hover:bg-gray-200 transition rounded" onclick="window.scrollToMessage('${m.replyTo.ts}')">
                    <div class="font-semibold text-gray-700">${escapeHtml(m.replyTo.from)}</div>
                    <div class="text-gray-600 truncate">${escapeHtml(m.replyTo.text.substring(0, 50))}${m.replyTo.text.length > 50 ? '...' : ''}</div>
                  </div>
                ` : ''}
                ${voiceHtml ? voiceHtml : ''}
                ${attachmentHtml ? attachmentHtml : ''}
                ${(attachmentHtml || voiceHtml) && m.text && !m.text.match(/^(📷|📎)/) ? `<div class="mt-2">${displayText}</div>` : ''}
                ${!attachmentHtml && !voiceHtml ? displayText : ''}
              </div>
              ${linkPreviewHtml}
              <button class="absolute -right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-300 rounded-full p-1 text-gray-600 hover:bg-gray-50" onclick="window.showReactionPicker('${m.ts}', event)" title="Add reaction">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </button>
            </div>
            ${reactionsHtml}
            ${isLastInGroup ? timeHtml : ''}
          </div>
        `;

      chat.appendChild(wrap);
    });

    // Scroll to bottom - using requestAnimationFrame to ensure DOM is laid out
    const scrollToBottom = () => {
      if (!chat) return;
      requestAnimationFrame(() => {
        chat.scrollTop = chat.scrollHeight;
      });
    };
    
    // Multiple scroll attempts to handle async image loading
    scrollToBottom();
    setTimeout(scrollToBottom, 50);
    setTimeout(scrollToBottom, 150);
    setTimeout(scrollToBottom, 300);
    
    // Final scroll after all images have loaded
    const images = chat.querySelectorAll('img');
    if (images.length > 0) {
      Promise.all(Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.addEventListener('load', resolve);
          img.addEventListener('error', resolve);
        });
      })).then(scrollToBottom);
    }
  }

  // ----------------------------
  // v0.028: Messages context panel
  // - Customer view: list customer's active jobs; clicking a job provides a Jobs Board deep-link.
  // - Tradie view: showcase tradie's recently completed jobs with completion photos + published reviews.
  // - Dual counterparty: allow toggling between the two panels.
  // ----------------------------
  function resolveCounterparty(convId) {
    const cid = String(convId || '').trim();
    if (!cid) return { customerId: null, tradieId: null };

    let tradieId = null;
    let customerId = null;

    const tradies = window.TRADIES || {};
    for (const [id, t] of Object.entries(tradies)) {
      if (t && String(t.conversationId || '') === cid) { tradieId = String(id); break; }
    }

    const customers = window.CUSTOMERS || {};
    for (const [id, c] of Object.entries(customers)) {
      if (c && String(c.conversationId || '') === cid) { customerId = String(id); break; }
    }

    return { customerId, tradieId };
  }

  function readReviewsStorage() {
    try {
      const raw = localStorage.getItem('athReviews');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function isReviewPublished(r) {
    if (!r) return false;
    if (r.visibility === 'published') return true;
    const base = Date.parse(r.completedAt || '') || 0;
    if (!base) return false;
    return (Date.now() - base) >= 7 * 24 * 60 * 60 * 1000;
  }

  function getCompletionPhotosForJob(jobId) {
    try {
      const s = window.ATHJobs?.getJobState?.(jobId) || {};
      const arr = Array.isArray(s.completionPhotos) ? s.completionPhotos : [];
      return arr.filter(v => typeof v === 'string' && v.startsWith('data:image/'));
    } catch {
      return [];
    }
  }

  function statusPillClass(st) {
    const s = String(st || 'open').trim().toLowerCase();
    if (s === 'in_progress') return 'bg-amber-100 text-amber-800';
    if (s === 'completed') return 'bg-emerald-100 text-emerald-800';
    if (s === 'agreed') return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
  }

  function renderContextPanel(convId) {
    if (!contextMount) return;

    const resolved = resolveCounterparty(convId);
    const hasCustomer = !!resolved.customerId;
    const hasTradie = !!resolved.tradieId;

    // If we can't resolve, keep the panel lightweight.
    if (!hasCustomer && !hasTradie) {
      contextMount.innerHTML = `
        <div class="text-sm text-gray-600">
          Select a conversation to see job context.
        </div>
      `;
      return;
    }

    const modeKey = `athMsgContextMode:${uid}:${String(convId)}`;
    let mode = localStorage.getItem(modeKey) || '';
    if (mode !== 'customer' && mode !== 'tradie') {
      // default
      mode = hasCustomer && !hasTradie ? 'customer' : (!hasCustomer && hasTradie ? 'tradie' : 'customer');
    }

    const jobsAll = window.ATHJobs?.getAllJobs?.() || [];
    const customers = window.CUSTOMERS || {};
    const tradies = window.TRADIES || {};

    const selectedKey = `athMsgSelectedJob:${uid}:${String(convId)}`;
    const selectedJobId = localStorage.getItem(selectedKey) || '';

    const renderToggle = (dual) => {
      if (!dual) return '';
      const btnCls = (m) => (m === mode)
        ? 'bg-teal-600 text-white border-teal-600'
        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50';
      return `
        <div class="flex items-center gap-2 mb-4">
          <button type="button" data-ctx-mode="customer" class="flex-1 text-xs font-semibold px-3 py-2 rounded-lg border ${btnCls('customer')}">
            Customer jobs
          </button>
          <button type="button" data-ctx-mode="tradie" class="flex-1 text-xs font-semibold px-3 py-2 rounded-lg border ${btnCls('tradie')}">
            Tradie showcase
          </button>
        </div>
      `;
    };

    function renderCustomerPanel() {
      const cid = String(resolved.customerId);
      const c = customers?.[cid];
      const activeStates = new Set(['open', 'agreed', 'in_progress']);
      const jobs = jobsAll
        .filter(j => String(j?.customerId || '') === cid && activeStates.has(String(j?.status || 'open').toLowerCase()))
        .sort((a, b) => Date.parse(b?.postedAt || b?.createdAt || '') - Date.parse(a?.postedAt || a?.createdAt || ''));

      const pick = (jobs.find(j => String(j.id) === String(selectedJobId)) || jobs[0] || null);
      const chips = (job) => {
        const ids = Array.isArray(job?.categories) ? job.categories : (typeof window.normalizeTradeIds === 'function' ? window.normalizeTradeIds(job?.categories) : []);
        return (ids || []).slice(0, 4).map((cid2) => (
          `<span class="inline-flex items-center px-2 py-1 rounded-full bg-teal-50 text-teal-700 text-[11px] font-semibold">${escapeHtml(typeof window.tradeLabel === 'function' ? window.tradeLabel(cid2) : String(cid2))}</span>`
        )).join('');
      };

      const jobList = jobs.length ? `
        <div class="space-y-2">
          ${jobs.map((j) => {
        const active = String(j.id) === String(pick?.id);
        return `
              <button type="button" data-ctx-job="${escapeHtml(String(j.id))}"
                class="w-full text-left border rounded-xl px-3 py-2 hover:bg-gray-50 transition ${active ? 'border-teal-300 bg-teal-50' : 'border-gray-200 bg-white'}">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="text-sm font-bold text-gray-900 truncate">${escapeHtml(j.title || 'Job')}</div>
                    <div class="text-xs text-gray-600 truncate">${escapeHtml(j.location || '—')}</div>
                  </div>
                  <span class="text-[11px] font-semibold px-2 py-1 rounded-full ${statusPillClass(j.status)}">${escapeHtml(String(j.status || 'open').replace('_', ' '))}</span>
                </div>
              </button>
            `;
      }).join('')}
        </div>
      ` : `<div class="text-sm text-gray-500">No active jobs yet.</div>`;

      const details = pick ? `
        <div class="mt-4 border-t pt-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="text-sm font-bold text-gray-900">${escapeHtml(pick.title || 'Job')}</div>
              <div class="text-xs text-gray-600">${escapeHtml(pick.location || '—')}</div>
            </div>
            <span class="text-[11px] font-semibold px-2 py-1 rounded-full ${statusPillClass(pick.status)}">${escapeHtml(String(pick.status || 'open').replace('_', ' '))}</span>
          </div>
          <div class="mt-2 flex flex-wrap gap-2">${chips(pick)}</div>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <div class="text-[11px] text-gray-500">Budget</div>
              <div class="text-sm font-semibold text-gray-900">${escapeHtml(String(pick.budgetMax || pick.budgetMin || 0) ? (typeof window.compactMoney === 'function' ? window.compactMoney(Number(pick.budgetMax || pick.budgetMin || 0)) : '$' + String(pick.budgetMax || pick.budgetMin || 0)) : '—')}</div>
            </div>
            <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <div class="text-[11px] text-gray-500">Timeline</div>
              <div class="text-sm font-semibold text-gray-900">${escapeHtml(String(pick.timeline || 'Flexible'))}</div>
            </div>
          </div>

          <div class="mt-3 flex flex-col gap-2">
            <a href="jobs.html?job=${encodeURIComponent(String(pick.id))}" class="w-full text-center bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold py-2 px-3 rounded-xl hover:opacity-90 transition text-sm">
              Open on Job Board
            </a>
            ${c ? `<a href="profile-customer.html?id=${encodeURIComponent(String(cid))}" class="w-full text-center bg-white border border-gray-300 text-gray-700 font-semibold py-2 px-3 rounded-xl hover:bg-gray-50 transition text-sm">View customer profile</a>` : ''}
          </div>
        </div>
      ` : '';

      return `
        <div>
          <div class="text-xs text-gray-500 mb-2">Active jobs from this customer</div>
          ${jobList}
          ${details}
        </div>
      `;
    }

    function renderTradiePanel() {
      const tid = String(resolved.tradieId);
      const t = tradies?.[tid];
      const jobs = jobsAll
        .filter(j => String(j?.assignedTradieId || '') === tid && String(j?.status || '').toLowerCase() === 'completed')
        .sort((a, b) => {
          const sa = window.ATHJobs?.getJobState?.(a.id) || {};
          const sb = window.ATHJobs?.getJobState?.(b.id) || {};
          return Date.parse(sb.completedAt || b.completedAt || '') - Date.parse(sa.completedAt || a.completedAt || '');
        })
        .slice(0, 6);

      const allReviews = readReviewsStorage().filter(r => String(r?.targetRole) === 'tradie' && String(r?.targetId) === tid && isReviewPublished(r));

      const jobCards = jobs.length ? jobs.map((j) => {
        const st = window.ATHJobs?.getJobState?.(j.id) || {};
        const photos = getCompletionPhotosForJob(j.id).slice(0, 3);
        const reviewsForJob = allReviews.filter(r => String(r?.jobId) === String(j.id)).slice(0, 2);
        const photoGrid = photos.length ? `
          <div class="mt-2 grid grid-cols-3 gap-2">
            ${photos.map((src, idx) => `
              <img src="${escapeHtml(src)}" alt="Completion photo ${idx + 1}" class="w-full h-16 object-cover rounded-lg border border-gray-200" />
            `).join('')}
          </div>
        ` : `<div class="mt-2 text-xs text-gray-500">No completion photos uploaded.</div>`;

        const reviewsBlock = reviewsForJob.length ? `
          <div class="mt-3 space-y-2">
            ${reviewsForJob.map((r) => `
              <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <div class="text-xs text-gray-600"><span class="font-semibold">${escapeHtml(String(r.stars || ''))}\u2605</span> \u2022 ${escapeHtml(new Date(Number(r.ts) || Date.now()).toLocaleDateString())}</div>
                <div class="mt-1 text-sm text-gray-800">${escapeHtml(String(r.text || ''))}</div>
              </div>
            `).join('')}
          </div>
        ` : `<div class="mt-3 text-xs text-gray-500">No published reviews for this job yet.</div>`;

        return `
          <div class="border border-gray-200 rounded-xl p-4 bg-white">
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="text-sm font-bold text-gray-900">${escapeHtml(j.title || 'Job')}</div>
                <div class="text-xs text-gray-600">Completed: ${escapeHtml(st.completedAt ? new Date(st.completedAt).toLocaleDateString() : (j.completedAt ? new Date(j.completedAt).toLocaleDateString() : '—'))}</div>
              </div>
              <span class="text-[11px] font-semibold px-2 py-1 rounded-full ${statusPillClass('completed')}">completed</span>
            </div>
            ${photoGrid}
            ${reviewsBlock}
          </div>
        `;
      }).join('') : `<div class="text-sm text-gray-500">No completed jobs to showcase yet.</div>`;

      return `
        <div>
          <div class="text-xs text-gray-500 mb-2">Recently completed jobs from this tradie</div>
          <div class="space-y-3">${jobCards}</div>
          ${t ? `<div class="mt-4"><a href="profile-tradesman.html?id=${encodeURIComponent(String(tid))}" class="w-full block text-center bg-white border border-gray-300 text-gray-700 font-semibold py-2 px-3 rounded-xl hover:bg-gray-50 transition text-sm">View tradie profile</a></div>` : ''}
        </div>
      `;
    }

    const dual = hasCustomer && hasTradie;
    contextMount.innerHTML = `${renderToggle(dual)}${mode === 'tradie' ? renderTradiePanel() : renderCustomerPanel()}`;

    // Wire toggle (dual)
    contextMount.querySelectorAll('[data-ctx-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = String(btn.getAttribute('data-ctx-mode') || 'customer');
        if (next !== 'customer' && next !== 'tradie') return;
        localStorage.setItem(modeKey, next);
        renderContextPanel(convId);
      });
    });

    // Wire job select (customer panel)
    contextMount.querySelectorAll('[data-ctx-job]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const jid = String(btn.getAttribute('data-ctx-job') || '');
        if (!jid) return;
        localStorage.setItem(selectedKey, jid);
        renderContextPanel(convId);
      });
    });

    try { if (typeof feather !== 'undefined') feather.replace(); } catch { }
  }

  // ----------------------------
  // Routing + defaults
  // ----------------------------
  function getConversationIdFromUrl() {
    return new URLSearchParams(location.search).get('conversation');
  }

  function setConversationIdInUrl(id) {
    const url = new URL(location.href);
    url.searchParams.set('conversation', id);
    history.replaceState({}, '', url.toString());
  }

  function getDefaultConversationId() {
    const lastActive = localStorage.getItem(lastActiveKey);
    if (lastActive && DATA[lastActive]) return lastActive;

    const ids = Object.keys(DATA);
    if (!ids.length) return null;
    return ids.sort((a, b) => getLastTs(b) - getLastTs(a))[0];
  }

  // v0.027b: When we arrive via a "Contact" link (messages.html?conversation=<id>),
  // the per-account conversation store may not have that conversation yet.
  // Create an empty conversation stub for this account so the dialog opens.
  function resolveCounterpartyByConversationId(convId) {
    const cid = String(convId || '').trim();
    if (!cid) return null;

    const tradies = window.TRADIES || {};
    for (const t of Object.values(tradies)) {
      if (t && String(t.conversationId || '') === cid) {
        const meta = [t.trade, t.location].filter(Boolean).join(' \u2022 ');
        return {
          name: t.name || 'Tradie',
          avatar: t.image || '',
          meta,
          tag: { label: 'Tradie', color: 'bg-teal-100 text-teal-700' },
          online: false
        };
      }
    }

    const customers = window.CUSTOMERS || {};
    for (const c of Object.values(customers)) {
      if (c && String(c.conversationId || '') === cid) {
        const meta = [c.location].filter(Boolean).join('');
        return {
          name: c.name || 'Customer',
          avatar: c.image || '',
          meta,
          tag: { label: 'Customer', color: 'bg-gray-100 text-gray-700' },
          online: false
        };
      }
    }

    return null;
  }

  function ensureConversationExists(convId) {
    const id = String(convId || '').trim();
    if (!id || DATA[id]) return;

    // Optional URL-provided context (future-proofing)
    const params = new URLSearchParams(location.search);
    const nameFromUrl = params.get('name');
    const avatarFromUrl = params.get('avatar');
    const metaFromUrl = params.get('meta');

    const resolved = resolveCounterpartyByConversationId(id) || {};

    DATA[id] = {
      id,
      name: nameFromUrl ? decodeURIComponent(nameFromUrl) : (resolved.name || 'Conversation'),
      avatar: avatarFromUrl ? decodeURIComponent(avatarFromUrl) : (resolved.avatar || ''),
      meta: metaFromUrl ? decodeURIComponent(metaFromUrl) : (resolved.meta || ''),
      online: !!resolved.online,
      tag: resolved.tag || null,
      messages: []
    };

    window.ATHStore.set(STORE_KEY, DATA);
  }

  function load(id) {
    // If the URL specifies a conversation that doesn't exist in this account yet,
    // create an empty stub so "Contact" deep-links open the right thread.
    if (id && !DATA[id]) ensureConversationExists(id);

    const actualId = DATA[id] ? id : getDefaultConversationId();
    if (!actualId) {
      // No conversations at all
      renderConversationList(searchInput?.value || '');
      if (input) {
        input.disabled = true;
        input.classList.add('opacity-50', 'cursor-not-allowed');
      }
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.classList.add('opacity-50', 'cursor-not-allowed');
      }
      if (unreadLabel) unreadLabel.textContent = 'All read';
      showEmpty('No conversations yet', 'Start a conversation from a job listing.');
      updateUnreadUI();
      return;
    }

    showChat();

    if (input) {
      input.disabled = false;
      input.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    const c = DATA[actualId];

    // Mark read + persist active
    markRead(actualId);
    localStorage.setItem(lastActiveKey, actualId);

    // Render
    setConversationIdInUrl(actualId);
    renderConversationList(searchInput?.value || '');
    setActiveRow(actualId);
    renderHeader(c);
    renderMessages(c);
    updateUnreadUI();

    // v0.028: render right-side context panel for this conversation
    renderContextPanel(actualId);
    
    // v0.035: Restore draft for this conversation
    if (input) {
      const draft = loadDraft(actualId);
      input.value = draft;
      // Focus input if there's a draft
      if (draft) {
        setTimeout(() => input.focus(), 150);
      }
    }
    
    // Force scroll to bottom after everything is rendered
    setTimeout(() => {
      if (chat) {
        chat.scrollTop = chat.scrollHeight;
      }
    }, 100);
    setTimeout(() => {
      if (chat) {
        chat.scrollTop = chat.scrollHeight;
      }
    }, 300);
    setTimeout(() => {
      if (chat) {
        chat.scrollTop = chat.scrollHeight;
      }
    }, 600);
  }

  // ----------------------------
  // Events
  // ----------------------------
  // Click conversation (delegated)
  list.addEventListener('click', (e) => {
    const row = e.target.closest('.conversation-item');
    if (!row) return;
    e.preventDefault();

    const id = row.dataset.conversation;
    if (!id) return;

    load(id);
  });

  // Search conversations
  searchInput?.addEventListener('input', () => {
    renderConversationList(searchInput.value);
  });

  // ----------------------------
  // v0.035: Message Drafts
  // ----------------------------
  let draftSaveTimeout = null;
  const DRAFT_DEBOUNCE_MS = 500;

  // ----------------------------
  // v0.040: Reply to Messages
  // ----------------------------
  let currentReply = null; // {ts, text, from}

  function getDraftKey(convId) {
    return `athDraft:${uid}:${convId}`;
  }

  function saveDraft(convId, text) {
    const key = getDraftKey(convId);
    if (text.trim()) {
      localStorage.setItem(key, text);
    } else {
      localStorage.removeItem(key);
    }
  }

  function loadDraft(convId) {
    const key = getDraftKey(convId);
    return localStorage.getItem(key) || '';
  }

  function clearDraft(convId) {
    const key = getDraftKey(convId);
    localStorage.removeItem(key);
  }

  // v0.040: Reply functions
  window.startReply = function(ts) {
    const id = getConversationIdFromUrl() || getDefaultConversationId();
    if (!id || !DATA[id]) return;
    
    const message = DATA[id].messages.find(m => m.ts === Number(ts));
    if (!message || message.deleted) return;
    
    // Close menu
    const menu = document.getElementById(`menu-${ts}`);
    if (menu) menu.classList.add('hidden');
    
    // Set reply state
    currentReply = {
      ts: message.ts,
      text: message.text,
      from: message.from === 'me' ? 'You' : (DATA[id].name || 'Them')
    };
    
    // Show reply preview
    const preview = document.getElementById('replyPreview');
    const previewName = document.getElementById('replyPreviewName');
    const previewText = document.getElementById('replyPreviewText');
    
    if (preview && previewName && previewText) {
      preview.classList.remove('hidden');
      previewName.textContent = currentReply.from;
      previewText.textContent = currentReply.text.substring(0, 50) + (currentReply.text.length > 50 ? '...' : '');
    }
    
    // Focus input
    if (input) input.focus();
  };

  window.cancelReply = function() {
    currentReply = null;
    const preview = document.getElementById('replyPreview');
    if (preview) preview.classList.add('hidden');
  };

  // v0.040: Scroll to original message
  window.scrollToMessage = function(ts) {
    const messageEl = document.getElementById(`msg-${ts}`);
    if (messageEl && chat) {
      messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight briefly
      messageEl.classList.add('ring-2', 'ring-teal-500');
      setTimeout(() => {
        messageEl.classList.remove('ring-2', 'ring-teal-500');
      }, 2000);
    }
  };

  // ----------------------------
  // v0.045: Message Pinning
  // ----------------------------
  function isPinned(convId, messageTs) {
    if (!DATA[convId]) return false;
    const pinnedArray = DATA[convId].pinnedMessages || [];
    return pinnedArray.includes(Number(messageTs));
  }

  window.togglePin = function(ts) {
    const id = getConversationIdFromUrl() || getDefaultConversationId();
    if (!id || !DATA[id]) return;
    
    const message = DATA[id].messages.find(m => m.ts === Number(ts));
    if (!message || message.deleted) return;
    
    // Close menu
    const menu = document.getElementById(`menu-${ts}`);
    if (menu) menu.classList.add('hidden');
    
    // Initialize pinnedMessages array if it doesn't exist
    if (!DATA[id].pinnedMessages) {
      DATA[id].pinnedMessages = [];
    }
    
    const pinned = isPinned(id, ts);
    
    if (pinned) {
      // Unpin
      DATA[id].pinnedMessages = DATA[id].pinnedMessages.filter(t => t !== Number(ts));
    } else {
      // Check max limit
      if (DATA[id].pinnedMessages.length >= 5) {
        alert('Maximum 5 pinned messages. Please unpin one first.');
        return;
      }
      // Pin - add to beginning (most recent first)
      DATA[id].pinnedMessages.unshift(Number(ts));
    }
    
    // Save and re-render
    window.ATHStore.set(STORE_KEY, DATA);
    renderPinnedMessages(DATA[id]);
    renderMessages(DATA[id]); // Re-render to update pin buttons
  };

  function renderPinnedMessages(conversation) {
    const pinnedSection = document.getElementById('pinnedMessagesSection');
    const pinnedList = document.getElementById('pinnedMessagesList');
    
    if (!pinnedSection || !pinnedList || !conversation) return;
    
    const pinnedMsgIds = conversation.pinnedMessages || [];
    
    if (pinnedMsgIds.length === 0) {
      pinnedSection.classList.add('hidden');
      return;
    }
    
    // Show section
    pinnedSection.classList.remove('hidden');
    
    // Get pinned messages (max 5, most recent first)
    const pinnedMessages = pinnedMsgIds
      .slice(0, 5)
      .map(ts => conversation.messages.find(m => m.ts === ts))
      .filter(Boolean);
    
    // Render pinned message cards
    pinnedList.innerHTML = pinnedMessages.map(m => {
      const preview = escapeHtml(m.text.substring(0, 100));
      const hasMore = m.text.length > 100 ? '...' : '';
      const fromLabel = m.from === 'me' ? 'You' : conversation.name;
      
      return `
        <div class="bg-white border border-amber-200 rounded-lg p-2 flex items-start gap-2 hover:bg-amber-50 transition cursor-pointer" onclick="window.scrollToMessage('${m.ts}')">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-semibold text-gray-700">${escapeHtml(fromLabel)}</div>
            <div class="text-xs text-gray-600 truncate">${preview}${hasMore}</div>
          </div>
          <button onclick="event.stopPropagation(); window.togglePin('${m.ts}');" class="flex-shrink-0 p-1 hover:bg-amber-100 rounded text-amber-700" title="Unpin">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6 2l7 7V6l7 7-2 2-7-7 3-3-7-7 2-2z"></path>
            </svg>
          </button>
        </div>
      `;
    }).join('');
  }

  // ----------------------------
  // Send message
  // ----------------------------
  function send() {
    const id = getConversationIdFromUrl() || getDefaultConversationId();
    if (!id || !DATA[id]) return;

    const text = (input?.value || '').trim();
    if (!text) return;

    const now = Date.now();
    // Block off-platform contact sharing until payment
    const scan = window.ATHIntegrity?.scanText ? window.ATHIntegrity.scanText(text) : { hasContact: false };
    if (scan?.hasContact) {
      window.ATHIntegrity?.setInlineNotice(document.getElementById('athMessageSanitizeNote'),
        'Contact details (phone, email, or links) are locked until payment is confirmed. Please remove them.');
      setTimeout(() => window.ATHIntegrity?.setInlineNotice(document.getElementById('athMessageSanitizeNote'), ''), 3000);
      return;
    }

    const sanitized = window.ATHIntegrity ? window.ATHIntegrity.sanitizeText(text) : { text, changed: false };
    const newMessage = { 
      from: 'me', 
      time: 'Now', 
      ts: now, 
      text: sanitized.text,
      status: 'sent' // New: track message status
    };
    
    // v0.040: Add reply data if replying
    if (currentReply) {
      newMessage.replyTo = {
        ts: currentReply.ts,
        text: currentReply.text,
        from: currentReply.from
      };
    }
    
    DATA[id].messages.push(newMessage);
    window.ATHStore.set(STORE_KEY, DATA);
    input.value = '';
    
    // v0.035: Clear draft after successful send
    clearDraft(id);
    
    // v0.040: Clear reply after successful send
    if (currentReply) {
      window.cancelReply();
    }

    // Re-render chat + sidebar preview/time
    renderMessages(DATA[id]);
    renderConversationList(searchInput?.value || '');
    setActiveRow(id);

    // Simulate message status updates (delivered -> read)
    setTimeout(() => {
      newMessage.status = 'delivered';
      window.ATHStore.set(STORE_KEY, DATA);
      renderMessages(DATA[id]);
      
      setTimeout(() => {
        newMessage.status = 'read';
        window.ATHStore.set(STORE_KEY, DATA);
        renderMessages(DATA[id]);
      }, 1500);
    }, 500);
  }

  function showTypingIndicator(name) {
    const indicator = document.getElementById('typingIndicator');
    const text = document.getElementById('typingIndicatorText');
    if (indicator && text) {
      text.textContent = `${name} is typing...`;
      indicator.classList.remove('hidden');
      chat.scrollTop = chat.scrollHeight;
    }
  }

  function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
      indicator.classList.add('hidden');
    }
  }

  sendBtn?.addEventListener('click', send);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  });
  
  // v0.035: Auto-save draft on input (with debounce)
  input?.addEventListener('input', () => {
    const id = getConversationIdFromUrl() || getDefaultConversationId();
    if (!id) return;
    
    // Clear existing timeout
    if (draftSaveTimeout) {
      clearTimeout(draftSaveTimeout);
    }
    
    // Set new timeout to save draft
    draftSaveTimeout = setTimeout(() => {
      const text = input.value;
      saveDraft(id, text);
    }, DRAFT_DEBOUNCE_MS);
  });

  // Init
  renderConversationList('');

  // Handle SPA navigation for conversation list
  list.addEventListener('click', (e) => {
    const item = e.target.closest('.conversation-item');
    if (item) {
      e.preventDefault();
      const id = item.dataset.conversation;
      if (id) {
        load(id);
        activateMobileChat(); // Switch to chat view on mobile
        // Update URL without reload
        const url = new URL(window.location);
        url.searchParams.set('conversation', id);
        window.history.pushState({}, '', url);
      }
    }
  });

  // Initial load logic
  const urlId = getConversationIdFromUrl();
  const defaultId = getDefaultConversationId();

  if (urlId) {
    load(urlId);
    activateMobileChat();
  } else {
    // Determine if we should load default
    if (defaultId) load(defaultId);
    // Explicitly start in list view if no URL param
    activateMobileList();
  }
}

// Global reaction functions
window.showReactionPicker = function(messageTs, event) {
  event?.stopPropagation();
  
  const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  
  // Remove existing picker
  const existingPicker = document.getElementById('reactionPicker');
  if (existingPicker) existingPicker.remove();
  
  const picker = document.createElement('div');
  picker.id = 'reactionPicker';
  picker.className = 'absolute z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-2 flex gap-2';
  picker.style.left = event?.clientX + 'px';
  picker.style.top = (event?.clientY - 50) + 'px';
  
  quickReactions.forEach(emoji => {
    const btn = document.createElement('button');
    btn.textContent = emoji;
    btn.className = 'text-2xl hover:bg-gray-100 rounded p-1 transition';
    btn.onclick = () => {
      window.toggleReaction(messageTs, emoji);
      picker.remove();
    };
    picker.appendChild(btn);
  });
  
  document.body.appendChild(picker);
  
  // Close picker on click outside
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!picker.contains(e.target)) {
        picker.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 100);
};

window.toggleReaction = function(messageTs, emoji) {
  const session = window.ATHAuth?.getSession?.();
  if (!session?.userId) return;
  
  const uid = session.userId;
  const STORE_KEY = `athConversations:${uid}`;
  const DATA = window.ATHStore.get(STORE_KEY, {});
  
  const urlId = new URLSearchParams(location.search).get('conversation');
  if (!urlId || !DATA[urlId]) return;
  
  const msg = DATA[urlId].messages.find(m => m.ts == messageTs);
  if (!msg) return;
  
  // Initialize reactions object
  if (!msg.reactions) msg.reactions = {};
  
  // Toggle reaction
  if (msg.reactions[emoji]) {
    msg.reactions[emoji]++;
  } else {
    msg.reactions[emoji] = 1;
  }
  
  window.ATHStore.set(STORE_KEY, DATA);
  
  // Re-render messages by reloading the page section
  location.reload();
};

// ----------------------------
// Helpers
// ----------------------------
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


// ----------------------------
// My Profile Page
// ----------------------------
function initMyProfilePage() {
  const root = document.getElementById('mpName');
  if (!root) return; // not on my-profile

  // v0.026a: My Profile is private to signed-in users (prototype auth layer).
  if (!requireAuthOnPage({ onMissing: 'overlay' })) return;

  const els = {
    avatarImg: document.getElementById('mpAvatar'),
    name: document.getElementById('mpName'),
    subtitle: document.getElementById('mpSubtitle'),
    roleBadge: document.getElementById('mpRoleBadge'),
    verifiedBadge: document.getElementById('mpVerifiedBadge'),

    editBtn: document.getElementById('mpEditBtn'),
    saveBtn: document.getElementById('mpSaveBtn'),
    cancelBtn: document.getElementById('mpCancelBtn'),

    publicTradieLink: document.getElementById('mpPublicTradieLink'),
    publicCustomerLink: document.getElementById('mpPublicCustomerLink'),

    displayName: document.getElementById('mpDisplayName'),
    avatarPickBtn: document.getElementById('mpAvatarPickBtn'),
    avatarRemoveBtn: document.getElementById('mpAvatarRemoveBtn'),
    avatarFile: document.getElementById('mpAvatarFile'),
    suburb: document.getElementById('mpSuburb'),
    state: document.getElementById('mpState'),
    postcode: document.getElementById('mpPostcode'),
    phone: document.getElementById('mpPhone'),
    email: document.getElementById('mpEmail'),

    // Batch L: Tradie multi-trade picker
    tradesSection: document.getElementById('mpTradesSection'),
    tradesHidden: document.getElementById('mpTradesHidden'),
    tradesToggle: document.getElementById('mpTradesToggle'),
    tradesPanel: document.getElementById('mpTradesPanel'),
    tradesSearch: document.getElementById('mpTradesSearch'),
    tradesOptions: document.getElementById('mpTradesOptions'),
    tradesSelected: document.getElementById('mpTradesSelected'),
    tradesCount: document.getElementById('mpTradesCount'),

    showLocation: document.getElementById('mpShowLocation'),
    addressRule: document.getElementById('mpAddressRule'),

    abn: document.getElementById('mpAbn'),
    abnMasked: document.getElementById('mpAbnMasked'),
    license: document.getElementById('mpLicense'),

    toast: document.getElementById('mpToast'),
    roleButtons: Array.from(document.querySelectorAll('.mpRoleBtn'))
  };

  let user = getCurrentUser();
  let snapshot = JSON.parse(JSON.stringify(user));
  let editing = false;

  const showToast = (msg, ok = true) => {
    if (!els.toast) return;
    els.toast.classList.remove('hidden');
    els.toast.className = ok
      ? 'mt-4 text-sm px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'mt-4 text-sm px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-800';
    els.toast.textContent = msg;
    setTimeout(() => { if (els.toast) els.toast.classList.add('hidden'); }, 2200);
  };

  const setDisabled = (disabled) => {
    [
      els.displayName, els.suburb, els.state, els.postcode, els.phone, els.email,
      els.showLocation, els.addressRule, els.abn, els.license
    ].forEach((el) => { if (el) el.disabled = disabled; });

    // Trade picker controls
    if (els.tradesToggle) els.tradesToggle.disabled = disabled;
    if (els.tradesSearch) els.tradesSearch.disabled = disabled;
  };

  const renderRoleUI = () => {
    const role = (user.role || 'dual');
    if (els.roleBadge) els.roleBadge.textContent = role.toUpperCase();
    els.roleButtons.forEach((b) => {
      const active = b.dataset.role === role;
      b.classList.toggle('bg-teal-600', active);
      b.classList.toggle('text-white', active);
      b.classList.toggle('border-teal-600', active);
    });

    if (els.publicTradieLink) {
      els.publicTradieLink.classList.toggle('hidden', !(role === 'tradie' || role === 'dual'));
      els.publicTradieLink.href = 'profile-tradesman.html?id=me';
    }
    if (els.publicCustomerLink) {
      els.publicCustomerLink.classList.toggle('hidden', !(role === 'customer' || role === 'dual'));
      els.publicCustomerLink.href = 'profile-customer.html?id=me';
    }

    if (els.tradesSection) {
      els.tradesSection.classList.toggle('hidden', !(role === 'tradie' || role === 'dual'));
    }
  };

  // Batch L: Tradie multi-trade picker (canonical list from data.js)
  const tradeCatalog = Array.isArray(window.TRADE_CATEGORIES) ? window.TRADE_CATEGORIES : [];
  const tradeLabel = (id) => {
    const found = tradeCatalog.find(t => t.id === id);
    return found ? found.label : (typeof window.tradeLabel === 'function' ? window.tradeLabel(id) : String(id || 'Other'));
  };

  let selectedTrades = new Set();

  function setSelectedTrades(next) {
    selectedTrades = new Set(Array.isArray(next) ? next.map(String).filter(Boolean) : []);
    if (els.tradesHidden) els.tradesHidden.value = Array.from(selectedTrades).join(',');
    if (els.tradesCount) els.tradesCount.textContent = `${selectedTrades.size} selected`;
    if (els.tradesSelected) {
      els.tradesSelected.innerHTML = Array.from(selectedTrades).map((id) => (
        `<span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">
          ${escapeHtml(tradeLabel(id))}
          <button type="button" data-remove-trade="${escapeHtml(id)}" class="text-teal-700 hover:text-teal-900" ${editing ? '' : 'disabled'}>×</button>
        </span>`
      )).join('');
      els.tradesSelected.querySelectorAll('[data-remove-trade]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!editing) return;
          selectedTrades.delete(btn.getAttribute('data-remove-trade'));
          setSelectedTrades(Array.from(selectedTrades));
          renderTradeOptions();
        });
      });
    }
  }

  function renderTradeOptions() {
    if (!els.tradesOptions) return;
    const q = (els.tradesSearch?.value || '').toString().trim().toLowerCase();
    const rows = tradeCatalog
      .filter(t => !q || String(t.label).toLowerCase().includes(q) || String(t.id).toLowerCase().includes(q))
      .map(t => {
        const checked = selectedTrades.has(t.id) ? 'checked' : '';
        return `<label class="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" data-trade-id="${escapeHtml(t.id)}" class="rounded border-gray-300 text-teal-600 focus:ring-teal-500" ${checked} ${editing ? '' : 'disabled'} />
          <span>${escapeHtml(t.label)}</span>
        </label>`;
      });
    els.tradesOptions.innerHTML = rows.join('') || `<p class="text-sm text-gray-500">No trades found.</p>`;
    els.tradesOptions.querySelectorAll('input[data-trade-id]').forEach((box) => {
      box.addEventListener('change', () => {
        if (!editing) return;
        const id = box.getAttribute('data-trade-id');
        if (box.checked) selectedTrades.add(id);
        else selectedTrades.delete(id);
        setSelectedTrades(Array.from(selectedTrades));
      });
    });
  }

  els.tradesToggle?.addEventListener('click', () => {
    if (!editing) return;
    els.tradesPanel?.classList.toggle('hidden');
    renderTradeOptions();
  });
  els.tradesSearch?.addEventListener('input', renderTradeOptions);

  const render = () => {
    if (els.avatarImg) els.avatarImg.src = user.avatarDataUrl || user.avatar || 'https://static.photos/people/320x240/301';
    if (els.name) els.name.textContent = user.displayName || 'My Profile';

    if (els.verifiedBadge) {
      const verified = !!user.verification?.verified;
      els.verifiedBadge.classList.toggle('hidden', !verified);
    }

    if (els.displayName) els.displayName.value = user.displayName || '';
    if (els.suburb) els.suburb.value = user.location?.suburb || '';
    if (els.state) els.state.value = user.location?.state || '';
    if (els.postcode) els.postcode.value = user.location?.postcode || '';

    if (els.phone) els.phone.value = user.contact?.phone || '';
    if (els.email) els.email.value = user.contact?.email || '';

    if (els.showLocation) els.showLocation.checked = !!user.privacy?.showLocation;
    if (els.addressRule) els.addressRule.value = user.privacy?.addressRule || 'afterAccepted';

    if (els.abn) els.abn.value = user.verification?.abnFull || '';
    if (els.abnMasked) els.abnMasked.textContent = maskSensitiveKeepLast4(user.verification?.abnFull || '');
    if (els.license) els.license.value = user.verification?.licenseFull || '';

    if (!editing) {
      const fromUser = Array.isArray(user.tradie?.trades) ? user.tradie.trades : (typeof window.inferTradeIdsFromText === 'function' ? window.inferTradeIdsFromText(user.tradie?.trade) : []);
      setSelectedTrades(fromUser || []);
      renderTradeOptions();
    }

    renderRoleUI();

    if (typeof feather !== 'undefined') feather.replace();
  };

  const validate = () => {
    const name = (els.displayName?.value || '').trim();
    if (!name) return { ok: false, msg: 'Display name is required.' };

    const st = (els.state?.value || '').trim();
    const pc = (els.postcode?.value || '').trim();
    if (pc && !/^\d{4}$/.test(pc)) return { ok: false, msg: 'Postcode must be 4 digits.' };
    if (st && st.length > 3) return { ok: false, msg: 'State looks invalid.' };

    const email = (els.email?.value || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, msg: 'Email format looks invalid.' };

    return { ok: true };
  };

  const enterEdit = () => {
    editing = true;
    snapshot = JSON.parse(JSON.stringify(user));
    setDisabled(false);
    setAvatarButtonsEnabled(true);
    if (els.editBtn) els.editBtn.classList.add('hidden');
    if (els.saveBtn) els.saveBtn.classList.remove('hidden');
    if (els.cancelBtn) els.cancelBtn.classList.remove('hidden');
  };

  const exitEdit = () => {
    editing = false;
    setDisabled(true);
    setAvatarButtonsEnabled(false);
    if (els.editBtn) els.editBtn.classList.remove('hidden');
    if (els.saveBtn) els.saveBtn.classList.add('hidden');
    if (els.cancelBtn) els.cancelBtn.classList.add('hidden');
  };

  const applyFromFields = () => {
    user.displayName = (els.displayName?.value || '').trim();
    user.location = {
      suburb: (els.suburb?.value || '').trim(),
      state: (els.state?.value || '').trim().toUpperCase(),
      postcode: (els.postcode?.value || '').trim()
    };
    user.contact = {
      phone: (els.phone?.value || '').trim(),
      email: (els.email?.value || '').trim()
    };
    user.privacy = {
      showLocation: !!els.showLocation?.checked,
      addressRule: els.addressRule?.value || 'afterAccepted'
    };
    user.verification = user.verification || { verified: false, abnFull: '', licenseFull: '' };
    user.verification.abnFull = (els.abn?.value || '').trim();
    user.verification.licenseFull = (els.license?.value || '').trim();

    // Batch L: persist tradie trades (even in Dual mode)
    user.tradie = user.tradie || { trades: [] };
    user.tradie.trades = Array.from(selectedTrades);
  };



  // ----------------------------
  // Avatar upload (prototype)
  // Stores a compressed square image in localStorage as avatarDataUrl.
  // ----------------------------
  async function processAvatarFile(file) {
    if (!file) return null;
    if (!file.type || !file.type.startsWith('image/')) {
      showToast('Please choose an image file.', false);
      return null;
    }
    const MAX_BYTES = 3 * 1024 * 1024; // 3MB
    if (file.size > MAX_BYTES) {
      showToast('Image is too large (max 3MB).', false);
      return null;
    }

    if (!window.ATHImages || typeof window.ATHImages.processImageFile !== 'function') return null;
    return await window.ATHImages.processImageFile(file, {
      maxBytes: MAX_BYTES,
      maxDim: 384,
      cropSquare: true,
      mimePrefer: 'image/webp',
      quality: 0.85
    });
  }

  function setAvatarButtonsEnabled(enabled) {
    if (els.avatarPickBtn) els.avatarPickBtn.disabled = !enabled;
    if (els.avatarRemoveBtn) els.avatarRemoveBtn.disabled = !enabled;
  }

  els.avatarPickBtn?.addEventListener('click', () => {
    if (!editing) return;
    els.avatarFile?.click();
  });

  els.avatarFile?.addEventListener('change', async () => {
    if (!editing) return;
    const file = els.avatarFile.files && els.avatarFile.files[0];
    const processed = await processAvatarFile(file);
    // reset input so picking same file again still triggers change
    if (els.avatarFile) els.avatarFile.value = '';
    if (!processed) return;
    user.avatarDataUrl = processed;
    render();
  });

  els.avatarRemoveBtn?.addEventListener('click', () => {
    if (!editing) return;
    user.avatarDataUrl = '';
    render();
  });
  // Role selection
  els.roleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!editing) return;
      user.role = btn.dataset.role;
      renderRoleUI();
    });
  });

  els.editBtn?.addEventListener('click', () => enterEdit());
  els.cancelBtn?.addEventListener('click', () => { user = JSON.parse(JSON.stringify(snapshot)); render(); exitEdit(); showToast('Cancelled changes.', true); });
  els.saveBtn?.addEventListener('click', () => {
    const v = validate();
    if (!v.ok) return showToast(v.msg, false);
    applyFromFields();
    setCurrentUser(user);
    render();
    exitEdit();
    showToast('Saved.', true);
  });

  // Initial state
  render();
  exitEdit();
}

// ----------------------------
// Batch N1: Profile reviews rendering (read-only)
// ----------------------------
(function () {
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(ts) {
    const d = new Date(Number(ts || Date.now()));
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }

  function renderStars(stars) {
    const s = Math.max(0, Math.min(5, Number(stars || 0)));
    return Array.from({ length: 5 }).map((_, i) => {
      const filled = i < s;
      const cls = filled ? 'fill-current' : '';
      return `<i data-feather="star" class="w-4 h-4 ${cls}"></i>`;
    }).join('');
  }

  function getReviewCount(entity, opts) {
    if (!entity) return 0;
    const baseTotal = Number.isFinite(Number(entity.reviewCount)) ? Number(entity.reviewCount) : (Array.isArray(entity.reviews) ? entity.reviews.length : 0);
    const id = String(opts?.id || '');
    const role = String(opts?.role || '');
    const local = id ? getLocalPublishedReviews(id, role) : [];
    // Only add local items that are beyond demo base arrays
    return baseTotal + local.length;
  }

  function readLocalReviews() {
    try {
      const raw = localStorage.getItem('athReviews');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function getLocalPublishedReviews(targetId, targetRole) {
    const tid = String(targetId || '');
    if (!tid) return [];
    const role = String(targetRole || '');
    const list = readLocalReviews();
    const out = [];
    const now = Date.now();
    for (const r of list) {
      if (!r) continue;
      if (String(r.targetId) !== tid) continue;
      if (role && String(r.targetRole) !== role) continue;
      if (r.visibility === 'published') {
        out.push(r);
        continue;
      }
      const base = Date.parse(r.completedAt || '') || 0;
      if (base && (now - base) >= 7 * 24 * 60 * 60 * 1000) {
        out.push({ ...r, visibility: 'published' });
      }
    }
    return out;
  }

  function getReviews(entity, opts) {
    const base = Array.isArray(entity?.reviews) ? entity.reviews : [];
    const id = String(opts?.id || '');
    const role = String(opts?.role || '');
    const local = id ? getLocalPublishedReviews(id, role) : [];
    // map local format to display format
    const mapped = local.map(r => ({
      stars: r.stars,
      text: r.text,
      ts: r.ts,
      byRole: r.reviewerRole === 'customer' ? 'Customer' : r.reviewerRole === 'tradie' ? 'Tradie' : ''
    }));
    return [...mapped, ...base];
  }

  window.ATHRender = window.ATHRender || {};
  window.ATHRender.renderReviewsInto = function renderReviewsInto(container, entity, emptyText, opts) {
    if (!container) return;
    const reviews = getReviews(entity, opts);
    const total = getReviewCount(entity, opts);
    if (!reviews.length) {
      container.innerHTML = `<div class="text-sm text-gray-500">${escapeHtml(emptyText || 'No reviews yet.')}</div>`;
      return;
    }

    const header = (total > reviews.length)
      ? `<div class="text-xs text-gray-500 mb-3">Showing ${reviews.length} of ${total} reviews</div>`
      : '';

    const items = reviews.map((r) => {
      const who = r.byRole ? `<span class="text-xs text-gray-500">• ${escapeHtml(r.byRole)}</span>` : '';
      return `
        <div class="border border-gray-200 rounded-xl p-4">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center text-amber-400">${renderStars(r.stars)}</div>
            <div class="text-xs text-gray-500">${escapeHtml(formatDate(r.ts))}</div>
          </div>
          <div class="mt-2 text-sm text-gray-700">${escapeHtml(r.text || '')}</div>
          <div class="mt-2 text-xs text-gray-500">${who}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = `${header}<div class="space-y-3">${items}</div>`;

    // feather icons
    try {
      if (typeof feather !== 'undefined' && feather && typeof feather.replace === 'function') feather.replace();
    } catch (e) { }
  };
})();

// ============================================================================
// v0.050: Starred/Bookmarked Messages
// ============================================================================

/**
 * Toggle star state for a message
 * @param {string} conversationId - The conversation ID
 * @param {string} messageTs - The message timestamp
 */
window.toggleStar = function(conversationId, messageTs) {
  if (!conversationId || !messageTs) return;
  
  const DATA = window.ATHStore.get('athMessagesData', {});
  const convo = DATA[conversationId];
  if (!convo || !convo.messages) return;
  
  // Find the message
  const msg = convo.messages.find(m => String(m.ts) === String(messageTs));
  if (!msg) return;
  
  // Toggle starred state
  msg.starred = !msg.starred;
  
  // Save to localStorage
  window.ATHStore.set('athMessagesData', DATA);
  
  // Re-render messages to update star icon
  if (window.location.pathname.includes('messages.html')) {
    const urlParams = new URLSearchParams(window.location.search);
    const currentConvo = urlParams.get('conversation');
    if (currentConvo === conversationId) {
      renderMessages();
    }
  }
  
  // Update starred count badge
  updateStarredCountBadge();
};

/**
 * Check if a message is starred
 */
window.isStarred = function(conversationId, messageTs) {
  const DATA = window.ATHStore.get('athMessagesData', {});
  const convo = DATA[conversationId];
  if (!convo || !convo.messages) return false;
  const msg = convo.messages.find(m => String(m.ts) === String(messageTs));
  return msg && msg.starred === true;
};

/**
 * Get all starred messages across all conversations
 */
window.getAllStarredMessages = function() {
  const DATA = window.ATHStore.get('athMessagesData', {});
  const starred = [];
  
  for (const [convId, convo] of Object.entries(DATA)) {
    if (!convo || !convo.messages) continue;
    
    convo.messages.forEach(msg => {
      if (msg.starred === true) {
        starred.push({
          ...msg,
          conversationId: convId,
          conversationName: convo.name || 'Unknown'
        });
      }
    });
  }
  
  // Sort by timestamp (newest first)
  starred.sort((a, b) => b.ts - a.ts);
  
  return starred;
};

/**
 * Render starred messages view
 */
window.showStarredView = function() {
  const starred = window.getAllStarredMessages();
  const chat = document.getElementById('chatScroll');
  if (!chat) return;
  
  if (starred.length === 0) {
    chat.innerHTML = `
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="text-6xl mb-4">⭐</div>
          <div class="text-lg font-semibold text-gray-700 mb-2">No Starred Messages</div>
          <div class="text-sm text-gray-500">Star important messages to find them here</div>
        </div>
      </div>
    `;
    return;
  }
  
  let html = `
    <div class="mb-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold text-gray-900">Starred Messages</h2>
        <button onclick="window.closeStarredView()" class="text-sm text-teal-600 hover:text-teal-700">
          ← Back to conversation
        </button>
      </div>
      <div class="text-sm text-gray-500 mt-1">${starred.length} starred message${starred.length === 1 ? '' : 's'}</div>
    </div>
  `;
  
  starred.forEach(msg => {
    const isMe = msg.from === 'Me';
    const alignment = isMe ? 'items-end' : 'items-start';
    const bubbleColor = isMe ? 'bg-teal-600 text-white' : 'bg-white border border-gray-200';
    const msgText = msg.text || '';
    const msgTime = new Date(msg.ts).toLocaleTimeString('en-AU', {hour: 'numeric', minute: '2-digit'});
    
    html += `
      <div class="mb-6 border-b border-gray-200 pb-4">
        <div class="text-xs text-gray-500 mb-2">
          From conversation with ${msg.conversationName}
        </div>
        <div class="flex flex-col ${alignment}">
          <div class="max-w-[70%] ${bubbleColor} rounded-xl px-4 py-2 shadow-sm">
            <div class="text-sm">${msgText}</div>
            <div class="text-xs mt-1 opacity-70">${msgTime}</div>
          </div>
          <button onclick="window.goToStarredMessage('${msg.conversationId}', '${msg.ts}')" 
                  class="text-xs text-teal-600 hover:text-teal-700 mt-1">
            Jump to message →
          </button>
        </div>
      </div>
    `;
  });
  
  chat.innerHTML = html;
  
  // Update header
  const chatName = document.getElementById('chatName');
  if (chatName) chatName.textContent = 'Starred Messages';
  
  // Hide avatar
  const avatar = document.getElementById('chatAvatar');
  const meta = document.getElementById('chatMeta');
  const status = document.getElementById('chatStatus');
  if (avatar) avatar.style.display = 'none';
  if (meta) meta.style.display = 'none';
  if (status) status.style.display = 'none';
};

/**
 * Close starred view
 */
window.closeStarredView = function() {
  window.location.reload();
};

/**
 * Jump to starred message
 */
window.goToStarredMessage = function(conversationId, messageTs) {
  window.location.href = `messages.html?conversation=${conversationId}#msg-${messageTs}`;
};

/**
 * Update starred count badge
 */
function updateStarredCountBadge() {
  const starred = window.getAllStarredMessages();
  const badge = document.getElementById('starredCountBadge');
  if (badge) {
    badge.textContent = starred.length;
    badge.style.display = starred.length > 0 ? 'inline-block' : 'none';
  }
}

// Initialize
if (window.location.pathname.includes('messages.html')) {
  document.addEventListener('DOMContentLoaded', () => {
    updateStarredCountBadge();
  });
}

// ============================================================================
// v0.055: Quick Replies/Templates
// ============================================================================

/**
 * Get default tradie templates
 */
function getDefaultTemplates() {
  return [
    { id: '1', text: 'On my way! ETA 15 mins' },
    { id: '2', text: 'Job complete, please review' },
    { id: '3', text: 'Quote sent, let me know if any questions' },
    { id: '4', text: 'Running 10 mins late, sorry!' },
    { id: '5', text: 'Thanks for your business!' },
    { id: '6', text: 'I can be there tomorrow morning, does that work for you?' },
    { id: '7', text: 'All materials are included in the quote' },
    { id: '8', text: 'Job will take approximately 2-3 hours' }
  ];
}

/**
 * Initialize templates in localStorage
 */
window.initTemplates = function() {
  const existing = window.ATHStore.get('athMessageTemplates', null);
  if (!existing) {
    window.ATHStore.set('athMessageTemplates', getDefaultTemplates());
  }
  return window.ATHStore.get('athMessageTemplates', getDefaultTemplates());
};

/**
 * Get all templates
 */
window.getTemplates = function() {
  return window.ATHStore.get('athMessageTemplates', getDefaultTemplates());
};

/**
 * Add a new template
 */
window.addTemplate = function(text) {
  const templates = window.getTemplates();
  const newId = String(Date.now());
  const newTemplate = { id: newId, text: text.trim() };
  templates.push(newTemplate);
  window.ATHStore.set('athMessageTemplates', templates);
  return newTemplate;
};

/**
 * Edit a template
 */
window.editTemplate = function(id, newText) {
  const templates = window.getTemplates();
  const template = templates.find(t => t.id === id);
  if (template) {
    template.text = newText.trim();
    window.ATHStore.set('athMessageTemplates', templates);
  }
};

/**
 * Delete a template
 */
window.deleteTemplate = function(id) {
  const templates = window.getTemplates();
  const filtered = templates.filter(t => t.id !== id);
  window.ATHStore.set('athMessageTemplates', filtered);
};

/**
 * Insert template into message input
 */
window.insertTemplate = function(templateText) {
  const input = document.getElementById('messageInput');
  if (input) {
    input.value = templateText;
    input.focus();
    // Close template picker
    hideTemplatePicker();
  }
};

/**
 * Show template picker dropdown
 */
window.showTemplatePicker = function() {
  const picker = document.getElementById('templatePicker');
  if (!picker) return;
  
  const templates = window.getTemplates();
  
  let html = `
    <div class="p-3 border-b border-gray-200 flex items-center justify-between">
      <div class="font-semibold text-gray-900">Quick Replies</div>
      <button onclick="window.showManageTemplatesModal()" class="text-sm text-teal-600 hover:text-teal-700">
        Manage
      </button>
    </div>
    <div class="max-h-64 overflow-y-auto">
  `;
  
  if (templates.length === 0) {
    html += `
      <div class="p-4 text-sm text-gray-500 text-center">
        No templates yet. Click "Manage" to add one.
      </div>
    `;
  } else {
    templates.forEach(template => {
      html += `
        <button onclick="window.insertTemplate(\`${template.text.replace(/`/g, '\\`')}\`)" 
                class="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 transition-colors">
          <div class="text-sm text-gray-900">${template.text}</div>
        </button>
      `;
    });
  }
  
  html += `</div>`;
  
  picker.innerHTML = html;
  picker.classList.remove('hidden');
};

/**
 * Hide template picker
 */
window.hideTemplatePicker = function() {
  const picker = document.getElementById('templatePicker');
  if (picker) {
    picker.classList.add('hidden');
  }
};

/**
 * Toggle template picker
 */
window.toggleTemplatePicker = function() {
  const picker = document.getElementById('templatePicker');
  if (!picker) return;
  
  if (picker.classList.contains('hidden')) {
    window.showTemplatePicker();
  } else {
    window.hideTemplatePicker();
  }
};

/**
 * Show manage templates modal
 */
window.showManageTemplatesModal = function() {
  const modal = document.getElementById('manageTemplatesModal');
  if (!modal) return;
  
  updateTemplatesList();
  modal.classList.remove('hidden');
  window.hideTemplatePicker();
};

/**
 * Hide manage templates modal
 */
window.hideManageTemplatesModal = function() {
  const modal = document.getElementById('manageTemplatesModal');
  if (modal) {
    modal.classList.add('hidden');
  }
};

/**
 * Update templates list in modal
 */
function updateTemplatesList() {
  const list = document.getElementById('templatesList');
  if (!list) return;
  
  const templates = window.getTemplates();
  
  if (templates.length === 0) {
    list.innerHTML = '<div class="text-sm text-gray-500 text-center py-8">No templates yet. Add one below!</div>';
    return;
  }
  
  let html = '<div class="space-y-2">';
  templates.forEach(template => {
    html += `
      <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div class="flex-1 text-sm text-gray-900 mr-3">${template.text}</div>
        <div class="flex items-center space-x-2">
          <button onclick="window.editTemplatePrompt('${template.id}', \`${template.text.replace(/`/g, '\\`')}\`)" 
                  class="p-1.5 hover:bg-gray-200 rounded text-teal-600" title="Edit">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          <button onclick="window.deleteTemplateConfirm('${template.id}')" 
                  class="p-1.5 hover:bg-gray-200 rounded text-red-600" title="Delete">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  });
  html += '</div>';
  
  list.innerHTML = html;
}

/**
 * Add new template from modal
 */
window.addTemplateFromModal = function() {
  const input = document.getElementById('newTemplateInput');
  if (!input || !input.value.trim()) {
    alert('Please enter template text');
    return;
  }
  
  window.addTemplate(input.value);
  input.value = '';
  updateTemplatesList();
};

/**
 * Edit template (prompt)
 */
window.editTemplatePrompt = function(id, currentText) {
  const newText = prompt('Edit template:', currentText);
  if (newText !== null && newText.trim()) {
    window.editTemplate(id, newText);
    updateTemplatesList();
  }
};

/**
 * Delete template with confirmation
 */
window.deleteTemplateConfirm = function(id) {
  if (confirm('Delete this template?')) {
    window.deleteTemplate(id);
    updateTemplatesList();
  }
};

// Initialize templates on load
if (window.location.pathname.includes('messages.html')) {
  document.addEventListener('DOMContentLoaded', () => {
    window.initTemplates();
  });
}

// ============================================================================
// v0.060: Enhanced Message Search
// ============================================================================

// Search state
window.messageSearchState = {
  query: '',
  results: [],
  currentIndex: -1
};

/**
 * Perform message search in active conversation
 * @param {string} query - Search query
 */
window.searchMessages = function(query) {
  const trimmedQuery = query.trim().toLowerCase();
  
  if (!trimmedQuery) {
    clearMessageSearch();
    return;
  }
  
  // Get current conversation
  const urlParams = new URLSearchParams(window.location.search);
  const conversationId = urlParams.get('conversation');
  if (!conversationId) return;
  
  const DATA = window.ATHStore.get('athMessagesData', {});
  const convo = DATA[conversationId];
  if (!convo || !convo.messages) return;
  
  // Find matching messages
  const results = [];
  convo.messages.forEach((msg, idx) => {
    const text = (msg.text || '').toLowerCase();
    if (text.includes(trimmedQuery)) {
      results.push({
        messageIndex: idx,
        timestamp: msg.ts,
        text: msg.text
      });
    }
  });
  
  // Update state
  window.messageSearchState.query = trimmedQuery;
  window.messageSearchState.results = results;
  window.messageSearchState.currentIndex = results.length > 0 ? 0 : -1;
  
  // Update UI
  updateSearchResults();
  highlightSearchResults();
  
  // Scroll to first result
  if (results.length > 0) {
    scrollToSearchResult(0);
  }
};

/**
 * Clear message search
 */
window.clearMessageSearch = function() {
  window.messageSearchState = {
    query: '',
    results: [],
    currentIndex: -1
  };
  
  // Clear search input
  const input = document.getElementById('messageSearchInput');
  if (input) input.value = '';
  
  // Update UI
  updateSearchResults();
  removeSearchHighlights();
};

/**
 * Navigate to next search result
 */
window.nextSearchResult = function() {
  const state = window.messageSearchState;
  if (state.results.length === 0) return;
  
  state.currentIndex = (state.currentIndex + 1) % state.results.length;
  updateSearchResults();
  scrollToSearchResult(state.currentIndex);
};

/**
 * Navigate to previous search result
 */
window.prevSearchResult = function() {
  const state = window.messageSearchState;
  if (state.results.length === 0) return;
  
  state.currentIndex = (state.currentIndex - 1 + state.results.length) % state.results.length;
  updateSearchResults();
  scrollToSearchResult(state.currentIndex);
};

/**
 * Update search results counter
 */
function updateSearchResults() {
  const counter = document.getElementById('searchResultCounter');
  if (!counter) return;
  
  const state = window.messageSearchState;
  
  if (state.results.length === 0) {
    if (state.query) {
      counter.textContent = 'No results';
      counter.classList.remove('hidden');
    } else {
      counter.classList.add('hidden');
    }
  } else {
    counter.textContent = `${state.currentIndex + 1} of ${state.results.length}`;
    counter.classList.remove('hidden');
  }
  
  // Update navigation buttons
  const prevBtn = document.getElementById('searchPrevBtn');
  const nextBtn = document.getElementById('searchNextBtn');
  
  if (prevBtn && nextBtn) {
    const disabled = state.results.length === 0;
    prevBtn.disabled = disabled;
    nextBtn.disabled = disabled;
    
    if (disabled) {
      prevBtn.classList.add('opacity-50', 'cursor-not-allowed');
      nextBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      prevBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      nextBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }
}

/**
 * Highlight search results in message bubbles
 */
function highlightSearchResults() {
  removeSearchHighlights();
  
  const state = window.messageSearchState;
  if (!state.query || state.results.length === 0) return;
  
  const chatScroll = document.getElementById('chatScroll');
  if (!chatScroll) return;
  
  // Get all message bubbles
  const messages = chatScroll.querySelectorAll('[data-message-ts]');
  
  messages.forEach(msgEl => {
    const ts = msgEl.getAttribute('data-message-ts');
    const isResult = state.results.some(r => String(r.timestamp) === ts);
    
    if (isResult) {
      // Highlight the message bubble
      msgEl.classList.add('search-result-highlight');
      
      // Highlight matching text within message
      const textEl = msgEl.querySelector('.message-text');
      if (textEl) {
        const originalText = textEl.textContent;
        const regex = new RegExp(`(${escapeRegex(state.query)})`, 'gi');
        const highlightedText = originalText.replace(regex, '<mark class="bg-yellow-300 text-gray-900">$1</mark>');
        textEl.innerHTML = highlightedText;
      }
    }
  });
}

/**
 * Remove search highlights
 */
function removeSearchHighlights() {
  const chatScroll = document.getElementById('chatScroll');
  if (!chatScroll) return;
  
  // Remove bubble highlights
  const highlighted = chatScroll.querySelectorAll('.search-result-highlight');
  highlighted.forEach(el => el.classList.remove('search-result-highlight'));
  
  // Remove text highlights
  const marks = chatScroll.querySelectorAll('mark');
  marks.forEach(mark => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
}

/**
 * Scroll to search result
 * @param {number} index - Result index
 */
function scrollToSearchResult(index) {
  const state = window.messageSearchState;
  if (index < 0 || index >= state.results.length) return;
  
  const result = state.results[index];
  const msgEl = document.querySelector(`[data-message-ts="${result.timestamp}"]`);
  
  if (msgEl) {
    msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Add pulse animation to current result
    msgEl.classList.add('search-current-result');
    setTimeout(() => {
      msgEl.classList.remove('search-current-result');
    }, 2000);
  }
}

/**
 * Escape regex special characters
 * @param {string} str - String to escape
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Toggle search bar visibility
 */
window.toggleMessageSearch = function() {
  const searchBar = document.getElementById('messageSearchBar');
  if (!searchBar) return;
  
  if (searchBar.classList.contains('hidden')) {
    searchBar.classList.remove('hidden');
    const input = document.getElementById('messageSearchInput');
    if (input) {
      input.focus();
    }
  } else {
    searchBar.classList.add('hidden');
    clearMessageSearch();
  }
};

// Initialize search on page load
if (window.location.pathname.includes('messages.html')) {
  document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('messageSearchInput');
    if (searchInput) {
      // Debounced search
      let searchTimeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          window.searchMessages(e.target.value);
        }, 300);
      });
    }
  });
}

// ============================================================================
// v0.065: Message Forwarding
// ============================================================================

/**
 * Show forward message modal
 * @param {string} conversationId - Source conversation ID
 * @param {string} messageTs - Message timestamp
 */
window.showForwardModal = function(conversationId, messageTs) {
  const modal = document.getElementById('forwardMessageModal');
  if (!modal) return;
  
  const DATA = window.ATHStore.get('athMessagesData', {});
  const convo = DATA[conversationId];
  if (!convo || !convo.messages) return;
  
  // Find the message
  const msg = convo.messages.find(m => String(m.ts) === String(messageTs));
  if (!msg) return;
  
  // Store current forward context
  window.forwardContext = {
    sourceConversationId: conversationId,
    messageTs: messageTs,
    message: msg
  };
  
  // Populate conversation list
  renderForwardConversationList();
  
  // Show modal
  modal.classList.remove('hidden');
};

/**
 * Hide forward message modal
 */
window.hideForwardModal = function() {
  const modal = document.getElementById('forwardMessageModal');
  if (modal) {
    modal.classList.add('hidden');
  }
  window.forwardContext = null;
};

/**
 * Render list of conversations for forwarding
 */
function renderForwardConversationList() {
  const list = document.getElementById('forwardConversationList');
  if (!list) return;
  
  const DATA = window.ATHStore.get('athMessagesData', {});
  const currentConvoId = window.forwardContext?.sourceConversationId;
  
  let html = '';
  
  for (const [convId, convo] of Object.entries(DATA)) {
    // Skip current conversation
    if (convId === currentConvoId) continue;
    
    const name = convo.name || 'Unknown';
    const lastMsg = convo.messages?.[convo.messages.length - 1];
    const preview = lastMsg ? (lastMsg.text || '').substring(0, 50) : 'No messages';
    
    html += `
      <button onclick="window.forwardToConversation('${convId}')" 
              class="w-full text-left p-4 hover:bg-gray-50 border-b border-gray-200 transition-colors">
        <div class="font-semibold text-gray-900">${name}</div>
        <div class="text-sm text-gray-500 mt-1 truncate">${preview}</div>
      </button>
    `;
  }
  
  if (html === '') {
    html = '<div class="p-8 text-center text-gray-500">No other conversations available</div>';
  }
  
  list.innerHTML = html;
}

/**
 * Forward message to target conversation
 * @param {string} targetConversationId - Target conversation ID
 */
window.forwardToConversation = function(targetConversationId) {
  if (!window.forwardContext) return;
  
  const DATA = window.ATHStore.get('athMessagesData', {});
  const targetConvo = DATA[targetConversationId];
  if (!targetConvo) return;
  
  const { message, sourceConversationId } = window.forwardContext;
  const sourceConvo = DATA[sourceConversationId];
  
  // Create forwarded message
  const forwardedMsg = {
    ts: Date.now(),
    from: 'Me',
    text: `Forwarded from ${sourceConvo.name || 'Unknown'}:\n${message.text}`,
    forwarded: true,
    originalFrom: message.from,
    originalTs: message.ts
  };
  
  // Add to target conversation
  if (!targetConvo.messages) {
    targetConvo.messages = [];
  }
  targetConvo.messages.push(forwardedMsg);
  
  // Save
  window.ATHStore.set('athMessagesData', DATA);
  
  // Close modal
  window.hideForwardModal();
  
  // Show confirmation
  showForwardConfirmation(targetConvo.name);
};

/**
 * Show forward confirmation message
 * @param {string} targetName - Target conversation name
 */
function showForwardConfirmation(targetName) {
  // Create temporary notification
  const notification = document.createElement('div');
  notification.className = 'fixed bottom-4 right-4 bg-teal-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in';
  notification.innerHTML = `
    <div class="flex items-center space-x-2">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>
      <span>Message forwarded to ${targetName}</span>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

/**
 * Forward multiple messages
 * @param {string} conversationId - Source conversation ID
 * @param {Array} messageTimestamps - Array of message timestamps
 */
window.forwardMultipleMessages = function(conversationId, messageTimestamps) {
  const modal = document.getElementById('forwardMessageModal');
  if (!modal) return;
  
  const DATA = window.ATHStore.get('athMessagesData', {});
  const convo = DATA[conversationId];
  if (!convo || !convo.messages) return;
  
  // Find the messages
  const messages = convo.messages.filter(m => 
    messageTimestamps.includes(String(m.ts))
  );
  
  if (messages.length === 0) return;
  
  // Store context for multiple messages
  window.forwardContext = {
    sourceConversationId: conversationId,
    messages: messages,
    multiple: true
  };
  
  // Populate conversation list
  renderForwardConversationList();
  
  // Show modal
  modal.classList.remove('hidden');
};

/**
 * Forward multiple messages to target
 * @param {string} targetConversationId - Target conversation ID
 */
window.forwardMultipleToConversation = function(targetConversationId) {
  if (!window.forwardContext || !window.forwardContext.multiple) return;
  
  const DATA = window.ATHStore.get('athMessagesData', {});
  const targetConvo = DATA[targetConversationId];
  if (!targetConvo) return;
  
  const { messages, sourceConversationId } = window.forwardContext;
  const sourceConvo = DATA[sourceConversationId];
  
  // Create forwarded messages
  messages.forEach(message => {
    const forwardedMsg = {
      ts: Date.now() + Math.random(), // Ensure unique timestamps
      from: 'Me',
      text: `Forwarded from ${sourceConvo.name || 'Unknown'}:\n${message.text}`,
      forwarded: true,
      originalFrom: message.from,
      originalTs: message.ts
    };
    
    if (!targetConvo.messages) {
      targetConvo.messages = [];
    }
    targetConvo.messages.push(forwardedMsg);
  });
  
  // Save
  window.ATHStore.set('athMessagesData', DATA);
  
  // Close modal
  window.hideForwardModal();
  
  // Show confirmation
  showForwardConfirmation(targetConvo.name);
};

// ============================================================================
// v0.070: Voice Messages (Core)
// ============================================================================

// Voice recording state
window.voiceRecordingState = {
  isRecording: false,
  mediaRecorder: null,
  audioChunks: [],
  startTime: null,
  timerInterval: null,
  stream: null
};

/**
 * Start voice recording
 */
window.startVoiceRecording = async function() {
  try {
    // Request microphone permission
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100
      } 
    });
    
    // Determine supported MIME type
    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/ogg;codecs=opus';
        }
      }
    }
    
    // Create MediaRecorder
    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    
    // Store state
    window.voiceRecordingState.mediaRecorder = mediaRecorder;
    window.voiceRecordingState.stream = stream;
    window.voiceRecordingState.audioChunks = [];
    window.voiceRecordingState.isRecording = true;
    window.voiceRecordingState.startTime = Date.now();
    
    // Handle data available
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        window.voiceRecordingState.audioChunks.push(event.data);
      }
    };
    
    // Handle recording stop
    mediaRecorder.onstop = () => {
      processVoiceRecording();
    };
    
    // Start recording
    mediaRecorder.start();
    
    // Update UI
    showRecordingIndicator();
    startRecordingTimer();
    
    // Auto-stop after 2 minutes
    setTimeout(() => {
      if (window.voiceRecordingState.isRecording) {
        window.stopVoiceRecording();
      }
    }, 120000);
    
  } catch (error) {
    console.error('Error starting voice recording:', error);
    
    if (error.name === 'NotAllowedError') {
      alert('Microphone permission denied. Please allow microphone access to send voice messages.');
    } else if (error.name === 'NotFoundError') {
      alert('No microphone found. Please connect a microphone to send voice messages.');
    } else {
      alert('Error starting voice recording: ' + error.message);
    }
    
    resetVoiceRecording();
  }
};

/**
 * Stop voice recording
 */
window.stopVoiceRecording = function() {
  if (!window.voiceRecordingState.isRecording) return;
  
  const { mediaRecorder, stream } = window.voiceRecordingState;
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  
  // Stop all tracks
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  
  stopRecordingTimer();
};

/**
 * Cancel voice recording
 */
window.cancelVoiceRecording = function() {
  const { stream } = window.voiceRecordingState;
  
  // Stop all tracks
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  
  stopRecordingTimer();
  hideRecordingIndicator();
  resetVoiceRecording();
};

/**
 * Process recorded voice message
 */
async function processVoiceRecording() {
  const { audioChunks, startTime } = window.voiceRecordingState;
  
  if (audioChunks.length === 0) {
    resetVoiceRecording();
    hideRecordingIndicator();
    return;
  }
  
  // Calculate duration
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  // Create blob
  const mimeType = window.voiceRecordingState.mediaRecorder.mimeType;
  const audioBlob = new Blob(audioChunks, { type: mimeType });
  
  // Convert to base64
  const base64Audio = await blobToBase64(audioBlob);
  
  // Create voice message
  const urlParams = new URLSearchParams(window.location.search);
  const conversationId = urlParams.get('conversation');
  
  if (!conversationId) {
    resetVoiceRecording();
    hideRecordingIndicator();
    return;
  }
  
  // Get the user ID and use the SAME storage key as messages.html (line 1763)
  const session = window.ATHAuth?.getSession?.();
  if (!session?.userId) {
    console.error('No user session found');
    resetVoiceRecording();
    hideRecordingIndicator();
    return;
  }
  
  const uid = session.userId;
  const STORE_KEY = `athConversations:${uid}`;
  
  // Load conversations from the SAME key that messages.html uses
  const DATA = window.ATHStore.get(STORE_KEY, {});
  
  if (!DATA[conversationId]) {
    // Initialize conversation if it doesn't exist
    DATA[conversationId] = { messages: [] };
  }
  
  // Add voice message
  const voiceMessage = {
    ts: Date.now(),
    from: 'me',
    type: 'voice',
    voiceData: base64Audio,
    duration: duration,
    mimeType: mimeType,
    time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  };
  
  if (!DATA[conversationId].messages) {
    DATA[conversationId].messages = [];
  }
  DATA[conversationId].messages.push(voiceMessage);
  
  // Save to localStorage using the SAME key as messages.html
  window.ATHStore.set(STORE_KEY, DATA);
  
  // Reset and hide
  resetVoiceRecording();
  hideRecordingIndicator();
  
  // Reload page to show the new voice message
  window.location.reload();
}

/**
 * Convert blob to base64
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Reset voice recording state
 */
function resetVoiceRecording() {
  window.voiceRecordingState = {
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    startTime: null,
    timerInterval: null,
    stream: null
  };
}

/**
 * Show recording indicator
 */
function showRecordingIndicator() {
  const indicator = document.getElementById('voiceRecordingIndicator');
  if (indicator) {
    indicator.classList.remove('hidden');
  }
  
  // Update microphone button state
  const micBtn = document.getElementById('voiceMicBtn');
  if (micBtn) {
    micBtn.classList.add('recording');
  }
}

/**
 * Hide recording indicator
 */
function hideRecordingIndicator() {
  const indicator = document.getElementById('voiceRecordingIndicator');
  if (indicator) {
    indicator.classList.add('hidden');
  }
  
  // Reset microphone button state
  const micBtn = document.getElementById('voiceMicBtn');
  if (micBtn) {
    micBtn.classList.remove('recording');
  }
}

/**
 * Start recording timer
 */
function startRecordingTimer() {
  const timerEl = document.getElementById('recordingTimer');
  if (!timerEl) return;
  
  window.voiceRecordingState.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - window.voiceRecordingState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, 100);
}

/**
 * Stop recording timer
 */
function stopRecordingTimer() {
  if (window.voiceRecordingState.timerInterval) {
    clearInterval(window.voiceRecordingState.timerInterval);
    window.voiceRecordingState.timerInterval = null;
  }
}

/**
 * Play voice message
 */
/**
 * Play voice message
 */
window.playVoiceMessage = function(messageTs) {
  const audioEl = document.getElementById(`voice-audio-${messageTs}`);
  if (!audioEl) return;
  
  // Pause all other playing audio
  document.querySelectorAll('audio').forEach(audio => {
    if (audio.id !== `voice-audio-${messageTs}` && !audio.paused) {
      audio.pause();
      // Reset button state for others
      const otherTs = audio.id.replace('voice-audio-', '');
      window.pauseVoiceMessage(otherTs);
    }
  });
  
  audioEl.play().catch(console.error);
  
  // Update button
  const btnEl = document.getElementById(`voice-play-btn-${messageTs}`);
  if (btnEl) {
    btnEl.innerHTML = `
      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>
    `;
    btnEl.setAttribute('onclick', `window.pauseVoiceMessage('${messageTs}')`);
  }
};

/**
 * Pause voice message
 */
window.pauseVoiceMessage = function(messageTs) {
  const audioEl = document.getElementById(`voice-audio-${messageTs}`);
  if (!audioEl) return;
  
  audioEl.pause();
  
  // Update button
  const btnEl = document.getElementById(`voice-play-btn-${messageTs}`);
  if (btnEl) {
    btnEl.innerHTML = `
      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
      </svg>
    `;
    btnEl.setAttribute('onclick', `window.playVoiceMessage('${messageTs}')`);
  }
};

/**
 * Toggle playback speed
 */
window.toggleVoiceSpeed = function(ts) {
  const audio = document.getElementById(`voice-audio-${ts}`);
  const btn = document.getElementById(`voice-speed-${ts}`);
  if (!audio || !btn) return;
  
  let rate = audio.playbackRate;
  if (rate === 1) rate = 1.5;
  else if (rate === 1.5) rate = 2;
  else rate = 1;
  
  audio.playbackRate = rate;
  btn.textContent = rate + 'x';
};

/**
 * Seek voice message
 */
window.seekVoiceMessage = function(ts, percent) {
  const audio = document.getElementById(`voice-audio-${ts}`);
  if (!audio) return;
  
  let duration = audio.duration;
  if (!Number.isFinite(duration)) return;
  
  const newTime = (percent / 100) * duration;
  audio.currentTime = newTime;
};

/**
 * Handle time update
 */
window.handleVoiceTimeUpdate = function(ts) {
  const audio = document.getElementById(`voice-audio-${ts}`);
  const seek = document.getElementById(`voice-seek-${ts}`);
  const curr = document.getElementById(`voice-curr-${ts}`);
  
  if (!audio || !Number.isFinite(audio.duration)) return;
  
  const percent = (audio.currentTime / audio.duration) * 100;
  if (seek) seek.value = percent;
  
  if (curr) {
    curr.textContent = window.formatVoiceDuration(audio.currentTime);
  }
};

/**
 * Handle playback ended
 */
window.handleVoiceEnded = function(ts) {
  window.pauseVoiceMessage(ts);
  const audio = document.getElementById(`voice-audio-${ts}`);
  if (audio) {
    audio.currentTime = 0;
    window.handleVoiceTimeUpdate(ts); 
  }
};

/**
 * Format duration for display
 */
window.formatVoiceDuration = function(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// ============================================================================
// v0.095: Customer Profile (Edit)
// ============================================================================

function initProfilePage() {
  // Elements
  const els = {
    avatar: document.getElementById('mpAvatar'),
    name: document.getElementById('mpName'),
    subtitle: document.getElementById('mpSubtitle'),
    roleBadge: document.getElementById('mpRoleBadge'),
    verifiedBadge: document.getElementById('mpVerifiedBadge'),
    
    displayName: document.getElementById('mpDisplayName'),
    email: document.getElementById('mpEmail'),
    phone: document.getElementById('mpPhone'),
    location: document.getElementById('mpLocation'),
    
    btnEdit: document.getElementById('mpEditBtn'),
    btnSave: document.getElementById('mpSaveBtn'),
    btnCancel: document.getElementById('mpCancelBtn'),
    
    roleBtns: document.querySelectorAll('.mpRoleBtn'),
    
    publicTradie: document.getElementById('mpPublicTradieLink'),
    publicCustomer: document.getElementById('mpPublicCustomerLink')
  };

  // Check if we are on the profile page by checking for a key element
  if (!els.avatar) return;

  // Load Data
  let user = {
    name: 'Jayden Goblin',
    email: 'jayden.goblin@example.com',
    phone: '0400 000 000',
    location: 'Sydney, NSW',
    role: 'customer',
    avatar: 'https://ui-avatars.com/api/?name=Jayden+Goblin&background=0D9488&color=fff',
    verified: true
  };

  try {
    const stored = localStorage.getItem('athUser');
    if (stored) {
      user = { ...user, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Error loading profile:', e);
  }

  // State
  let editing = false;
  let tempAvatarBase64 = null;
  let draftUser = null;

  // Render
  const render = (data = user) => {
    const displayAvatar = tempAvatarBase64 || data.avatar;
    
    if (els.avatar) els.avatar.src = displayAvatar;
    if (els.name) els.name.textContent = data.name;
    
    // Subtitle logic
    let roleText = 'Customer Account';
    if (data.role === 'tradie') roleText = 'Tradie Account';
    else if (data.role === 'dual') roleText = 'Dual Account';
    if (els.subtitle) els.subtitle.textContent = `Manage your ${roleText}, role, and privacy.`;

    // Badges
    if (els.roleBadge) els.roleBadge.textContent = data.role.charAt(0).toUpperCase() + data.role.slice(1);
    if (els.verifiedBadge) els.verifiedBadge.classList.toggle('hidden', !data.verified);
    
    // Inputs
    if (els.displayName) els.displayName.value = data.name;
    if (els.email) els.email.value = data.email;
    if (els.phone) els.phone.value = data.phone;
    if (els.location) els.location.value = data.location;
    
    // Role Buttons
    if (els.roleBtns) {
      els.roleBtns.forEach(btn => {
        const r = btn.dataset.role;
        btn.disabled = !editing;
        if (r === data.role) {
          btn.classList.add('bg-teal-50', 'text-teal-700', 'border-teal-200');
          btn.classList.remove('text-gray-600', 'bg-white', 'border-gray-200');
        } else {
          btn.classList.remove('bg-teal-50', 'text-teal-700', 'border-teal-200');
          btn.classList.add('text-gray-600', 'bg-white', 'border-gray-200');
        }
        btn.style.opacity = editing ? '1' : '0.6';
        btn.style.cursor = editing ? 'pointer' : 'not-allowed';
      });
    }

    // Public Links
    if (els.publicTradie) els.publicTradie.classList.toggle('hidden', data.role === 'customer');
    if (els.publicCustomer) els.publicCustomer.classList.toggle('hidden', data.role === 'tradie');
  };

  // Toggle Edit
  const setEditing = (isEditing) => {
    editing = isEditing;
    
    if (editing) {
      draftUser = { ...user }; // Clone
    } else {
      draftUser = null;
      tempAvatarBase64 = null;
    }

    if (els.btnEdit) els.btnEdit.classList.toggle('hidden', editing);
    if (els.btnSave) els.btnSave.classList.toggle('hidden', !editing);
    if (els.btnCancel) els.btnCancel.classList.toggle('hidden', !editing);

    // Inputs
    [els.displayName, els.email, els.phone, els.location].forEach(input => {
      if (input) {
        input.disabled = !editing;
        // Visual
        input.classList.toggle('bg-white', editing);
        input.classList.toggle('bg-gray-50', !editing); // Usually disabled background
        input.classList.toggle('border-teal-500', editing);
        input.classList.toggle('ring-1', editing);
        input.classList.toggle('ring-teal-500', editing);
      }
    });
    
    render(editing ? draftUser : user);
  };

  // Avatar Input
  let fileInput = document.getElementById('hiddenAvatarInput');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.id = 'hiddenAvatarInput';
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        if (els.avatar) els.avatar.style.opacity = '0.5';
        
        const result = await window.ATHImages.processImageFile(file);
        tempAvatarBase64 = result.base64;
        
        if (els.avatar) els.avatar.style.opacity = '1';
        render(draftUser || user);
      } catch (err) {
        console.error(err);
        alert('Failed to process image.');
        if (els.avatar) els.avatar.style.opacity = '1';
      }
    });
  }

  // Avatar Click
  if (els.avatar) {
    els.avatar.title = 'Click Edit to change avatar';
    els.avatar.style.cursor = 'default';
    
    els.avatar.addEventListener('click', () => {
      if (editing) {
        fileInput.click();
      }
    });
    
    // Update cursor logic in setEditing or here with an observer? 
    // Easier to just toggle style in setEditing loop? 
    // Let's add it to the render/setEditing logic implicitly by logic but explictly:
    // We'll update the title/cursor in setEditing for better UX.
  }
  
  // Extend setEditing to handle avatar cursor
  const originalSetEditing = setEditing;
  const enhancedSetEditing = (isEditing) => {
    originalSetEditing(isEditing);
    if (els.avatar) {
      els.avatar.style.cursor = isEditing ? 'pointer' : 'default';
      els.avatar.title = isEditing ? 'Click to upload new avatar' : 'Click Edit to change avatar';
    }
  };


  // Buttons
  if (els.btnEdit) els.btnEdit.addEventListener('click', () => enhancedSetEditing(true));
  
  if (els.btnCancel) els.btnCancel.addEventListener('click', () => {
    enhancedSetEditing(false); // Discards draft
  });
  
  if (els.btnSave) els.btnSave.addEventListener('click', () => {
    // Commit changes
    if (draftUser) {
      if (els.displayName) draftUser.name = els.displayName.value;
      if (els.email) draftUser.email = els.email.value;
      if (els.phone) draftUser.phone = els.phone.value;
      if (els.location) draftUser.location = els.location.value;
      if (tempAvatarBase64) draftUser.avatar = tempAvatarBase64;
      
      user = { ...draftUser };
      localStorage.setItem('athUser', JSON.stringify(user));
      
      alert('Profile saved successfully!');
      enhancedSetEditing(false);
      
      // Update global header avatar if exists
      // const headerAvatar = document.querySelector('nav .rounded-full'); // hypothetical
      // if (headerAvatar) headerAvatar.src = user.avatar;
    }
  });
  
  // Role Toggles
  if (els.roleBtns) {
    els.roleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!editing || !draftUser) return;
        draftUser.role = btn.dataset.role;
        render(draftUser);
      });
    });
  }

  // Initial Render
  render();
}

// Router
if (window.location.pathname.includes('my-profile.html')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfilePage);
  } else {
    initProfilePage();
  }
}
// ============================================================================
// v0.096: Gallery View
// ============================================================================

window.openGallery = function() {
  const modal = document.getElementById('galleryModal');
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  if (!modal || !grid) return;

  // Get current conversation
  const urlParams = new URLSearchParams(window.location.search);
  const currentConvoId = urlParams.get('conversation');
  if (!currentConvoId) {
    alert('Please open a conversation first.');
    return;
  }

  const DATA = window.ATHStore.get('athMessagesData', {});
  const convo = DATA[currentConvoId];
  if (!convo || !convo.messages) {
    alert('No messages found.');
    return;
  }

  // Filter image messages
  const images = convo.messages.filter(m => m.type === 'image' && m.imageData);
  
  // Render
  grid.innerHTML = '';
  if (images.length === 0) {
    if (empty) empty.classList.remove('hidden');
    grid.classList.add('hidden');
  } else {
    if (empty) empty.classList.add('hidden');
    grid.classList.remove('hidden');
    
    images.forEach(img => {
      const div = document.createElement('div');
      div.className = 'aspect-square bg-gray-100 rounded-lg overflow-hidden relative cursor-pointer group border border-gray-200';
      div.onclick = () => window.openLightbox(img.imageData);
      
      div.innerHTML = `
        <img src="${img.imageData}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
        ${img.text ? `<div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent text-white text-xs truncate">${img.text}</div>` : ''}
      `;
      grid.appendChild(div);
    });
  }

  modal.classList.remove('hidden');
};

window.closeGallery = function() {
  const modal = document.getElementById('galleryModal');
  if (modal) modal.classList.add('hidden');
};

// ============================================================================
// v0.100: Photo Documentation Sets
// ============================================================================

let currentPhotoSet = []; // { file, label, preview, id }

window.openPhotoSetBuilder = function() {
  currentPhotoSet = [];
  renderPhotoSetBuilder();
  const modal = document.getElementById('photoSetModal');
  if (modal) modal.classList.remove('hidden');
};

window.closePhotoSetBuilder = function() {
  const modal = document.getElementById('photoSetModal');
  if (modal) modal.classList.add('hidden');
  currentPhotoSet = [];
};

window.handlePhotoSetFiles = async function(files) {
  if (!files || files.length === 0) return;
  
  for (const file of files) {
    // Basic validation
    if (!file.type.startsWith('image/')) continue;
    
    // Process image (compress/resize)
    // Reuse existing compression if available, or simple read
    let preview = '';
    if (window.ATHImages && window.ATHImages.processImageFile) {
        const processed = await window.ATHImages.processImageFile(file, { maxDim: 1200, quality: 0.8 });
        preview = processed.base64;
    } else {
         preview = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(file);
         });
    }

    currentPhotoSet.push({
      id: Date.now() + Math.random().toString(36).substr(2, 5),
      file,
      label: 'Before', // Default
      preview
    });
  }
  
  renderPhotoSetBuilder();
};

function renderPhotoSetBuilder() {
  const listEl = document.getElementById('photoSetList');
  const countEl = document.getElementById('photoSetCount');
  if (!listEl) return;
  
  if (countEl) countEl.textContent = `${currentPhotoSet.length} selected`;

  if (currentPhotoSet.length === 0) {
    listEl.innerHTML = `
      <div class="text-center text-gray-400 py-8 border-2 border-dashed border-gray-200 rounded-lg">
        No photos added yet.
      </div>`;
    return;
  }

  const LABELS = ['Before', 'During', 'After', 'Complete', 'Issue', 'Other'];

  listEl.innerHTML = currentPhotoSet.map(item => `
    <div class="flex items-center gap-4 bg-gray-50 p-2 rounded-lg border border-gray-200">
      <img src="${item.preview}" class="w-16 h-16 object-cover rounded-md flex-shrink-0" />
      <div class="flex-1 min-w-0">
        <select onchange="window.updatePhotoLabel('${item.id}', this.value)" class="w-full text-sm border border-gray-300 rounded px-2 py-1 bg-white">
          ${LABELS.map(l => `<option value="${l}" ${item.label === l ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <button onclick="window.removePhotoFromSet('${item.id}')" class="p-2 text-gray-400 hover:text-red-500">
        <i data-feather="trash-2" class="w-4 h-4"></i>
      </button>
    </div>
  `).join('');
  
  if (typeof feather !== 'undefined') feather.replace();
}

window.updatePhotoLabel = function(id, newVal) {
  const item = currentPhotoSet.find(i => i.id === id);
  if (item) item.label = newVal;
};

window.removePhotoFromSet = function(id) {
  currentPhotoSet = currentPhotoSet.filter(i => i.id !== id);
  renderPhotoSetBuilder();
};

window.sendPhotoSet = function() {
  if (currentPhotoSet.length === 0) {
    alert('Please add at least one photo.');
    return;
  }
  
  const caption = (document.getElementById('photoSetCaption')?.value || '').trim();
  
  const payload = {
    type: 'photoSet',
    setId: 'set_' + Date.now(),
    caption,
    photos: currentPhotoSet.map(p => ({
      src: p.preview,
      label: p.label
    }))
  };

  // Use existing helper to send message
  // We need to access logic inside script.js or trigger send
  // Since we are appending, we can assume access to 'sendMessage' function if global? 
  // checking... 'sendMessage' is internal to handling UI, but we have 'handleSend()'
  // best way is to inject into sendMessage flow or manual construct.
  // Actually, let's call existing logic.
  
  // Create message object manually and append
  const user = getCurrentUser(); // Assume global or need to find
  // Reuse existing logic from handleSend equivalent? 
  // Let's modify handleSend or duplicate logic to ensure consistency.
  // For safety, I'll access the current conversation ID and append directly via helper if possible.
  
  const urlParams = new URLSearchParams(window.location.search);
  const currentConvoId = urlParams.get('conversation');
  if (!currentConvoId) return;

  const msg = {
    id: Date.now(), // simple ID
    from: 'me',
    ...payload,
    ts: Date.now()
  };
  
  // Persist
  // We need to call internal save logic. 
  // BUT: script.js has 'DATA' var.
  // I will use localStorage manipulation to be safe, then reload UI logic?
  // Ideally, I should expose a 'sendExternalMessage' helper in script.js, but I'm appending.
  
  // Direct injection to localStorage for prototype
  const DATA = window.ATHStore.get('athMessagesData', {});
  if (DATA[currentConvoId]) {
    DATA[currentConvoId].messages.push(msg);
    // Update preview
    DATA[currentConvoId].preview = `📷 Photo Set: ${caption || (currentPhotoSet.length + ' photos')}`;
    DATA[currentConvoId].ts = msg.ts;
    window.ATHStore.set('athMessagesData', DATA);
    
    // Refresh UI
    if (typeof renderMessages === 'function') renderMessages();
    if (typeof renderConversations === 'function') renderConversations();
    if (typeof scrollToBottom === 'function') scrollToBottom();
  }
  
  window.closePhotoSetBuilder();
};
