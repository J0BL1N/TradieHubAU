// components/search-filter.js
// Data-driven filtering + rendering for browse pages.
//
// Public API:
//   window.ATHSearchFilter.initTradiesBrowse();
//   window.ATHSearchFilter.initCustomersBrowse();
//
// Requires:
//   - data.js defines window.TRADIES and window.CUSTOMERS
//   - feather-icons (optional)

(function () {
  'use strict';

  // ---------- Utilities ----------
  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function norm(str) {
    return String(str || '').trim().toLowerCase();
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getStateCode(locationStr) {
    // Expected: "City, ST" or "City, ST, Country" (best-effort)
    const parts = String(locationStr || '').split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) return '';
    const candidate = parts[parts.length - 1];
    // If last part is likely country, use second-to-last
    const last = candidate.toUpperCase();
    if (last === 'AUSTRALIA' && parts.length >= 3) {
      return parts[parts.length - 2].toUpperCase();
    }
    return candidate.toUpperCase();
  }

  function maybeFeatherReplace() {
    if (typeof feather !== 'undefined' && feather && typeof feather.replace === 'function') {
      feather.replace();
    }
  }

  // ---------- Reviews helpers (Batch M) ----------
  function parseLegacyReviewCount(input) {
    // Accepts legacy strings like "12 reviews" or "(12 reviews)" and returns a number.
    const s = String(input || '').trim();
    const m = s.match(/(\d+)/);
    return m ? Number(m[1]) : 0;
  }

  function getReviewCount(entity) {
    if (!entity) return 0;
    // Preferred: real reviews array
    if (Array.isArray(entity.reviews) && entity.reviews.length >= 0) return entity.reviews.length;
    // Preferred: explicit counter (keeps dataset light until real reviews are added)
    if (Number.isFinite(Number(entity.reviewCount))) return Number(entity.reviewCount);
    // Legacy customer field: "12 reviews"
    if (entity.reviews) return parseLegacyReviewCount(entity.reviews);
    return 0;
  }

  // ---------- Domain helpers ----------
  function tradieCategoryKey(tradeLabel) {
    const t = norm(tradeLabel);
    if (t.includes('plumb')) return 'plumber';
    if (t.includes('electric')) return 'electrician';
    if (t.includes('carpent')) return 'carpenter';
    if (t.includes('paint')) return 'painter';
    if (t.includes('build')) return 'builder';
    if (t.includes('landscape') || t.includes('garden')) return 'gardener';
    if (t.includes('clean')) return 'cleaner';
    if (t.includes('handy')) return 'handyman';
    return 'other';
  }

  function labelFromCategoryKey(key) {
    const map = {
      plumber: 'Plumber',
      electrician: 'Electrician',
      carpenter: 'Carpenter',
      painter: 'Painter',
      builder: 'Builder',
      gardener: 'Gardener',
      cleaner: 'Cleaner',
      handyman: 'Handyman',
      other: 'Other'
    };
    return map[key] || 'Other';
  }

  // ---------- Batch L: canonical trades/categories ----------
  const LEGACY_TO_CANONICAL_TRADE = {
    plumber: 'plumbing',
    electrician: 'electrical',
    carpenter: 'carpentry',
    painter: 'painting',
    builder: 'building',
    gardener: 'gardening',
    cleaner: 'cleaning',
    handyman: 'handyman',
    other: 'other'
  };

  function getTradeCatalog() {
    return Array.isArray(window.TRADE_CATEGORIES) ? window.TRADE_CATEGORIES : [];
  }

  function tradeLabelSafe(id) {
    if (typeof window.tradeLabel === 'function') return window.tradeLabel(id);
    const found = getTradeCatalog().find(t => t.id === String(id));
    return found ? found.label : (String(id || 'Other') || 'Other');
  }

  function normalizeTradieTrades(t) {
    if (!t) return ['other'];
    if (Array.isArray(t.trades) && t.trades.length) return t.trades.map(String);
    if (typeof window.inferTradeIdsFromText === 'function') {
      const inferred = window.inferTradeIdsFromText(t.trade || t.typeLabel || '');
      if (Array.isArray(inferred) && inferred.length) return inferred.map(String);
    }
    // fallback to legacy single-trade keys
    const legacy = tradieCategoryKey(t.trade || t.typeLabel || '');
    return [LEGACY_TO_CANONICAL_TRADE[legacy] || 'other'];
  }

  function normalizeJobCategories(job) {
    if (!job) return ['other'];
    if (Array.isArray(job.categories) && job.categories.length) return job.categories.map(String);
    if (job.category) {
      const maybe = String(job.category);
      // allow either label (e.g., "Plumbing") or id (e.g., "plumbing")
      const byId = getTradeCatalog().find(t => norm(t.id) === norm(maybe));
      if (byId) return [byId.id];
      const byLabel = getTradeCatalog().find(t => norm(t.label) === norm(maybe));
      if (byLabel) return [byLabel.id];
    }
    return ['other'];
  }

  // ---------- Rendering ----------
  function renderTradieCard(id, t) {
    const tradeIds = normalizeTradieTrades(t);
    const tradeLine = tradeIds.map(tradeLabelSafe).join(' • ');
    const tradeChips = tradeIds.map((tid) => (
      `<span class="inline-flex items-center px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">${escapeHtml(tradeLabelSafe(tid))}</span>`
    )).join('');
    const stars = Math.round(parseFloat(t.rating || '0'));
    const reviewCount = getReviewCount(t);
    const starIcons = Array.from({ length: 5 }).map((_, i) => {
      const filled = i < stars;
      const cls = filled ? 'fill-current' : '';
      return `<i data-feather="star" class="w-4 h-4 ${cls}"></i>`;
    }).join('');

    const verifiedPill = t.verified
      ? `<span class="bg-emerald-100 text-emerald-800 text-xs font-medium px-2.5 py-1 rounded-full flex items-center">
            <i data-feather="check-circle" class="w-3 h-3 mr-1"></i>
            Verified
         </span>`
      : `<span class="bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-1 rounded-full">Unverified</span>`;

    return `
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition">
        <div class="flex flex-col md:flex-row">
          <div class="flex items-start mb-4 md:mb-0">
            <img src="${escapeHtml(t.image)}" alt="${escapeHtml(t.name)}" class="w-20 h-20 rounded-xl object-cover border-2 border-teal-100">
            <div class="ml-4">
              <div class="flex items-center">
                <h3 class="text-lg font-bold text-gray-900">${escapeHtml(t.name)}</h3>
                <span class="ml-2">${verifiedPill}</span>
              </div>
              <p class="text-teal-600 font-medium">${escapeHtml(tradeLine || t.trade || 'Other')}</p>
              <div class="mt-2 flex flex-wrap gap-2">${tradeChips}</div>
              <div class="flex items-center mt-1">
                <div class="flex text-amber-400">${starIcons}</div>
                <span class="text-sm text-gray-600 ml-2">${escapeHtml(t.rating)} (${escapeHtml(String(reviewCount))})</span>
              </div>
              <div class="flex items-center mt-2 text-sm text-gray-600">
                <i data-feather="map-pin" class="w-4 h-4 mr-1"></i>
                ${escapeHtml(t.location)}
              </div>
            </div>
          </div>

          <div class="md:ml-auto flex flex-col items-start md:items-end">
            <div class="flex items-center space-x-3">
              <a href="profile-tradesman.html?id=${encodeURIComponent(id)}" class="bg-teal-50 text-teal-700 font-medium py-2 px-4 rounded-lg hover:bg-teal-100 transition text-sm">
                View Profile
              </a>
              <a href="messages.html?conversation=${encodeURIComponent(t.conversationId || id)}" class="bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-medium py-2 px-4 rounded-lg hover:opacity-90 transition text-sm">
                Contact
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCustomerCard(id, c) {
    const stars = Math.round(parseFloat(c.rating || '0'));
    const reviewCount = getReviewCount(c);
    const starIcons = Array.from({ length: 5 }).map((_, i) => {
      const filled = i < stars;
      const cls = filled ? 'fill-current' : '';
      return `<i data-feather="star" class="w-4 h-4 ${cls}"></i>`;
    }).join('');

    return `
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition">
        <div class="flex flex-col md:flex-row">
          <div class="flex items-start mb-4 md:mb-0">
            <img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.name)}" class="w-20 h-20 rounded-xl object-cover border-2 border-teal-100">
            <div class="ml-4">
              <div class="flex items-center">
                <h3 class="text-lg font-bold text-gray-900">${escapeHtml(c.name)}</h3>
                <span class="ml-2 ${escapeHtml(c.typeColor || 'bg-gray-500')} text-white text-xs font-medium px-2.5 py-1 rounded-full">${escapeHtml(c.typeLabel || 'Customer')}</span>
              </div>
              <p class="text-gray-600">${escapeHtml(c.tagline || '')}</p>
              <div class="flex items-center mt-1">
                <div class="flex text-amber-400">${starIcons}</div>
                <span class="text-sm text-gray-600 ml-2">${escapeHtml(c.rating)} • ${escapeHtml(String(reviewCount))} reviews</span>
              </div>
              <div class="flex items-center mt-2 text-sm text-gray-600">
                <i data-feather="map-pin" class="w-4 h-4 mr-1"></i>
                ${escapeHtml(c.location)}
              </div>
            </div>
          </div>

          <div class="md:ml-auto flex flex-col items-start md:items-end">
            <div class="flex items-center space-x-3">
              <a href="profile-customer.html?id=${encodeURIComponent(id)}" class="bg-teal-50 text-teal-700 font-medium py-2 px-4 rounded-lg hover:bg-teal-100 transition text-sm">
                View Profile
              </a>
              <a href="messages.html?conversation=${encodeURIComponent(c.conversationId || id)}" class="bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-medium py-2 px-4 rounded-lg hover:opacity-90 transition text-sm">
                Contact
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- Filtering logic ----------
  function buildCategoryCountsFromTradies(tradies) {
    const counts = {};
    Object.values(tradies).forEach(t => {
      normalizeTradieTrades(t).forEach((tid) => {
        const key = String(tid || 'other');
        counts[key] = (counts[key] || 0) + 1;
      });
    });
    return counts;
  }

  function applyFilters(items, opts) {
    const search = norm(opts.search);
    const categories = new Set((opts.categories || []).map(v => String(v)));
    // Batch N1: Trade match mode
    //   - exact (default): tradie trades must match selected set exactly (no more, no less)
    //   - any: tradie must have at least one selected trade
    const matchMode = (opts.matchMode === 'any') ? 'any' : 'exact';
    const state = norm(opts.state);
    const minRating = Number(opts.minRating || 0);
    const requireVerified = !!opts.requireVerified;

    return items.filter(({ data }) => {
      const name = norm(data.name);
      const location = norm(data.location);
      const about = norm(data.about || data.tagline || '');
      const tradeLine = normalizeTradieTrades(data).map(tradeLabelSafe).join(' ');

      if (search) {
        const hay = `${name} ${tradeLine} ${location} ${about}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }

      if (categories.size) {
        const tlist = normalizeTradieTrades(data).map(String);
        const tset = new Set(tlist);
        if (matchMode === 'exact') {
          // Exact: tradie must have the same set of trades as selected (no more, no less)
          if (tset.size !== categories.size) return false;
          for (const c of categories) {
            if (!tset.has(c)) return false;
          }
        } else {
          // Any: tradie must have at least one selected trade tag
          let ok = false;
          categories.forEach((c) => { if (tset.has(c)) ok = true; });
          if (!ok) return false;
        }
      }

      if (state && state !== 'all') {
        const code = norm(getStateCode(data.location));
        if (code !== state) return false;
      }

      const rating = Number(data.rating || 0);
      if (rating < minRating) return false;

      if (requireVerified && data.verified === false) return false;

      return true;
    });
  }

  function readTradiesFilterControls() {
    const searchInput = qs('#athFilterSearch');
    const categoryBoxes = qsa('input[name="athCategory"]');
    const stateSelect = qs('#athFilterState');
    const ratingRange = qs('#athFilterRating');
    const verifiedBox = qs('#athFilterVerified');

    const stored = (() => {
      try { return localStorage.getItem('athTradeFilterMode'); } catch { return null; }
    })();
    const mode = (stored === 'any' || stored === 'exact') ? stored : 'exact';

    return {
      search: searchInput ? searchInput.value : '',
      categories: categoryBoxes.filter(b => b.checked).map(b => b.value),
      state: stateSelect ? stateSelect.value : 'all',
      minRating: ratingRange ? ratingRange.value : 0,
      requireVerified: verifiedBox ? verifiedBox.checked : false,
      matchMode: mode
    };
  }

  function readCustomersFilterControls() {
    const searchInput = qs('#athFilterSearch');
    const typeBoxes = qsa('input[name="athCustomerType"]');
    const stateSelect = qs('#athFilterState');

    return {
      search: searchInput ? searchInput.value : '',
      // reuse the same "categories" field to keep applyFilters generic
      categories: typeBoxes.filter(b => b.checked).map(b => b.value),
      state: stateSelect ? stateSelect.value : 'all',
      minRating: 0,
      requireVerified: false
    };
  }

  // ---------- Browse: Tradies ----------
  function initTradiesBrowse() {
    const tradies = window.TRADIES;
    if (!tradies) {
      console.warn('[ATH] window.TRADIES not found. Did you include data.js before components/search-filter.js?');
      return;
    }

    const resultsEl = qs('#athResults');
    const countEl = qs('#athResultsCount');
    const categoryEl = qs('#athCategoryList');

    if (!resultsEl || !countEl || !categoryEl) {
      console.warn('[ATH] Missing required DOM hooks for tradies browse.');
      return;
    }

    // Build category checkboxes from canonical trade list
    const counts = buildCategoryCountsFromTradies(tradies);
    const keys = getTradeCatalog().length ? getTradeCatalog().map(t => t.id) : Object.keys(counts);

    categoryEl.innerHTML = keys.map((k) => {
      const label = tradeLabelSafe(k);
      return `
        <label class="flex items-center">
          <input type="checkbox" name="athCategory" value="${escapeHtml(k)}" class="rounded border-gray-300 text-teal-600 focus:ring-teal-500">
          <span class="ml-2 text-sm text-gray-600">${escapeHtml(label)}</span>
          <span class="ml-auto text-xs text-gray-500">${counts[k] || 0}</span>
        </label>
      `;
    }).join('');

    // Batch N1: Trade filter mode (Exact match default, optional broaden results)
    // Checkbox ON => mode = any
    const matchAnyBox = qs('#athTradeMatchAny');
    const setMode = (mode) => {
      const m = (mode === 'any') ? 'any' : 'exact';
      try { localStorage.setItem('athTradeFilterMode', m); } catch { /* ignore */ }
      if (matchAnyBox) matchAnyBox.checked = (m === 'any');
    };
    if (matchAnyBox) {
      matchAnyBox.addEventListener('change', () => {
        setMode(matchAnyBox.checked ? 'any' : 'exact');
        render();
      });
    }
    // Initialize UI from stored preference
    setMode((() => { try { return localStorage.getItem('athTradeFilterMode'); } catch { return 'exact'; } })());

    const items = Object.entries(tradies).map(([id, data]) => ({ id, data }));

    function render() {
      const opts = readTradiesFilterControls();
      const ratingLabel = qs('#athRatingValue');
      if (ratingLabel) ratingLabel.textContent = Number(opts.minRating || 0).toFixed(1);
      const filtered = applyFilters(items, opts);

      resultsEl.innerHTML = filtered.map(({ id, data }) => renderTradieCard(id, data)).join('');
      countEl.textContent = String(filtered.length);
      maybeFeatherReplace();
    }

    // Bind events
    ['#athFilterSearch', '#athFilterState', '#athFilterRating', '#athFilterVerified'].forEach(sel => {
      const el = qs(sel);
      if (el) {
        el.addEventListener('input', render);
        el.addEventListener('change', render);
      }
    });

    qsa('input[name="athCategory"]', categoryEl).forEach(box => {
      box.addEventListener('change', render);
    });

    const clearBtn = qs('#athClearAll');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const search = qs('#athFilterSearch');
        const state = qs('#athFilterState');
        const rating = qs('#athFilterRating');
        const verified = qs('#athFilterVerified');

        if (search) search.value = '';
        if (state) state.value = 'all';
        if (rating) rating.value = '0';
        if (verified) verified.checked = false;
        qsa('input[name="athCategory"]', categoryEl).forEach(b => (b.checked = false));
        render();
      });
    }

    render();
  }

  // ---------- Browse: Customers ----------
  function initCustomersBrowse() {
    const customers = window.CUSTOMERS;
    if (!customers) {
      console.warn('[ATH] window.CUSTOMERS not found. Did you include data.js before components/search-filter.js?');
      return;
    }

    const resultsEl = qs('#athResults');
    const countEl = qs('#athResultsCount');
    const typeEl = qs('#athCustomerTypeList');

    if (!resultsEl || !countEl || !typeEl) {
      console.warn('[ATH] Missing required DOM hooks for customers browse.');
      return;
    }

    // Build type checkboxes from data
    const counts = {};
    Object.values(customers).forEach(c => {
      const key = norm(c.typeLabel || 'customer')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      counts[key] = counts[key] || { label: c.typeLabel || 'Customer', count: 0 };
      counts[key].count += 1;
    });

    const typeKeys = Object.keys(counts).sort((a, b) => counts[b].count - counts[a].count);

    typeEl.innerHTML = typeKeys.map(k => {
      const entry = counts[k];
      return `
        <label class="flex items-center">
          <input type="checkbox" name="athCustomerType" value="${escapeHtml(k)}" class="rounded border-gray-300 text-teal-600 focus:ring-teal-500">
          <span class="ml-2 text-sm text-gray-600">${escapeHtml(entry.label)}</span>
          <span class="ml-auto text-xs text-gray-500">${entry.count}</span>
        </label>
      `;
    }).join('');

    const items = Object.entries(customers).map(([id, data]) => {
      const typeKey = norm(data.typeLabel || 'customer')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      return { id, data: { ...data, trade: typeKey } }; // store typeKey into trade for generic filter
    });

    function render() {
      const raw = readCustomersFilterControls();

      // Map customer types into categories and filter manually (typeKey stored in "trade")
      const search = norm(raw.search);
      const types = new Set((raw.categories || []).map(norm));
      const state = norm(raw.state);

      const filtered = items.filter(({ data }) => {
        const name = norm(data.name);
        const loc = norm(data.location);
        const about = norm(data.about || data.tagline || '');
        const typeKey = norm(data.trade || '');

        if (search) {
          const hay = `${name} ${loc} ${about}`;
          if (!hay.includes(search)) return false;
        }

        if (types.size && !types.has(typeKey)) return false;

        if (state && state !== 'all') {
          const code = norm(getStateCode(data.location));
          if (code !== state) return false;
        }

        return true;
      });

      resultsEl.innerHTML = filtered.map(({ id, data }) => {
        // Remove the injected typeKey into "trade" before rendering
        const clean = { ...data };
        delete clean.trade;
        return renderCustomerCard(id, clean);
      }).join('');

      countEl.textContent = String(filtered.length);
      maybeFeatherReplace();
    }

    ['#athFilterSearch', '#athFilterState'].forEach(sel => {
      const el = qs(sel);
      if (el) {
        el.addEventListener('input', render);
        el.addEventListener('change', render);
      }
    });

    qsa('input[name="athCustomerType"]', typeEl).forEach(box => {
      box.addEventListener('change', render);
    });

    const clearBtn = qs('#athClearAll');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const search = qs('#athFilterSearch');
        const state = qs('#athFilterState');
        if (search) search.value = '';
        if (state) state.value = 'all';
        qsa('input[name="athCustomerType"]', typeEl).forEach(b => (b.checked = false));
        render();
      });
    }

    render();
  }

  // --------------------------
  // Jobs Board
  // --------------------------
  function formatMoney(n) {
    const x = Number(n || 0);
    if (!isFinite(x) || x <= 0) return '$0';
    return '$' + Math.round(x).toLocaleString('en-AU');
  }

  function compactMoney(n) {
    const x = Number(n || 0);
    if (!isFinite(x) || x <= 0) return '$0';
    if (x >= 1000) return '$' + (x / 1000).toFixed(0) + 'k';
    return '$' + Math.round(x);
  }

  function budgetLabel(job) {
    const min = Number(job.budgetMin || 0);
    const max = Number(job.budgetMax || 0);
    if (min && max && min !== max) return `${formatMoney(min)} - ${formatMoney(max)}`;
    if (max) return `${formatMoney(max)}`;
    if (min) return `${formatMoney(min)}`;
    return 'Negotiable';
  }

  function urgencyPill(urgency) {
    const u = norm(urgency);
    if (u === 'urgent') return 'bg-red-100 text-red-800';
    if (u === 'week') return 'bg-amber-100 text-amber-800';
    return 'bg-gray-100 text-gray-700';
  }

  function jobTypePill(type) {
    const t = norm(type);
    if (t === 'contract') return 'bg-purple-100 text-purple-800';
    if (t === 'ongoing') return 'bg-blue-100 text-blue-800';
    return 'bg-green-100 text-green-800';
  }



  // ---------- Timeline formatting (v0.025) ----------
  function parsePreferredDateFromTimeline(timeline) {
    const raw = String(timeline || '').trim();
    const m = raw.match(/^preferred\s*:\s*(\d{4}-\d{2}-\d{2})/i);
    return m ? m[1] : '';
  }

  function formatExactPreferredDate(ymd) {
    const d = new Date(String(ymd || '').trim());
    if (isNaN(d.getTime())) return '';
    try {
      return d.toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return String(ymd || '');
    }
  }

  function formatRelativePreferredDate(ymd) {
    const d = new Date(String(ymd || '').trim());
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((end - start) / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return 'Past due';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `In ${diffDays} days`;
    if (diffDays < 35) {
      const weeks = Math.round(diffDays / 7);
      return `In ${weeks} week${weeks === 1 ? '' : 's'}`;
    }
    const months = Math.round(diffDays / 30);
    return `In ${months} month${months === 1 ? '' : 's'}`;
  }

  function timelineChip(job) {
    const tl = String(job?.timeline || '').trim();
    const ymd = parsePreferredDateFromTimeline(tl);
    if (!ymd) {
      return { kind: 'flex', label: tl || 'Flexible', exact: '' };
    }
    return {
      kind: 'preferred',
      label: formatRelativePreferredDate(ymd) || 'Preferred',
      exact: formatExactPreferredDate(ymd) || ymd
    };
  }

  function readPostedJobsFromStorage() {
    try {
      const raw = localStorage.getItem('athPostedJobs');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function mapPostedJobToCanonical(j) {
    const state = (j.state || '').toString().trim().toUpperCase();
    const budget = (j.budget === 0 || j.budget) ? Number(j.budget) : null;
    // Batch L: support multi-category jobs (categories: string[] of trade IDs)
    const postedCats = Array.isArray(j.categories) ? j.categories
      : (j.categories ? String(j.categories).split(',') : (j.category ? [j.category] : []));
    const categories = postedCats.map(s => String(s).trim()).filter(Boolean);
    const normalizedCategories = categories.length ? categories.flatMap((c) => normalizeJobCategories({ category: c })) : ['other'];

    return {
      id: String(j.id || `posted-${Date.now()}`),
      title: String(j.title || 'Untitled Job'),
      description: String(j.description || ''),
      categories: Array.from(new Set(normalizedCategories)),
      location: state ? `Australia, ${state}` : 'Australia',
      state: state || 'ALL',
      budgetMin: budget || 0,
      budgetMax: budget || 0,
      timeline: j.date ? `Preferred: ${j.date}` : 'Flexible',
      urgency: 'flexible',
      type: 'one-off',
      quotes: 0,
      customerId: 'michael-roberts',
      postedAt: j.createdAt || new Date().toISOString(),
      status: 'open',
      _source: 'local'
    };
  }

  function initJobsBoard() {
    const resultsEl = qs('#athJobResults');
    const countEl = qs('#athJobResultsCount');
    const paginationEl = qs('#athJobPagination');
    const sortEl = qs('#athJobSort');
    const clearBtn = qs('#athJobClearAll');
    const modal = qs('#athJobModal');
    const modalTitle = qs('#athJobModalTitle');
    const modalBody = qs('#athJobModalBody');
    const modalClose = qs('#athJobModalClose');

    if (!resultsEl || !countEl || !paginationEl) return; // not on jobs page

    const customers = (window.CUSTOMERS && typeof window.CUSTOMERS === 'object') ? window.CUSTOMERS : {};

    // v0.012: use shared jobs module when available
    const allJobs = (window.ATHJobs && typeof window.ATHJobs.getAllJobs === 'function')
      ? window.ATHJobs.getAllJobs()
      : (function fallbackBuildJobs() {
          const baseJobs = Array.isArray(window.JOBS) ? window.JOBS : [];
          const posted = readPostedJobsFromStorage().map(mapPostedJobToCanonical);
          const byId = new Map();
          [...posted, ...baseJobs].forEach((j) => {
            if (!j || !j.id) return;
            byId.set(String(j.id), j);
          });
          return Array.from(byId.values());
        })();

    // v0.012: state accessors (delegate to ATHJobs if present)
    function getJobState(jobId) {
      if (window.ATHJobs && typeof window.ATHJobs.getJobState === 'function') return window.ATHJobs.getJobState(jobId);
      return {};
    }

    function setJobState(jobId, patch) {
      if (window.ATHJobs && typeof window.ATHJobs.setJobState === 'function') return window.ATHJobs.setJobState(jobId, patch);
      return patch || {};
    }


    // Stats (top cards)
    const statActive = qs('#athJobStatActive');
    const statValue = qs('#athJobStatValue');
    const statUrgent = qs('#athJobStatUrgent');

    function computeTotalValue(jobs) {
      return jobs.reduce((acc, j) => {
        const min = Number(j.budgetMin || 0);
        const max = Number(j.budgetMax || 0);
        const v = max || min || 0;
        return acc + (isFinite(v) ? v : 0);
      }, 0);
    }

    function renderStats() {
      if (statActive) statActive.textContent = String(allJobs.length);
      if (statUrgent) statUrgent.textContent = String(allJobs.filter(j => norm(j.urgency) === 'urgent').length);
      if (statValue) statValue.textContent = compactMoney(computeTotalValue(allJobs));
    }
    renderStats();

    // Build category list dynamically + counts
    const catWrap = qs('#athJobCategoryList');
    function rebuildCategoryList(filteredJobs) {
      if (!catWrap) return;
      const selected = new Set(qsa('input[name="athJobCategory"]', catWrap).filter(b => b.checked).map(b => b.value));
      const counts = {};
      filteredJobs.forEach((j) => {
        normalizeJobCategories(j).forEach((cid) => {
          const c = String(cid || 'other');
          counts[c] = (counts[c] || 0) + 1;
        });
      });

      const allCats = getTradeCatalog().length ? getTradeCatalog().map(t => t.id) : Object.keys(counts).sort((a, b) => a.localeCompare(b));
      catWrap.innerHTML = allCats.map((c) => {
        const checked = selected.has(c) ? 'checked' : '';
        const label = tradeLabelSafe(c);
        const n = counts[c] || 0;
        return `
          <label class="flex items-center">
            <input type="checkbox" name="athJobCategory" value="${escapeHtml(c)}" class="rounded border-gray-300 text-teal-600 focus:ring-teal-500" ${checked}>
            <span class="ml-2 text-sm text-gray-600">${escapeHtml(label)}</span>
            <span class="ml-auto text-xs text-gray-500">${n}</span>
          </label>`;
      }).join('');
      qsa('input[name="athJobCategory"]', catWrap).forEach((box) => {
        box.addEventListener('change', () => {
          state.page = 1;
          render();
        });
      });
      maybeFeatherReplace();
    }

    // Saved jobs + applications
    function readJson(key, fallback) {
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
      localStorage.setItem(key, JSON.stringify(value));
    }

    // ----------------------------
    // Batch N2: Reviews (localStorage)
    // ----------------------------
    const REVIEWS_KEY = 'athReviews';

    function readReviews() {
      const arr = readJson(REVIEWS_KEY, []);
      return Array.isArray(arr) ? arr : [];
    }

    function writeReviews(list) {
      writeJson(REVIEWS_KEY, Array.isArray(list) ? list : []);
    }

    function computePairKey(job) {
      const c = String(job.customerId || '');
      const t = String(job.assignedTradieId || '');
      return `${job.id}:${c}:${t}`;
    }

    function publishIfCompletePair(job) {
      const pairKey = computePairKey(job);
      if (!pairKey || pairKey.endsWith('::')) return;
      const list = readReviews();
      const cust = list.find(r => r.pairKey === pairKey && r.reviewerRole === 'customer');
      const trad = list.find(r => r.pairKey === pairKey && r.reviewerRole === 'tradie');
      if (cust && trad) {
        const updated = list.map(r => {
          if (r.pairKey === pairKey) return { ...r, visibility: 'published', publishedAt: r.publishedAt || new Date().toISOString() };
          return r;
        });
        writeReviews(updated);
        return true;
      }
      return false;
    }

    function isPublished(r, jobCompletedAt) {
      if (!r) return false;
      if (r.visibility === 'published') return true;
      // double-blind timeout: publish after 7 days from completion
      const base = Date.parse(jobCompletedAt || r.completedAt || '') || 0;
      if (!base) return false;
      const age = Date.now() - base;
      return age >= 7 * 24 * 60 * 60 * 1000;
    }

    function getSavedSet() {
      const arr = readJson('athSavedJobs', []);
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    }

    function toggleSaved(id) {
      const set = getSavedSet();
      const sid = String(id);
      if (set.has(sid)) set.delete(sid);
      else set.add(sid);
      writeJson('athSavedJobs', Array.from(set));
    }

    function removeSaved(id) {
      const set = getSavedSet();
      const sid = String(id);
      if (!set.has(sid)) return;
      set.delete(sid);
      writeJson('athSavedJobs', Array.from(set));
    }

    function deleteLocalJobArtifacts(jobId) {
      const jid = String(jobId);

      // Remove state overrides (completion photos, confirmations, assigned tradie, etc.)
      const stateKey = (window.ATHJobs && window.ATHJobs.JOB_STATE_KEY) ? window.ATHJobs.JOB_STATE_KEY : 'athJobState';
      const st = readJson(stateKey, {});
      if (st && typeof st === 'object' && st[jid]) {
        delete st[jid];
        writeJson(stateKey, st);
      }

      // Remove applications (demo)
      const apps = readJson('athJobApplications', []);
      if (Array.isArray(apps)) {
        const next = apps.filter(a => String(a?.jobId) !== jid);
        if (next.length !== apps.length) writeJson('athJobApplications', next);
      }

      // Remove reviews (double-blind)
      const reviews = readJson('athReviews', []);
      if (Array.isArray(reviews)) {
        const next = reviews.filter(r => String(r?.jobId) !== jid);
        if (next.length !== reviews.length) writeJson('athReviews', next);
      }

      // Remove saved flag
      removeSaved(jid);
    }

    function deleteLocalPostedJob(job) {
      if (!job || !job.id) return false;

      const me = (window.getCurrentUser && typeof window.getCurrentUser === 'function')
        ? window.getCurrentUser()
        : { id: 'me', role: 'dual' };
      const isOwner = String(me.id) === String(job.customerId);
      const isLocal = String(job._source || '') === 'local';
      if (!isOwner || !isLocal) return false;

      const key = (window.ATHJobs && window.ATHJobs.POSTED_JOBS_KEY) ? window.ATHJobs.POSTED_JOBS_KEY : 'athPostedJobs';
      const posted = readJson(key, []);
      const list = Array.isArray(posted) ? posted : [];
      const next = list.filter(x => String(x?.id) !== String(job.id));
      writeJson(key, next);

      deleteLocalJobArtifacts(job.id);

      // Remove from in-memory list so the UI updates instantly
      const idx = allJobs.findIndex(j => String(j?.id) === String(job.id));
      if (idx >= 0) allJobs.splice(idx, 1);
      return true;
    }

    function openModal(title, bodyHtml) {
      if (!modal || !modalTitle || !modalBody) return;
      modalTitle.textContent = title;
      modalBody.innerHTML = bodyHtml;
      modal.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
      maybeFeatherReplace();
    }

    function closeModal() {
      if (!modal) return;
      modal.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    }

    modalClose?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // Filter state
    const state = {
      page: 1,
      pageSize: 6
    };

    function readControls() {
      const search = qs('#athJobSearch')?.value || '';
      const cats = qsa('input[name="athJobCategory"]').filter(b => b.checked).map(b => b.value);
      const loc = qs('#athJobLocation')?.value || 'all';
      const budget = qs('input[name="athJobBudget"]:checked')?.value || 'any';
      const urgency = qsa('input[name="athJobUrgency"]').filter(b => b.checked).map(b => b.value);
      const types = qsa('input[name="athJobType"]').filter(b => b.checked).map(b => b.value);
      const sort = sortEl?.value || 'recent';
      return { search, cats, loc, budget, urgency, types, sort };
    }

    function matchesBudget(job, bucket) {
      const min = Number(job.budgetMin || 0);
      const max = Number(job.budgetMax || 0);
      const val = max || min || 0;
      if (bucket === 'any') return true;
      if (!val) return bucket === 'any';
      if (bucket === 'under500') return val < 500;
      if (bucket === '500-2000') return val >= 500 && val <= 2000;
      if (bucket === '2000-10000') return val > 2000 && val <= 10000;
      if (bucket === '10000plus') return val > 10000;
      return true;
    }

    function filterJobs(ctrl) {
      const q = norm(ctrl.search);
      const catSet = new Set((ctrl.cats || []).map(String));
      const urgSet = new Set((ctrl.urgency || []).map(norm));
      const typeSet = new Set((ctrl.types || []).map(norm));
      const loc = norm(ctrl.loc);

      return allJobs.filter((j) => {
        if (j.status && norm(j.status) !== 'open') return false;

        if (q) {
          const cust = customers?.[j.customerId]?.name || '';
          const catLine = normalizeJobCategories(j).map(tradeLabelSafe).join(' ');
          const hay = `${j.title} ${j.description} ${catLine} ${j.location} ${cust}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }

        if (catSet.size) {
          const jcats = new Set(normalizeJobCategories(j).map(String));
          let ok = false;
          catSet.forEach((c) => { if (jcats.has(c)) ok = true; });
          if (!ok) return false;
        }

        if (loc && loc !== 'all') {
          const code = norm(j.state || getStateCode(j.location));
          if (code !== loc) return false;
        }

        if (!matchesBudget(j, ctrl.budget)) return false;

        if (urgSet.size) {
          if (!urgSet.has(norm(j.urgency || 'flexible'))) return false;
        }

        if (typeSet.size) {
          if (!typeSet.has(norm(j.type || 'one-off'))) return false;
        }

        return true;
      });
    }

    function sortJobs(jobs, sortKey) {
      const s = norm(sortKey);
      const copy = [...jobs];
      if (s === 'highest') {
        copy.sort((a, b) => (Number(b.budgetMax || b.budgetMin || 0) - Number(a.budgetMax || a.budgetMin || 0)));
        return copy;
      }
      if (s === 'urgent') {
        const score = (j) => (norm(j.urgency) === 'urgent' ? 2 : norm(j.urgency) === 'week' ? 1 : 0);
        copy.sort((a, b) => score(b) - score(a));
        return copy;
      }
      // recent
      copy.sort((a, b) => {
        const ta = Date.parse(a.postedAt || '') || 0;
        const tb = Date.parse(b.postedAt || '') || 0;
        return tb - ta;
      });
      return copy;
    }

    function customerPreview(job) {
      const c = customers?.[job.customerId];
      if (!c) return '';
      const reviewCount = getReviewCount(c);
      const stars = Math.round(parseFloat(c.rating || '0'));
      const starIcons = Array.from({ length: 5 }).map((_, i) => {
        const filled = i < stars;
        const cls = filled ? 'fill-current' : '';
        return `<i data-feather="star" class="w-3 h-3 ${cls}"></i>`;
      }).join('');
      return `
        <div class="flex items-center p-3 bg-gray-50 rounded-lg">
          <img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.name)}" class="w-8 h-8 rounded-full mr-3">
          <div>
            <p class="text-sm font-medium text-gray-900">${escapeHtml(c.name)}</p>
            <div class="flex items-center">
              <div class="flex text-amber-400">${starIcons}</div>
              <span class="ml-1 text-xs text-gray-600">${escapeHtml(c.rating)} (${escapeHtml(String(reviewCount))})</span>
            </div>
          </div>
        </div>`;
    }

    function renderJobCard(job) {
      const saved = getSavedSet().has(String(job.id));
      const catIds = normalizeJobCategories(job);
      const catLine = catIds.map(tradeLabelSafe).join(' • ');
      const catChips = catIds.map((cid) => (
        `<span class="inline-flex items-center px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">${escapeHtml(tradeLabelSafe(cid))}</span>`
      )).join('');
      const badgeUrg = urgencyPill(job.urgency);
      const badgeType = jobTypePill(job.type);
      const posted = job.postedAt ? new Date(job.postedAt) : null;
      const postedLabel = posted && !isNaN(posted.getTime()) ? posted.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' }) : '—';
      const tl = timelineChip(job);
      const me = (window.getCurrentUser && typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : { id: 'me', role: 'dual' };
      const isOwner = String(me.id) === String(job.customerId);
      const canEdit = isOwner && String(job._source || '') === 'local';
      const primaryAction = canEdit
        ? `<button data-job-action="edit" data-job-id="${escapeHtml(job.id)}" class="flex-1 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-medium py-2 px-4 rounded-lg hover:opacity-90 transition text-center text-sm">Edit Job</button>`
        : (isOwner
            ? `<button type="button" class="flex-1 bg-gray-100 text-gray-400 font-medium py-2 px-4 rounded-lg text-center text-sm cursor-not-allowed" disabled>Can't apply</button>`
            : `<button data-job-action="apply" data-job-id="${escapeHtml(job.id)}" class="flex-1 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-medium py-2 px-4 rounded-lg hover:opacity-90 transition text-center text-sm">Apply Now</button>`);

      const deleteBtn = canEdit
        ? `
        <button data-job-action="delete" data-job-id="${escapeHtml(job.id)}" class="w-full flex items-center justify-center text-red-600 hover:text-red-700 text-sm font-medium">
          <i data-feather="trash-2" class="w-4 h-4 mr-1"></i>
          Delete Job
        </button>`
        : '';

      const actions = `
        <div class="flex space-x-2">
          <button data-job-action="details" data-job-id="${escapeHtml(job.id)}" class="flex-1 bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-lg hover:bg-gray-200 transition text-center text-sm">View Details</button>
          ${primaryAction}
        </div>
        <div class="mt-4 space-y-2">
          ${deleteBtn}
          <button data-job-action="save" data-job-id="${escapeHtml(job.id)}" class="w-full flex items-center justify-center ${saved ? 'text-emerald-600 hover:text-emerald-700' : 'text-teal-600 hover:text-teal-700'} text-sm font-medium">
            <i data-feather="bookmark" class="w-4 h-4 mr-1"></i>
            ${saved ? 'Saved' : 'Save Job'}
          </button>
        </div>`;

      return `
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition duration-300 p-5">
          <div class="flex flex-col md:flex-row md:items-start gap-5">
            <div class="md:w-2/3">
              <div class="flex items-start justify-between mb-3">
                <div>
                  <h3 class="font-bold text-lg text-gray-900 mb-1">${escapeHtml(job.title)}</h3>
                  <div class="flex items-center text-sm text-gray-600 mb-2">
                    <i data-feather="map-pin" class="w-4 h-4 mr-1"></i>
                    <span>${escapeHtml(job.location)} • Posted ${escapeHtml(postedLabel)}</span>
                  </div>
                </div>
                <div class="flex gap-2">
                  <span class="${badgeUrg} text-xs font-semibold px-3 py-1 rounded-full">${escapeHtml(norm(job.urgency) === 'urgent' ? 'Urgent' : norm(job.urgency) === 'week' ? 'This Week' : 'Flexible')}</span>
                  <span class="${badgeType} text-xs font-semibold px-3 py-1 rounded-full">${escapeHtml(String(job.type || 'One-off'))}</span>
                </div>
              </div>

              <p class="text-gray-600 mb-4">${escapeHtml((window.ATHIntegrity && typeof window.ATHIntegrity.sanitizeTextSync === 'function' ? window.ATHIntegrity.sanitizeTextSync(job.description || '').text : job.description || ''))}</p>

              <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div class="bg-gray-50 p-3 rounded-lg">
                  <p class="text-xs text-gray-500">Budget</p>
                  <p class="font-bold text-gray-900">${escapeHtml(budgetLabel(job))}</p>
                </div>
                <div class="bg-gray-50 p-3 rounded-lg">
                  <p class="text-xs text-gray-500">Timeline</p>
                  <div class="mt-1">
                    <div class="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">${escapeHtml(tl.label || 'Flexible')}</div>
                    ${tl.exact ? `<div class="text-xs text-gray-500 mt-1">${escapeHtml(tl.exact)}</div>` : ''}
                  </div>
                </div>
                <div class="bg-gray-50 p-3 rounded-lg">
                  <p class="text-xs text-gray-500">Categories</p>
                  <div class="mt-1 flex flex-wrap gap-2">${catChips}</div>
                </div>
                <div class="bg-gray-50 p-3 rounded-lg">
                  <p class="text-xs text-gray-500">Quotes</p>
                  <p class="font-bold text-gray-900">${escapeHtml(String(job.quotes || 0))}</p>
                </div>
              </div>
              ${customerPreview(job)}
            </div>

            <div class="md:w-1/3">
              <div class="space-y-3">
                <div class="flex items-center text-sm text-gray-600">
                  <i data-feather="briefcase" class="w-4 h-4 text-teal-500 mr-1"></i>
                  <span class="font-medium">${escapeHtml(catLine || 'Other')}</span>
                </div>
                <div class="flex items-center text-sm text-gray-600">
                  <i data-feather="check-circle" class="w-4 h-4 text-green-500 mr-1"></i>
                  <span>Verified customer • Demo</span>
                </div>
                ${actions}
              </div>
            </div>
          </div>
        </div>`;
    }

    function renderPagination(total, page, pageSize) {
      const pages = Math.max(1, Math.ceil(total / pageSize));
      if (pages <= 1) {
        paginationEl.innerHTML = '';
        return;
      }
      const clampPage = Math.min(Math.max(1, page), pages);
      state.page = clampPage;
      const nums = [];
      const start = Math.max(1, clampPage - 2);
      const end = Math.min(pages, clampPage + 2);
      for (let p = start; p <= end; p++) nums.push(p);

      paginationEl.innerHTML = `
        <div class="flex items-center justify-center gap-2">
          <button data-page="prev" class="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 ${clampPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}">Prev</button>
          ${start > 1 ? `<button data-page="1" class="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">1</button><span class="px-1 text-gray-400">…</span>` : ''}
          ${nums.map(p => `<button data-page="${p}" class="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 ${p === clampPage ? 'bg-teal-50 border-teal-300 text-teal-700 font-semibold' : ''}">${p}</button>`).join('')}
          ${end < pages ? `<span class="px-1 text-gray-400">…</span><button data-page="${pages}" class="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">${pages}</button>` : ''}
          <button data-page="next" class="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 ${clampPage === pages ? 'opacity-50 cursor-not-allowed' : ''}">Next</button>
        </div>`;

      qsa('button[data-page]', paginationEl).forEach((btn) => {
        btn.addEventListener('click', () => {
          const v = btn.getAttribute('data-page');
          const pagesTotal = Math.max(1, Math.ceil(total / pageSize));
          if (v === 'prev') state.page = Math.max(1, state.page - 1);
          else if (v === 'next') state.page = Math.min(pagesTotal, state.page + 1);
          else state.page = Number(v) || 1;
          render();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });
    }

    function bindResultActions() {
      qsa('[data-job-action]', resultsEl).forEach((el) => {
        el.addEventListener('click', () => {
          const action = el.getAttribute('data-job-action');
          const id = el.getAttribute('data-job-id');
          const job = allJobs.find(j => String(j.id) === String(id));
          if (!job) return;

          const catIds = normalizeJobCategories(job);
          const catChips = catIds.map((cid) => (
            `<span class="inline-flex items-center px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">${escapeHtml(tradeLabelSafe(cid))}</span>`
          )).join('');

          if (action === 'save') {
            toggleSaved(job.id);
            render();
            return;
          }

          if (action === 'delete') {
            const ok = confirm('Delete this job? This cannot be undone.');
            if (!ok) return;
            const deleted = deleteLocalPostedJob(job);
            if (!deleted) {
              alert('You can only delete jobs you posted on this device.');
              return;
            }
            closeModal();
            render();
            return;
          }

          if (action === 'details') {
            const c = customers?.[job.customerId];
            openModal(job.title, `
              <div class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <p class="text-xs text-gray-500">Categories</p>
                    <div class="mt-1 flex flex-wrap gap-2">${catChips}</div>
                  </div>
                  <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <p class="text-xs text-gray-500">Location</p>
                    <p class="font-semibold text-gray-900">${escapeHtml(job.location)}</p>
                  </div>
                  <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <p class="text-xs text-gray-500">Budget</p>
                    <p class="font-semibold text-gray-900">${escapeHtml(budgetLabel(job))}</p>
                  </div>
                  <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <p class="text-xs text-gray-500">Timeline</p>
                    <p class="font-semibold text-gray-900">${escapeHtml((timelineChip(job).exact || timelineChip(job).label || job.timeline || 'Flexible'))}</p>
                  </div>
                </div>
                <div>
                  <p class="text-sm font-semibold text-gray-900 mb-1">Description</p>
                  <p class="text-sm text-gray-700 whitespace-pre-line">${escapeHtml((window.ATHIntegrity && typeof window.ATHIntegrity.sanitizeTextSync === 'function' ? window.ATHIntegrity.sanitizeTextSync(job.description || '').text : job.description || ''))}</p>
                </div>
                ${c ? `
                <div class="border-t border-gray-200 pt-4">
                  <p class="text-sm font-semibold text-gray-900 mb-2">Customer</p>
                  <a href="profile-customer.html?id=${encodeURIComponent(job.customerId)}" class="flex items-center gap-3 hover:bg-gray-50 rounded-xl p-2">
                    <img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.name)}" class="w-10 h-10 rounded-full" />
                    <div>
                      <p class="font-medium text-gray-900">${escapeHtml(c.name)}</p>
                      <p class="text-sm text-gray-600">${escapeHtml(c.location)}</p>
                    </div>
                  </a>
                </div>` : ''}
              
                <!-- Batch N2: Manage Job (demo) -->
                <div class="border-t border-gray-200 pt-4">
                  <p class="text-sm font-semibold text-gray-900 mb-2">Job status</p>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">Status: <span class="font-semibold" id="athJobStatusLabel"></span></span>
                    <span class="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700" id="athAssignedTradieLabelWrap" style="display:none;">Assigned: <span class="font-semibold" id="athAssignedTradieLabel"></span></span>
                  </div>

                  <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
                      <p class="text-xs text-gray-500 mb-2">Applications (demo)</p>
                      <div id="athApplicationsList" class="space-y-2"></div>
                      <p id="athApplicationsEmpty" class="text-xs text-gray-500">No applications yet.</p>
                    </div>
                    <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
                      <p class="text-xs text-gray-500 mb-2">Actions</p>
                      <div class="space-y-2">
                        <!-- v0.014: tradie accepts job terms (agreement integrity) -->
                        <button type="button" id="athAcceptJobTerms" class="w-full bg-white border border-gray-300 text-gray-700 font-semibold py-2 px-3 rounded-xl hover:bg-gray-50 transition text-sm">Accept Job Terms</button>

                        <!-- v0.016: completion photo uploads (localStorage only) -->
                        <button type="button" id="athUploadCompletionPhotos" class="w-full bg-white border border-gray-300 text-gray-700 font-semibold py-2 px-3 rounded-xl hover:bg-gray-50 transition text-sm">Upload Completion Photos</button>
                        <input type="file" id="athCompletionPhotosInput" accept="image/*" multiple class="hidden" />
                        <div id="athCompletionPhotosWrap" class="hidden">
                          <div class="mt-2" id="athCompletionPhotosList"></div>
                          <p id="athCompletionPhotosHint" class="text-xs text-gray-500 mt-2">Photos are stored locally on this device (localStorage). No cloud uploads.</p>
                        </div>
                        <button type="button" id="athLeaveReview" class="w-full bg-gray-900 text-white font-semibold py-2 px-3 rounded-xl hover:bg-black transition text-sm">Leave a Review</button>
                        <p id="athReviewHint" class="text-xs text-gray-500">Reviews are double-blind: visible after both submit (or after 7 days).</p>
                      </div>
                    </div>
                  </div>
                </div>
</div>
            `);


            // Batch N2: wire up applications + status + reviews
            function readApplicationsForJob(jobId) {
              const apps = readJson('athJobApplications', []);
              const arr = Array.isArray(apps) ? apps : [];
              return arr.filter(a => String(a.jobId) === String(jobId));
            }

            function renderApplications() {
              const listEl = qs('#athApplicationsList');
              const emptyEl = qs('#athApplicationsEmpty');
              if (!listEl || !emptyEl) return;
              const apps = readApplicationsForJob(job.id);
              if (!apps.length) {
                listEl.innerHTML = '';
                emptyEl.classList.remove('hidden');
                return;
              }
              emptyEl.classList.add('hidden');
              const me = (window.getCurrentUser && typeof window.getCurrentUser === 'function')
                ? window.getCurrentUser()
                : { id: 'me', role: 'dual' };
              const isCustomerRole = ['customer', 'dual'].includes(String(me.role || 'dual'));
              const isOwner = String(me.id) === String(job.customerId);
              const canAccept = isCustomerRole && isOwner;

              listEl.innerHTML = apps.slice(0, 6).map((a, idx) => {
                const rawName = String(a.name || 'Applicant');
                const nameTrim = rawName.trim();
                const last3 = nameTrim.replace(/\s+/g, ' ').slice(-3);
                const masked = `${'***'}${last3}`;
                const nm = escapeHtml(masked);
                const msg = escapeHtml(String(a.message || ''));
                const avail = escapeHtml(String(a.availability || ''));
                const exp = escapeHtml(String(a.experience || ''));
                const metaBits = [
                  avail ? `Availability: ${avail}` : '',
                  exp ? `Experience: ${exp}` : ''
                ].filter(Boolean);

                return `
                  <div class="border border-gray-200 bg-white rounded-lg p-2">
                    <div class="flex items-center justify-between gap-2">
                      <div class="text-sm font-semibold text-gray-900">${nm}</div>
                      ${canAccept ? `<button data-accept-idx="${idx}" class="text-xs bg-teal-600 text-white px-2 py-1 rounded-md hover:opacity-90">Accept</button>` : ''}
                    </div>
                    ${metaBits.length ? `<div class="mt-1 text-[11px] text-gray-600 space-y-0.5">${metaBits.slice(0,5).map(x=>`<div>${x}</div>`).join('')}</div>` : ''}
                    <div class="mt-1 text-xs text-gray-600 line-clamp-3">${msg}</div>
                  </div>`;
              }).join('');

              qsa('[data-accept-idx]', listEl).forEach(btn => {
                btn.addEventListener('click', () => {
                  const idx = Number(btn.getAttribute('data-accept-idx') || 0);
                  const apps2 = readApplicationsForJob(job.id);
                  const picked = apps2[idx];
                  if (!picked) return;

                  // v0.021: strict role/ownership guard.
                  // Only the customer who posted the job may accept an applicant.
                  const me = (window.getCurrentUser && typeof window.getCurrentUser === 'function')
                    ? window.getCurrentUser()
                    : { id: 'me', role: 'dual' };
                  const isCustomerRole = ['customer', 'dual'].includes(String(me.role || 'dual'));
                  const isOwner = String(me.id) === String(job.customerId);
                  if (!isCustomerRole || !isOwner) {
                    alert('Only the customer who posted this job can accept a tradie.');
                    return;
                  }
                  // In demo we map applicant name to a tradie by best name match; fallback to first tradie.
                  const tradies = window.TRADIES || {};
                  const entries = Object.entries(tradies);
                  let tid = entries.length ? entries[0][0] : '';
                  const want = String(picked.name || '').toLowerCase();
                  for (const [id2, t2] of entries) {
                    const tn = String(t2?.name || '').toLowerCase();
                    if (want && tn.includes(want)) { tid = id2; break; }
                  }
                  if (!tid) return;
                  // v0.012: accepting a tradie moves the job to "agreed" (not in_progress).
                  // in_progress will be unlocked in a later version once tradie terms are accepted.
                  setJobState(job.id, { assignedTradieId: tid, status: 'agreed', agreedAt: new Date().toISOString() });
                  // update in-memory job too
                  job.assignedTradieId = tid;
                  job.status = 'agreed';
                  updateManageUI();
                });
              });
            }

            function statusLabel(s) {
              const x = String(s || 'open');
              if (x === 'completed') return 'Completed';
              if (x === 'in_progress') return 'In progress';
              if (x === 'agreed') return 'Agreed';
              return 'Open';
            }

            // v0.016: completion photos (stored locally in athJobState)
            function readCompletionPhotos() {
              const s = getJobState(job.id);
              const arr = Array.isArray(s.completionPhotos) ? s.completionPhotos : [];
              return arr.filter(v => typeof v === 'string' && v.startsWith('data:image/'));
            }

            function renderCompletionPhotos() {
              const wrap = qs('#athCompletionPhotosWrap');
              const list = qs('#athCompletionPhotosList');
              if (!wrap || !list) return;

              const photos = readCompletionPhotos();
              if (!photos.length) {
                list.innerHTML = '<p class="text-xs text-gray-500">No photos uploaded yet.</p>';
                return;
              }

              list.innerHTML = `
                <div class="grid grid-cols-3 gap-2">
                  ${photos.slice(0, 6).map((src, idx) => `
                    <div class="relative">
                      <img src="${escapeHtml(src)}" alt="Completion photo ${idx + 1}" class="w-full h-20 object-cover rounded-lg border border-gray-200" />
                      <button type="button" data-photo-remove="${idx}" class="absolute -top-2 -right-2 bg-gray-900 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center hover:opacity-90">×</button>
                    </div>
                  `).join('')}
                </div>
              `;

              qsa('[data-photo-remove]', list).forEach(btn => {
                btn.addEventListener('click', () => {
                  const idx = Number(btn.getAttribute('data-photo-remove') || -1);
                  const cur = readCompletionPhotos();
                  if (idx < 0 || idx >= cur.length) return;
                  cur.splice(idx, 1);
                  setJobState(job.id, { completionPhotos: cur });
                  renderCompletionPhotos();
                });
              });
            }

            function updateManageUI() {
              const statusEl = qs('#athJobStatusLabel');
              const assignedWrap = qs('#athAssignedTradieLabelWrap');
              const assignedEl = qs('#athAssignedTradieLabel');
              const btnAcceptTerms = qs('#athAcceptJobTerms');
              const btnUploadPhotos = qs('#athUploadCompletionPhotos');
              const photosInput = qs('#athCompletionPhotosInput');
              const photosWrap = qs('#athCompletionPhotosWrap');
              const btnReview = qs('#athLeaveReview');

              const me = (window.getCurrentUser && typeof window.getCurrentUser === 'function')
                ? window.getCurrentUser()
                : { id: 'me', role: 'dual' };

              const stateNow0 = getJobState(job.id);
              const st0 = stateNow0.status || job.status || 'open';

              // v0.014: auto-transition agreed -> in_progress once BOTH:
              // - customer has accepted (agreedAt)
              // - tradie has accepted terms (tradieAcceptedTermsAt)
              // NOTE: This keeps the rule centralized and future-proof.
              if (st0 === 'agreed' && stateNow0.agreedAt && stateNow0.tradieAcceptedTermsAt) {
                const next = setJobState(job.id, { status: 'in_progress', inProgressAt: stateNow0.inProgressAt || new Date().toISOString() });
                job.status = next.status || 'in_progress';
                job.inProgressAt = next.inProgressAt || job.inProgressAt;
              }

              const stateNow = getJobState(job.id);
              const st = stateNow.status || job.status || 'open';
              if (statusEl) statusEl.textContent = statusLabel(st);

              const tid = stateNow.assignedTradieId || job.assignedTradieId || '';
              if (tid && assignedWrap && assignedEl) {
                const t = (window.TRADIES || {})[tid];
                assignedEl.textContent = t ? String(t.name || tid) : tid;
                assignedWrap.style.display = '';
              } else if (assignedWrap) {
                assignedWrap.style.display = 'none';
              }

              // enable/disable action buttons
              if (btnAcceptTerms) {
                const isTradieRole = ['tradie', 'dual'].includes(String(me.role || 'dual'));
                const isAssigned = tid && String(me.id) === String(tid);
                const isDemoMe = String(me.id) === 'me';
                const allowed = (st === 'agreed') && isTradieRole && (isAssigned || isDemoMe);
                btnAcceptTerms.disabled = !allowed;
                btnAcceptTerms.classList.toggle('opacity-50', btnAcceptTerms.disabled);
                btnAcceptTerms.classList.toggle('cursor-not-allowed', btnAcceptTerms.disabled);
              }
              if (btnReview) btnReview.disabled = (st !== 'completed' || !tid);
              if (btnReview) btnReview.classList.toggle('opacity-50', btnReview.disabled);
              if (btnReview) btnReview.classList.toggle('cursor-not-allowed', btnReview.disabled);

              // v0.016: completion photo UI is available for in_progress (and viewable on completed)
              const showPhotos = (st === 'in_progress' || st === 'completed');
              if (photosWrap) photosWrap.classList.toggle('hidden', !showPhotos);
              if (btnUploadPhotos) {
                const canUpload = (st === 'in_progress');
                btnUploadPhotos.disabled = !canUpload;
                btnUploadPhotos.classList.toggle('opacity-50', btnUploadPhotos.disabled);
                btnUploadPhotos.classList.toggle('cursor-not-allowed', btnUploadPhotos.disabled);
              }
              if (photosInput && !showPhotos) {
                // reset if hidden
                try { photosInput.value = ''; } catch {}
              }

              if (showPhotos) renderCompletionPhotos();
            }

            function openReviewModal() {
              const tid = getJobState(job.id).assignedTradieId || job.assignedTradieId;
              const cid = job.customerId;
              if (!tid || !cid) return;

              const me = (window.getCurrentUser && typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : { id: 'me', role: 'dual', displayName: 'Me' };
              const role = String(me.role || 'dual');
              const needsPick = role === 'dual';

              const rolePicker = needsPick ? `
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Reviewing as</label>
                  <select id="athReviewAs" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
                    <option value="customer">Customer</option>
                    <option value="tradie">Tradie</option>
                  </select>
                </div>` : '';

              openModal('Leave a review (double-blind)', `
                <form id="athReviewForm" class="space-y-4">
                  ${rolePicker}
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Rating</label>
                    <div class="flex gap-2">
                      ${[5,4,3,2,1].map(s => `<label class="flex-1"><input type="radio" name="stars" value="${s}" class="mr-1" ${s===5?'checked':''}>${s}★</label>`).join('')}
                    </div>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Quick notes</label>
                    <textarea name="text" rows="4" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500" placeholder="Keep it factual: communication, punctuality, quality…"></textarea>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label class="text-sm"><input type="checkbox" name="dim" value="communication" class="mr-1">Communication</label>
                    <label class="text-sm"><input type="checkbox" name="dim" value="punctuality" class="mr-1">Punctuality</label>
                    <label class="text-sm"><input type="checkbox" name="dim" value="quality" class="mr-1">Quality</label>
                  </div>
                  <div class="flex flex-col sm:flex-row gap-3">
                    <button type="submit" class="flex-1 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold py-3 px-4 rounded-xl hover:opacity-90 transition">Submit Review</button>
                    <button type="button" id="athReviewCancel" class="flex-1 bg-white border border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-xl hover:bg-gray-50 transition">Cancel</button>
                  </div>
                  <p id="athReviewError" class="text-sm text-red-600 hidden"></p>
                  <p class="text-xs text-gray-500">Reviews publish after both sides submit, or after 7 days from completion.</p>
                </form>
              `);

              qs('#athReviewCancel')?.addEventListener('click', closeModal);
              qs('#athReviewForm')?.addEventListener('submit', (e2) => {
                e2.preventDefault();
                const form = e2.target;
                const fd = new FormData(form);
                const stars = Number(fd.get('stars') || 0);
                const text2 = String(fd.get('text') || '').trim();
                const dims = fd.getAll('dim');
                const err = qs('#athReviewError');

                const asRole = needsPick ? String(qs('#athReviewAs')?.value || 'customer') : (role === 'tradie' ? 'tradie' : 'customer');
                const reviewerRole = (asRole === 'tradie') ? 'tradie' : 'customer';
                const targetRole = (reviewerRole === 'customer') ? 'tradie' : 'customer';
                const targetId = (targetRole === 'tradie') ? tid : cid;

                if (!stars || stars < 1 || stars > 5) {
                  if (err) { err.textContent = 'Please select a rating.'; err.classList.remove('hidden'); }
                  return;
                }

                const pairKey = computePairKey({ ...job, assignedTradieId: tid });
                const list = readReviews();
                // prevent duplicates per job per reviewerRole
                if (list.some(r => r.pairKey === pairKey && r.reviewerRole === reviewerRole)) {
                  if (err) { err.textContent = 'You already submitted your review for this job.'; err.classList.remove('hidden'); }
                  return;
                }

                const item = {
                  id: 'rev-' + Date.now(),
                  pairKey,
                  jobId: job.id,
                  reviewerId: String(me.id || 'me'),
                  reviewerRole,
                  targetId: String(targetId),
                  targetRole,
                  stars,
                  text: text2,
                  dims,
                  ts: Date.now(),
                  visibility: 'pending',
                  completedAt: getJobState(job.id).completedAt || job.completedAt || ''
                };
                list.unshift(item);
                writeReviews(list);
                // publish if both exist
                publishIfCompletePair({ ...job, assignedTradieId: tid });
                closeModal();
                openModal('Review saved', `<p class="text-sm text-gray-700">Saved in demo mode. It will publish after the other party submits (or after 7 days).</p>`);
              });
            }

            // initialize manage UI
            renderApplications();
            updateManageUI();

            // v0.016: upload completion photos (localStorage only)
            qs('#athUploadCompletionPhotos')?.addEventListener('click', () => {
              const btn = qs('#athUploadCompletionPhotos');
              if (btn && btn.disabled) return;
              qs('#athCompletionPhotosInput')?.click();
            });

            qs('#athCompletionPhotosInput')?.addEventListener('change', async () => {
              const input = qs('#athCompletionPhotosInput');
              const files = (input && input.files) ? Array.from(input.files) : [];
              // reset so selecting the same file again triggers change
              try { if (input) input.value = ''; } catch {}
              if (!files.length) return;

              const s = getJobState(job.id);
              const st = s.status || job.status || 'open';
              if (st !== 'in_progress') return;

              if (!window.ATHImages || typeof window.ATHImages.processImageFile !== 'function') {
                alert('Image helper is not available on this page.');
                return;
              }

              const existing = readCompletionPhotos();
              const MAX_PHOTOS = 6;
              const remaining = Math.max(0, MAX_PHOTOS - existing.length);
              const pick = files.slice(0, remaining);
              if (!pick.length) {
                alert('Photo limit reached (max 6).');
                return;
              }

              const out = [...existing];
              for (const f of pick) {
                try {
                  const processed = await window.ATHImages.processImageFile(f, {
                    maxBytes: 3 * 1024 * 1024,
                    maxDim: 1024,
                    cropSquare: false,
                    mimePrefer: 'image/webp',
                    quality: 0.82
                  });
                  if (processed) out.push(processed);
                } catch {}
              }

              setJobState(job.id, { completionPhotos: out });
              renderCompletionPhotos();
            });

            // v0.014: tradie accepts job terms -> in_progress (only after customer agreed)
            qs('#athAcceptJobTerms')?.addEventListener('click', () => {
              const me = (window.getCurrentUser && typeof window.getCurrentUser === 'function')
                ? window.getCurrentUser()
                : { id: 'me', role: 'dual' };

              const s = getJobState(job.id);
              const st = s.status || job.status || 'open';
              const tid = s.assignedTradieId || job.assignedTradieId || '';

              const isTradieRole = ['tradie', 'dual'].includes(String(me.role || 'dual'));
              const isAssigned = tid && String(me.id) === String(tid);
              const isDemoMe = String(me.id) === 'me';
              if (!isTradieRole || (!isAssigned && !isDemoMe)) {
                alert('Only the assigned tradie can accept job terms.');
                return;
              }
              if (st !== 'agreed') return;
              if (!s.agreedAt) {
                // Safety: a job should not reach "agreed" without customer acceptance.
                alert('Job agreement is missing. Customer must accept a tradie first.');
                return;
              }

              const now = new Date().toISOString();
              const next = setJobState(job.id, {
                tradieAcceptedTermsAt: now,
                status: 'in_progress',
                inProgressAt: s.inProgressAt || now
              });

              job.status = next.status || 'in_progress';
              job.inProgressAt = next.inProgressAt || job.inProgressAt;
              updateManageUI();
              render();
            });
            qs('#athLeaveReview')?.addEventListener('click', () => {
              if (qs('#athLeaveReview')?.disabled) return;
              openReviewModal();
            });

            return;
          }



          if (action === 'edit') {
            const me = (window.getCurrentUser && typeof window.getCurrentUser === 'function')
              ? window.getCurrentUser()
              : { id: 'me', role: 'dual' };

            const isOwner = String(me.id) === String(job.customerId);
            const isLocal = String(job._source || '') === 'local';
            if (!isOwner || !isLocal) {
              alert('You can only edit jobs you posted on this device.');
              return;
            }

            // Build edit form (modal)
            const rawPosted = (window.ATHJobs && typeof window.ATHJobs.readPostedJobsFromStorage === 'function')
              ? window.ATHJobs.readPostedJobsFromStorage()
              : readJson('athPostedJobs', []);

            const raw = Array.isArray(rawPosted) ? rawPosted.find(x => String(x.id) === String(job.id)) : null;
            if (!raw) {
              alert('Could not find the editable job record.');
              return;
            }

            const catalog = getTradeCatalog();
            const currentCats = new Set((Array.isArray(job.categories) ? job.categories : normalizeJobCategories(job)).map(String));
            const states = ['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'];

            const catsHtml = (catalog && catalog.length ? catalog : [{id:'other',label:'Other'}]).map(t => {
              const id2 = String(t.id);
              const checked = currentCats.has(id2) ? 'checked' : '';
              return `
                <label class="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" class="rounded border-gray-300 text-teal-600 focus:ring-teal-500" name="categories" value="${escapeHtml(id2)}" ${checked} />
                  <span>${escapeHtml(t.label || tradeLabelSafe(id2))}</span>
                </label>`;
            }).join('');

            const prefYmd = parsePreferredDateFromTimeline(job.timeline);

            openModal(`Edit — ${job.title}`, `
              <form id="athEditJobForm" class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Job title</label>
                  <input required name="title" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500" value="${escapeHtml(String(raw.title || job.title || ''))}" />
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Trades / categories</label>
                  <div class="border border-gray-200 rounded-xl p-3 max-h-48 overflow-auto bg-gray-50 space-y-2">
                    ${catsHtml}
                  </div>
                  <p class="text-xs text-gray-500 mt-2">Select at least 1 category.</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">State</label>
                    <select required name="state" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
                      ${states.map(s => `<option value="${s}" ${String(raw.state || job.state || '').toUpperCase() === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Budget (optional)</label>
                    <input name="budget" inputmode="numeric" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500" value="${escapeHtml(String(raw.budget ?? ''))}" placeholder="e.g., 2500" />
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Preferred date (optional)</label>
                  <input type="date" name="date" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500" value="${escapeHtml(prefYmd)}" />
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea required name="description" rows="5" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500">${escapeHtml(String(raw.description || job.description || ''))}</textarea>
                </div>

                <div class="flex flex-col sm:flex-row gap-3">
                  <button type="submit" class="flex-1 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold py-3 px-4 rounded-xl hover:opacity-90 transition">Save changes</button>
                  <button type="button" id="athEditCancel" class="flex-1 bg-white border border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-xl hover:bg-gray-50 transition">Cancel</button>
                  <button type="button" id="athEditDelete" class="flex-1 bg-white border border-red-300 text-red-600 font-semibold py-3 px-4 rounded-xl hover:bg-red-50 transition">Delete Job</button>
                </div>

                <p id="athEditError" class="text-sm text-red-600 hidden"></p>
              </form>
            `);

            const form = qs('#athEditJobForm');
            const err = qs('#athEditError');
            qs('#athEditCancel')?.addEventListener('click', closeModal);

            qs('#athEditDelete')?.addEventListener('click', () => {
              const ok = confirm('Delete this job? This cannot be undone.');
              if (!ok) return;
              const deleted = deleteLocalPostedJob(job);
              if (!deleted) {
                alert('You can only delete jobs you posted on this device.');
                return;
              }
              closeModal();
              render();
            });

            form?.addEventListener('submit', (e) => {
              e.preventDefault();
              const fd = new FormData(form);
              const title = String(fd.get('title') || '').trim();
              const state = String(fd.get('state') || '').trim();
              const budgetRaw = String(fd.get('budget') || '').trim();
              const date = String(fd.get('date') || '').trim();
              const description = String(fd.get('description') || '').trim();
              const cats = (fd.getAll('categories') || []).map(v => String(v).trim()).filter(Boolean);

              if (!title || !state || !description || cats.length === 0) {
                if (err) {
                  err.textContent = 'Please fill in the required fields (title, at least 1 category, state, and description).';
                  err.classList.remove('hidden');
                }
                return;
              }

              const budgetNum = budgetRaw ? Number(budgetRaw) : null;
              if (budgetRaw && (!isFinite(budgetNum) || budgetNum < 0)) {
                if (err) {
                  err.textContent = 'Budget must be a valid number.';
                  err.classList.remove('hidden');
                }
                return;
              }

              const list = Array.isArray(rawPosted) ? rawPosted.slice() : [];
              const idx = list.findIndex(x => String(x.id) === String(job.id));
              if (idx < 0) {
                alert('Could not update: job not found in storage.');
                return;
              }

              const updated = {
                ...list[idx],
                title,
                categories: cats,
                category: cats[0] ? (typeof window.tradeLabel === 'function' ? window.tradeLabel(cats[0]) : cats[0]) : (list[idx].category || 'Other'),
                state: state.toUpperCase(),
                budget: budgetRaw ? budgetNum : null,
                date: date || null,
                description,
                updatedAt: new Date().toISOString()
              };
              list[idx] = updated;

              const key = (window.ATHJobs && window.ATHJobs.POSTED_JOBS_KEY) ? window.ATHJobs.POSTED_JOBS_KEY : 'athPostedJobs';
              writeJson(key, list);

              // Update in-memory canonical job
              const mapped = (window.ATHJobs && typeof window.ATHJobs.mapPostedJobToCanonical === 'function')
                ? window.ATHJobs.mapPostedJobToCanonical(updated)
                : mapPostedJobToCanonical(updated);

              const jidx = allJobs.findIndex(j => String(j.id) === String(job.id));
              if (jidx >= 0) allJobs[jidx] = mapped;

              closeModal();
              render();
            });

            return;
          }
          if (action === 'apply') {
            const me = (window.getCurrentUser && typeof window.getCurrentUser === 'function')
              ? window.getCurrentUser()
              : { id: 'me', role: 'dual' };
            if (String(me.id) === String(job.customerId)) {
              alert("You can't apply to your own job.");
              return;
            }
            openModal(`Apply — ${job.title}`, `
              <form id="athApplyForm" class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Your name</label>
                  <input required name="name" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500" placeholder="e.g., Jayden" />
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Availability</label>
                    <input required name="availability" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500" placeholder="e.g., Today after 3pm / Weekends" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Estimated price (optional)</label>
                    <input name="estimate" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500" placeholder="e.g., $220–$320" />
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Experience summary</label>
                  <textarea required name="experience" rows="3" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500" placeholder="Years in trade, similar jobs completed, what you’ll check/replace…"></textarea>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Message</label>
                  <textarea required name="message" rows="4" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500" placeholder="Anything else the customer should know (materials, callout, constraints)…"></textarea>
                </div>
                <div class="flex flex-col sm:flex-row gap-3">
                  <button type="submit" class="flex-1 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold py-3 px-4 rounded-xl hover:opacity-90 transition">Submit Application</button>
                  <button type="button" id="athApplyCancel" class="flex-1 bg-white border border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-xl hover:bg-gray-50 transition">Cancel</button>
                </div>
                <p id="athApplyError" class="text-sm text-red-600 hidden"></p>
              </form>
            `);

            qs('#athApplyCancel')?.addEventListener('click', closeModal);
            qs('#athApplyForm')?.addEventListener('submit', (e) => {
              e.preventDefault();
              const form = e.target;
              const fd = new FormData(form);
              const name = String(fd.get('name') || '').trim();
              const availability = String(fd.get('availability') || '').trim();
              const experience = String(fd.get('experience') || '').trim();
              const estimate = String(fd.get('estimate') || '').trim();
              const message = String(fd.get('message') || '').trim();
              const err = qs('#athApplyError');
              if (!name || !availability || !experience || !message) {
                if (err) { err.textContent = 'Please fill in your name, availability, experience, and message.'; err.classList.remove('hidden'); }
                return;
              }
              // Block off-platform contact sharing until payment
              const scanFn = window.ATHIntegrity?.scanText;
              const fieldsToCheck = [name, availability, experience, estimate, message];
              if (typeof scanFn === 'function') {
                const hit = fieldsToCheck.find(v => scanFn(v || '').hasContact);
                if (hit) {
                  if (err) {
                    err.textContent = 'Contact details (phone, email, or links) are locked until payment is confirmed. Please remove them.';
                    err.classList.remove('hidden');
                  }
                  return;
                }
              }

              const apps = readJson('athJobApplications', []);
              const arr = Array.isArray(apps) ? apps : [];
              arr.unshift({ jobId: job.id, name, availability, experience, estimate, message, createdAt: new Date().toISOString() });
              writeJson('athJobApplications', arr);
              closeModal();
              openModal('Application sent', `<p class="text-sm text-gray-700">Saved to <span class="font-mono">localStorage</span> (demo mode). The customer will be able to see your application later.</p>`);
            });
            return;
          }
        });
      });
    }

    function render() {
      const ctrl = readControls();
      let filtered = filterJobs(ctrl);
      filtered = sortJobs(filtered, ctrl.sort);

      // keep category counts aligned to current filters except category itself
      const ctrlWithoutCats = { ...ctrl, cats: [] };
      const filteredForCounts = sortJobs(filterJobs(ctrlWithoutCats), ctrl.sort);
      rebuildCategoryList(filteredForCounts);

      const total = filtered.length;
      countEl.textContent = String(total);

      const pages = Math.max(1, Math.ceil(total / state.pageSize));
      if (state.page > pages) state.page = pages;

      const start = (state.page - 1) * state.pageSize;
      const pageItems = filtered.slice(start, start + state.pageSize);

      resultsEl.innerHTML = pageItems.map(renderJobCard).join('');
      maybeFeatherReplace();
      bindResultActions();
      renderPagination(total, state.page, state.pageSize);
    }

    // Bind controls
    ['#athJobSearch', '#athJobLocation'].forEach((sel) => {
      const el = qs(sel);
      if (el) {
        el.addEventListener('input', () => { state.page = 1; render(); });
        el.addEventListener('change', () => { state.page = 1; render(); });
      }
    });

    qsa('input[name="athJobBudget"]').forEach((r) => {
      r.addEventListener('change', () => { state.page = 1; render(); });
    });
    qsa('input[name="athJobUrgency"]').forEach((b) => {
      b.addEventListener('change', () => { state.page = 1; render(); });
    });
    qsa('input[name="athJobType"]').forEach((b) => {
      b.addEventListener('change', () => { state.page = 1; render(); });
    });
    sortEl?.addEventListener('change', () => { state.page = 1; render(); });

    clearBtn?.addEventListener('click', () => {
      const search = qs('#athJobSearch');
      if (search) search.value = '';
      const loc = qs('#athJobLocation');
      if (loc) loc.value = 'all';

      qsa('input[name="athJobBudget"]').forEach((r) => (r.checked = (r.value === 'any')));
      qsa('input[name="athJobUrgency"]').forEach((b) => (b.checked = false));
      qsa('input[name="athJobType"]').forEach((b) => (b.checked = false));
      qsa('input[name="athJobCategory"]').forEach((b) => (b.checked = false));
      if (sortEl) sortEl.value = 'recent';
      state.page = 1;
      render();
    });

    // Initial
    rebuildCategoryList(allJobs);
    render();

    // v0.028: Deep-link support (e.g., messages page) — jobs.html?job=<id>
    // Opens a lightweight details modal even if the job isn't currently visible in the filtered list.
    try {
      const params = new URLSearchParams(window.location.search);
      const deepJobId = params.get('job');
      if (deepJobId) {
        const job = allJobs.find(j => String(j?.id) === String(deepJobId));
        if (job) {
          const st = (getJobState(job.id)?.status || job.status || 'open');
          const isListable = String(st).toLowerCase() === 'open';
          const catIds = normalizeJobCategories(job);
          const catChips = catIds.map((cid) => (
            `<span class="inline-flex items-center px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">${escapeHtml(tradeLabelSafe(cid))}</span>`
          )).join('');
          openModal(job.title || 'Job details', `
            <div class="space-y-4">
              ${!isListable ? `<div class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">This job is not currently listed in Browse results (status: <span class="font-semibold">${escapeHtml(String(st).replace('_',' '))}</span>).</div>` : ''}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <p class="text-xs text-gray-500">Categories</p>
                  <div class="mt-1 flex flex-wrap gap-2">${catChips || '<span class="text-xs text-gray-500">—</span>'}</div>
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
                  <p class="font-semibold text-gray-900">${escapeHtml((timelineChip(job).exact || timelineChip(job).label || job.timeline || 'Flexible'))}</p>
                </div>
              </div>
              <div>
                <p class="text-sm font-semibold text-gray-900 mb-1">Description</p>
                <p class="text-sm text-gray-700 whitespace-pre-line">${escapeHtml((window.ATHIntegrity && typeof window.ATHIntegrity.sanitizeTextSync === 'function' ? window.ATHIntegrity.sanitizeTextSync(job.description || '').text : job.description || ''))}</p>
              </div>
            </div>
          `);
        }
      }
    } catch (e) {}
  }

  window.ATHSearchFilter = {
    initTradiesBrowse,
    initCustomersBrowse,
    initJobsBoard
  };
})();


