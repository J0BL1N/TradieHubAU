// data.js
// Global demo datasets for the static prototype.

// ------------------------------------------------------------
// Batch L — Canonical trades/categories (single source of truth)
// ------------------------------------------------------------
// IDs are stable keys used in filtering + storage. Labels are user-facing.
window.TRADE_CATEGORIES = [
  { id: 'electrical', label: 'Electrician', duration: 4 },
  { id: 'plumbing', label: 'Plumber & Gasfitter', duration: 4 },
  { id: 'carpentry', label: 'Carpenter / Joiner', duration: 4 },
  { id: 'building', label: 'Builder / Contractor', duration: 4 },
  { id: 'tiling', label: 'Wall & Floor Tiler', duration: 4 },
  { id: 'painting', label: 'Painter & Decorator', duration: 4 },
  { id: 'gardening', label: 'Landscape Construction', duration: 4 },
  { id: 'cleaning', label: 'Cleaner', duration: 0 },
  { id: 'shopfitter', label: 'Shopfitter', duration: 4 },
  { id: 'bricklayer', label: 'Bricklayer / Blocklayer', duration: 4 },
  { id: 'stonemason', label: 'Stonemason', duration: 4 },
  { id: 'concreter', label: 'Concreter', duration: 3 },
  { id: 'plasterer', label: 'Plasterer', duration: 4 },
  { id: 'waterproofer', label: 'Waterproofer', duration: 3 },
  { id: 'rooftiler', label: 'Roof Tiler / Slater', duration: 4 },
  { id: 'roofplumber', label: 'Roof Plumber', duration: 4 },
  { id: 'glazier', label: 'Glazier', duration: 4 },
  { id: 'locksmith', label: 'Locksmith', duration: 4 },
  { id: 'floorfinisher', label: 'Floor Finisher', duration: 3 },
  { id: 'cabinetmaker', label: 'Cabinet Maker', duration: 4 },
  { id: 'refrigeration', label: 'Refrigeration & Air Conditioning', duration: 4 },
  { id: 'fencer', label: 'Fencer', duration: 3 },
  { id: 'scaffolder', label: 'Scaffolder', duration: 3 },
  { id: 'demolisher', label: 'Demolisher', duration: 3 },
  { id: 'excavator', label: 'Excavator Operator', duration: 3 },
  { id: 'poolbuilder', label: 'Swimming Pool Builder', duration: 4 },
  { id: 'handyman', label: 'Handyman', duration: 0 },
  { id: 'other', label: 'Other', duration: 0 }
];

// Quick lookup maps
window.TRADE_BY_ID = window.TRADE_CATEGORIES.reduce((acc, t) => {
  acc[t.id] = t;
  return acc;
}, {});

window.tradeLabel = function tradeLabel(id) {
  const key = String(id || '').trim();
  return (window.TRADE_BY_ID && window.TRADE_BY_ID[key]) ? window.TRADE_BY_ID[key].label : (key || 'Other');
};

window.normalizeTradeIds = function normalizeTradeIds(input) {
  // Accept: array of ids, comma-separated string, or a single label.
  const raw = Array.isArray(input)
    ? input
    : (typeof input === 'string' ? input.split(',') : [input]);

  const legacyMap = {
    electrician: 'electrical',
    plumber: 'plumbing',
    carpenter: 'carpentry',
    tiler: 'tiling',
    painter: 'painting',
    landscaper: 'gardening'
  };

  const out = [];
  raw
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .forEach((v) => {
      const norm = v.toLowerCase();
      // allow passing labels in (e.g. "Plumbing")
      const byLabel = window.TRADE_CATEGORIES.find(t => t.label.toLowerCase() === norm);
      const id = byLabel ? byLabel.id : (legacyMap[norm] || norm);
      if (window.TRADE_BY_ID[id] && !out.includes(id)) out.push(id);
    });

  return out.length ? out : ['other'];
};

window.inferTradeIdsFromText = function inferTradeIdsFromText(text) {
  const t = String(text || '').toLowerCase();
  const ids = [];
  const push = (id) => { if (window.TRADE_BY_ID[id] && !ids.includes(id)) ids.push(id); };

  if (t.includes('electr')) push('electrical');
  if (t.includes('plumb')) push('plumbing');
  if (t.includes('carpent') || t.includes('joiner') || t.includes('fence') || t.includes('deck')) push('carpentry');
  if (t.includes('paint') || t.includes('decor')) push('painting');
  if (t.includes('tile')) push('tiling');
  if (t.includes('build') || t.includes('reno') || t.includes('contractor')) push('building');
  if (t.includes('landscap') || t.includes('garden')) push('gardening');
  if (t.includes('clean')) push('cleaning');
  if (t.includes('handy') || t.includes('repairs') || t.includes('fix')) push('handyman');

  return ids.length ? ids : ['other'];
};

// Batch N1: lightweight demo reviews so profiles can actually display review content.
// We keep datasets small by generating up to 8 visible reviews, while preserving the total reviewCount.
window.makeDemoReviews = function makeDemoReviews(totalCount, avgRating, reviewerRoleLabel) {
  const total = Math.max(0, Number(totalCount || 0));
  const avg = Math.max(0, Math.min(5, Number(avgRating || 0)));
  const visible = Math.min(total, 8);
  const role = reviewerRoleLabel || 'User';
  const templates = [
    'Clear communication and smooth process.',
    'Arrived on time and kept things tidy.',
    'Scope was clear and payment was prompt.',
    'Good workmanship and easy to work with.',
    'Would work together again.',
    'Professional, responsive, and straightforward.',
    'Job matched the description and expectations.',
    'Handled changes in scope reasonably.'
  ];
  const out = [];
  for (let i = 0; i < visible; i++) {
    // deterministic-ish star spread around avg
    const jitter = (i % 3) - 1; // -1,0,+1
    const stars = Math.max(1, Math.min(5, Math.round(avg + jitter)));
    out.push({
      stars,
      byRole: role,
      text: templates[i % templates.length],
      ts: Date.now() - (i + 1) * 86400000 * 14 // ~every 2 weeks
    });
  }
  return out;
};

// ----------------------------
// Current user (demo)
// Stored in localStorage under athCurrentUser when edited from My Profile.
// NOTE: Sensitive fields are kept for verification only and must never be fully shown publicly.

window.CURRENT_USER_DEFAULT = {
  id: "me",
  role: "dual", // customer | tradie | dual
  displayName: "Jayden",
  avatar: "https://static.photos/people/320x240/301",
  avatarDataUrl: "", // user-uploaded avatar stored locally for prototype
  location: { suburb: "Pakenham", state: "VIC", postcode: "3810" },
  contact: { phone: "", email: "" },
  auth: { provider: "local", uid: null }, // future Google sign-in: provider "google" + uid
  tradie: {
    // Batch L: tradies can pick multiple trades (stored as trade IDs from TRADE_CATEGORIES)
    trades: ['building']
  },
  privacy: {
    showLocation: true,
    addressRule: "afterAccepted" // never | afterAccepted | afterJobStarts
  },
  verification: {
    verified: false,
    abnFull: "",
    licenseFull: ""
  }
};

window.TRADIES = {
  // IDs are used in: profile-tradesman.html?id=<id> and messages.html?conversation=<conversationId>

  liam: {
    id: "liam",
    name: "Liam Thompson",
    trade: "Electrician",
    location: "Melbourne, VIC",
    rating: "4.8",
    // Batch M: reviewCount is the canonical review counter shown in UI (derived later from real reviews)
    reviewCount: 3,
    verified: true,
    image: "https://randomuser.me/api/portraits/men/32.jpg",
    conversationId: "liam-thompson",
    yearLevel: 3,
    about:
      "Reliable sparky for residential + light commercial. Safety-first, tidy work, clear quotes.",
    reviews: [
      { author: "Paul S.", date: "2 weeks ago", rating: 5, text: "Liam did a great job on our switchboard. Very tidy." },
      { author: "Karen M.", date: "1 month ago", rating: 4.5, text: "Good communication and arrived on time." },
      { author: "Mike R.", date: "2 months ago", rating: 5, text: "Fixed the lighting issue quickly. Highly recommend." }
    ]
  },
  olivia: {
    id: "olivia",
    name: "Olivia Chen",
    trade: "Plumber",
    location: "Pakenham, VIC",
    rating: "4.7",
    reviewCount: 2,
    verified: true,
    image: "https://randomuser.me/api/portraits/women/65.jpg",
    conversationId: "olivia-chen",
    yearLevel: 5,
    about:
      "Blocked drains, hot water systems, leaking taps. Fast response and upfront pricing.",
    reviews: [
      { author: "James K.", date: "1 week ago", rating: 5, text: "Saved us on a weekend! Fast and professional." },
      { author: "Elena G.", date: "3 weeks ago", rating: 4.5, text: "Fixed the leak, very transparent pricing." }
    ]
  },
  noah: {
    id: "noah",
    name: "Noah Williams",
    trade: "Carpenter",
    location: "Dandenong, VIC",
    rating: "4.6",
    reviewCount: 0,
    verified: false,
    image: "https://randomuser.me/api/portraits/men/45.jpg",
    conversationId: "noah-williams",
    yearLevel: 2,
    about:
      "Decks, pergolas, framing, small renovations. Clean finish and good communication."
  },

  // Tradies shown on browse + home
  mark: {
    id: "mark",
    name: "Mark Johnson",
    trade: "Plumber",
    location: "Sydney, NSW",
    rating: "4.9",
    reviewCount: 18,
    verified: true,
    image: "https://randomuser.me/api/portraits/men/11.jpg",
    conversationId: "mark-johnson",
    yearLevel: 6,
    about:
      "Residential + commercial plumbing. Fast response, clean work, transparent pricing.",
    reviews: [
      { author: "Tom W.", date: "3 days ago", rating: 5, text: "Mark is the best plumber we've used. Efficient and honest." },
      { author: "Sarah L.", date: "1 week ago", rating: 5, text: "Clean work, great price. Will use again." },
      { author: "David B.", date: "2 weeks ago", rating: 4.8, text: "Professional service, highly recommended." }
    ]
  },
  sarah: {
    id: "sarah",
    name: "Sarah Chen",
    trade: "Electrician",
    location: "Melbourne, VIC",
    rating: "4.7",
    reviewCount: 14,
    verified: true,
    image: "https://randomuser.me/api/portraits/women/33.jpg",
    conversationId: "sarah-chen",
    yearLevel: 7,
    about:
      "Switchboards, lighting, fault-finding, compliance work. Licensed and punctual.",
    reviews: [
      { author: "Greg M.", date: "4 days ago", rating: 5, text: "Sarah rewired our kitchen. Fantastic job." },
      { author: "Lisa T.", date: "2 weeks ago", rating: 4.5, text: "Very knowledgeable and thorough." }
    ]
  },
  david: {
    id: "david",
    name: "David Wilson",
    trade: "Carpenter",
    location: "Brisbane, QLD",
    rating: "5.0",
    reviewCount: 9,
    verified: true,
    image: "https://randomuser.me/api/portraits/men/22.jpg",
    conversationId: "david-wilson",
    yearLevel: 8,
    about:
      "Decking, framing, pergolas, renos. High-end finish, reliable timelines.",
    reviews: [
      { author: "Brad C.", date: "1 month ago", rating: 5, text: "The deck looks amazing. David is a true craftsman." },
      { author: "Jenny P.", date: "2 months ago", rating: 5, text: "On time and on budget. Love the new pergola." }
    ]
  },
  lisa: {
    id: "lisa",
    name: "Lisa Brown",
    trade: "Painter",
    location: "Perth, WA",
    rating: "4.6",
    reviewCount: 7,
    verified: true,
    image: "https://randomuser.me/api/portraits/women/40.jpg",
    conversationId: "lisa-brown",
    yearLevel: 4,
    about:
      "Interior/exterior painting, patch + prep, clean lines. Protective masking + tidy handover.",
    reviews: [
      { author: "Ryan K.", date: "3 weeks ago", rating: 4.5, text: "Great finish on the walls. Very careful with furniture." },
      { author: "Amanda J.", date: "1 month ago", rating: 5, text: "Lisa transformed our living room. Beautiful work." }
    ]
  },
  james: {
    id: "james",
    name: "James Taylor",
    trade: "Landscaper",
    location: "Adelaide, SA",
    rating: "4.9",
    reviewCount: 11,
    verified: true,
    image: "https://randomuser.me/api/portraits/men/55.jpg",
    conversationId: "james-taylor",
    yearLevel: 6,
    about:
      "Garden cleanups, turf, planting, edging, ongoing maintenance. Efficient and consistent.",
    reviews: [
      { author: "Linda W.", date: "1 week ago", rating: 5, text: "James did an amazing job on our garden. Looks brand new." },
      { author: "Peter H.", date: "3 weeks ago", rating: 4.8, text: "Reliable and hard working. Good value." }
    ]
  }
};

Object.keys(window.TRADIES || {}).forEach((id) => {
  const t = window.TRADIES[id];
  if (!t) return;
  if (!Array.isArray(t.trades) || t.trades.length === 0) {
    t.trades = window.inferTradeIdsFromText(t.trade);
  }
  if (!Array.isArray(t.reviews)) {
    t.reviews = window.makeDemoReviews(t.reviewCount, parseFloat(t.rating || '0'), 'Customer');
  }
});

window.CUSTOMERS = {
  // IDs are used in: profile-customer.html?id=<id> and messages.html?conversation=<conversationId>
  "michael-roberts": {
    name: "Michael Roberts",
    typeLabel: "Homeowner",
    typeColor: "bg-blue-500",
    location: "Sydney, NSW",
    tagline: "Member since 2022",
    rating: "4.3",
    reviewCount: 12,
    image: "https://static.photos/people/320x240/301",
    conversationId: "michael-roberts",
    about:
      "Homeowner looking for various home services. Has completed 8 projects and values clear communication and tidy work."
  },
  "sarah-johnson": {
    name: "Sarah Johnson",
    typeLabel: "Business",
    typeColor: "bg-purple-500",
    location: "Melbourne, VIC",
    tagline: "Property Manager",
    rating: "4.8",
    reviewCount: 26,
    image: "https://static.photos/office/320x240/302",
    conversationId: "sarah-johnson",
    about:
      "Property manager coordinating ongoing works. Prefers quotes with clear scope and reliable scheduling."
  },
  "david-chen": {
    name: "David Chen",
    typeLabel: "Homeowner",
    typeColor: "bg-blue-500",
    location: "Brisbane, QLD",
    tagline: "Member since 2023",
    rating: "4.5",
    reviewCount: 8,
    image: "https://static.photos/people/320x240/303",
    conversationId: "david-chen",
    about:
      "Planning home improvement projects (deck build). Looking for a tradie who can guide material choices and timelines."
  },
  "lisa-williams": {
    name: "Lisa Williams",
    typeLabel: "Real Estate",
    typeColor: "bg-green-500",
    location: "Perth, WA",
    tagline: "Real Estate Agency",
    rating: "4.9",
    reviewCount: 63,
    image: "https://static.photos/workspace/320x240/304",
    conversationId: "lisa-williams",
    about:
      "Real estate agency managing multiple properties. Regular work for reliable tradies. Prompt payment."
  },
  "robert-kim": {
    name: "Robert Kim",
    typeLabel: "Homeowner",
    typeColor: "bg-blue-500",
    location: "Adelaide, SA",
    tagline: "Member since 2021",
    rating: "4.2",
    reviewCount: 5,
    image: "https://static.photos/people/320x240/305",
    conversationId: "robert-kim",
    about:
      "Occasional projects and emergency repairs. Values quick response and quality work."
  }
};

Object.keys(window.CUSTOMERS || {}).forEach((id) => {
  const c = window.CUSTOMERS[id];
  if (!c) return;
  if (!Array.isArray(c.reviews)) {
    c.reviews = window.makeDemoReviews(c.reviewCount, parseFloat(c.rating || '0'), 'Tradie');
  }
});

// Inject current user into datasets based on selected role (localStorage athCurrentUser)
(function(){
  try {
    const raw = localStorage.getItem("athCurrentUser");
    const u = raw ? JSON.parse(raw) : window.CURRENT_USER_DEFAULT;
    const role = (u && u.role) ? u.role : (window.CURRENT_USER_DEFAULT.role || "dual");
    const loc = `${(u.location?.suburb||"")} ${(u.location?.state||"")}`.trim();
    const location = loc.replace(/\s+/g, " ").replace(/""/g, "");
    const displayLoc = `${u.location?.suburb || ""}, ${u.location?.state || ""}`.replace("undefined","").replace(" ,","").trim();

    const enableCustomer = (role === "customer" || role === "dual");
    const enableTradie = (role === "tradie" || role === "dual");

    if (enableTradie) {
      const tradeIds = Array.isArray(u.tradie?.trades) && u.tradie.trades.length
        ? u.tradie.trades
        : (u.tradie?.trade ? window.inferTradeIdsFromText(u.tradie.trade) : window.inferTradeIdsFromText('builder'));
      const tradeLabelLine = tradeIds.map(window.tradeLabel).join(' • ');
      window.TRADIES.me = {
        name: u.displayName || "Me",
        trade: tradeLabelLine || "General Contractor",
        trades: tradeIds,
        location: displayLoc,
        rating: "—",
        reviewCount: 0,
        verified: !!u.verification?.verified,
        image: u.avatarDataUrl || u.avatar || "https://static.photos/people/320x240/301",
        conversationId: "me",
        about: "This is your public tradie profile preview."
      };
    } else {
      delete window.TRADIES.me;
    }

    if (enableCustomer) {
      window.CUSTOMERS.me = {
        name: u.displayName || "Me",
        typeLabel: "Customer",
        typeColor: "bg-blue-500",
        location: displayLoc,
        tagline: "Your account",
        rating: "—",
        reviewCount: 0,
        image: u.avatarDataUrl || u.avatar || "https://static.photos/people/320x240/301",
        conversationId: "me",
        about: "This is your public customer profile preview."
      };
    } else {
      delete window.CUSTOMERS.me;
    }
  } catch(e) { /* ignore */ }
})();


// Conversations dataset (single source of truth for Messages page)

// Each message has a numeric ts (ms since epoch) to support ordering + unread logic.
// Note: This is a static prototype dataset (no backend yet).
window.CONVERSATIONS = {
  "michael-roberts": {
    name: "Michael Roberts",
    meta: "Homeowner • Sydney, NSW",
    avatar: "https://static.photos/people/320x240/301",
  avatarDataUrl: "", // user-uploaded avatar stored locally for prototype
    online: true,
    tag: { label: "Bathroom Renovation", color: "bg-blue-100 text-blue-800" },
    messages: [
      { from: "them", time: "10:15 AM", ts: 1768676100000, text: "When can you start?" },
      { from: "me", time: "10:24 AM", ts: 1768676640000, text: "Next Monday works." }
    ]
  },
  "sarah-johnson": {
    name: "Sarah Johnson",
    meta: "Office Manager • Melbourne, VIC",
    avatar: "https://static.photos/office/320x240/302",
    online: true,
    tag: { label: "Office Electrical", color: "bg-purple-100 text-purple-800" },
    messages: [
      { from: "them", time: "Yesterday", ts: 1768590000000, text: "I've attached the electrical schematics for the office upgrade project." }
    ]
  },
  "david-chen": {
    name: "David Chen",
    meta: "Homeowner • Brisbane, QLD",
    avatar: "https://static.photos/people/320x240/303",
    online: false,
    tag: { label: "Deck Construction", color: "bg-green-100 text-green-800" },
    messages: [
      { from: "them", time: "2 days ago", ts: 1768503600000, text: "The timber has arrived. Are you still available to start next Monday?" }
    ]
  },
  "lisa-williams": {
    name: "Lisa Williams",
    meta: "Real Estate • Perth, WA",
    avatar: "https://static.photos/workspace/320x240/304",
    online: true,
    tag: { label: "Maintenance Contract", color: "bg-blue-100 text-blue-800" },
    messages: [
      { from: "them", time: "3 days ago", ts: 1768417200000, text: "Can you provide a quote for the monthly maintenance contract?" }
    ]
  },
  "robert-kim": {
    name: "Robert Kim",
    meta: "Homeowner • Adelaide, SA",
    avatar: "https://static.photos/people/320x240/305",
    online: false,
    tag: { label: "Emergency Callout", color: "bg-red-100 text-red-800" },
    messages: [
      { from: "them", time: "1 week ago", ts: 1768068000000, text: "We have a leaking pipe under the sink — can you come ASAP?" }
    ]
  },

  // Tradie conversations (reachable via tradie profiles)
  "mark-johnson": {
    name: "Mark Johnson",
    meta: "Licensed Plumber • Sydney, NSW",
    avatar: "https://static.photos/construction/320x240/201",
    online: true,
    tag: { label: "Plumbing", color: "bg-blue-100 text-blue-800" },
    messages: [
      { from: "them", time: "2 weeks ago", ts: 1767463200000, text: "Thanks for the great work last time — can you quote another job?" }
    ]
  },
  "sarah-chen": {
    name: "Sarah Chen",
    meta: "Master Electrician • Melbourne, VIC",
    avatar: "https://randomuser.me/api/portraits/women/33.jpg",
    online: false,
    tag: { label: "Electrical Inspection", color: "bg-purple-100 text-purple-800" },
    messages: [
      { from: "them", time: "3 weeks ago", ts: 1766858400000, text: "When can you schedule the electrical inspection?" }
    ]
  },
  "liam-thompson": {
    name: "Liam Thompson",
    meta: "Licensed Electrician • Melbourne, VIC",
    avatar: "https://randomuser.me/api/portraits/men/32.jpg",
    online: true,
    tag: { label: "Switchboard Upgrade", color: "bg-purple-100 text-purple-800" },
    messages: [
      { from: "them", time: "Now", ts: 1768677000000, text: "Hey mate, can you do a quick quote for a switchboard upgrade?" },
      { from: "me", time: "Now", ts: 1768677060000, text: "Yep — send photos of the board and your suburb and I'll price it." }
    ]
  },
  "olivia-chen": {
    name: "Olivia Chen",
    meta: "Plumber • Pakenham, VIC",
    avatar: "https://randomuser.me/api/portraits/women/65.jpg",
    online: true,
    tag: { label: "Hot Water", color: "bg-blue-100 text-blue-800" },
    messages: [
      { from: "them", time: "Now", ts: 1768677300000, text: "Hot water system playing up — can you take a look tomorrow?" }
    ]
  },
  "noah-williams": {
    name: "Noah Williams",
    meta: "Carpenter • Dandenong, VIC",
    avatar: "https://randomuser.me/api/portraits/men/45.jpg",
    online: false,
    tag: { label: "Pergola", color: "bg-green-100 text-green-800" },
    messages: [
      { from: "them", time: "Yesterday", ts: 1768593000000, text: "Looking at a small pergola — what do you need from me to quote?" }
    ]
  },
  "david-wilson": {
    name: "David Wilson",
    meta: "Master Carpenter • Brisbane, QLD",
    avatar: "https://randomuser.me/api/portraits/men/22.jpg",
    online: false,
    tag: { label: "Decking", color: "bg-green-100 text-green-800" },
    messages: [
      { from: "them", time: "Last week", ts: 1768071600000, text: "Thanks again — the decking came up unreal." }
    ]
  },
  "lisa-brown": {
    name: "Lisa Brown",
    meta: "Professional Painter • Perth, WA",
    avatar: "https://randomuser.me/api/portraits/women/40.jpg",
    online: true,
    tag: { label: "Painting", color: "bg-yellow-100 text-yellow-800" },
    messages: [
      { from: "them", time: "2 days ago", ts: 1768507200000, text: "Can you squeeze in a bedroom repaint next week?" }
    ]
  },
  "james-taylor": {
    name: "James Taylor",
    meta: "Landscape Gardener • Adelaide, SA",
    avatar: "https://randomuser.me/api/portraits/men/55.jpg",
    online: true,
    tag: { label: "Garden Cleanup", color: "bg-green-100 text-green-800" },
    messages: [
      { from: "them", time: "3 days ago", ts: 1768420800000, text: "Need a quick garden cleanup before an inspection — available this weekend?" }
    ]
  }
};

// Jobs dataset (Job Board)
// Schema:
//  {
//    id, title, description, category, location, state,
//    budgetMin, budgetMax, timeline, urgency, type,
//    quotes, customerId, postedAt (ISO), status
//  }
window.JOBS = [
  {
    id: 'job-bathroom-reno-001',
    title: 'Bathroom Renovation',
    description: 'Full bathroom remodel including tiling, plumbing, and electrical work. Need completion within 2–3 weeks.',
    categories: ['plumbing', 'electrical', 'tiling'],
    location: 'Sydney, NSW',
    state: 'NSW',
    budgetMin: 8000,
    budgetMax: 12000,
    timeline: '2–3 weeks',
    urgency: 'urgent',
    type: 'contract',
    quotes: 3,
    customerId: 'michael-roberts',
    postedAt: '2026-01-18T07:15:00.000Z',
    status: 'open'
  },
  {
    id: 'job-office-electrical-002',
    title: 'Office Electrical Upgrade',
    description: 'Commercial electrical work for 10 office units. LED lighting installation and power point upgrades. Specs available.',
    categories: ['electrical'],
    location: 'Melbourne, VIC',
    state: 'VIC',
    budgetMin: 15000,
    budgetMax: 25000,
    timeline: 'Flexible',
    urgency: 'week',
    type: 'contract',
    quotes: 8,
    customerId: 'sarah-johnson',
    postedAt: '2026-01-17T03:00:00.000Z',
    status: 'open'
  },
  {
    id: 'job-deck-003',
    title: 'Deck Construction (6x4m)',
    description: 'Build a 6x4m timber deck with stairs and railing. Materials provided by customer. Start in 3–4 weeks.',
    categories: ['carpentry'],
    location: 'Brisbane, QLD',
    state: 'QLD',
    budgetMin: 3500,
    budgetMax: 5000,
    timeline: '2 weeks',
    urgency: 'flexible',
    type: 'one-off',
    quotes: 12,
    customerId: 'david-chen',
    postedAt: '2026-01-16T01:30:00.000Z',
    status: 'open'
  },
  {
    id: 'job-interior-paint-004',
    title: 'Interior repaint (3 bedrooms)',
    description: 'Prep + paint 3 bedrooms. Walls + trims. Customer to supply paint if recommended. Prefer tidy & quick turnaround.',
    categories: ['painting'],
    location: 'Perth, WA',
    state: 'WA',
    budgetMin: 900,
    budgetMax: 1800,
    timeline: '3–5 days',
    urgency: 'week',
    type: 'one-off',
    quotes: 4,
    customerId: 'lisa-williams',
    postedAt: '2026-01-15T05:00:00.000Z',
    status: 'open'
  },
  {
    id: 'job-garden-cleanup-005',
    title: 'Garden cleanup before inspection',
    description: 'Mow, edge, weed, green waste removal. Need done this weekend before property inspection.',
    categories: ['gardening'],
    location: 'Adelaide, SA',
    state: 'SA',
    budgetMin: 250,
    budgetMax: 450,
    timeline: '1 day',
    urgency: 'urgent',
    type: 'one-off',
    quotes: 2,
    customerId: 'robert-kim',
    postedAt: '2026-01-18T00:20:00.000Z',
    status: 'open'
  },
  {
    id: 'job-hot-water-006',
    title: 'Hot water system replacement',
    description: 'Existing unit failing. Need supply + install of suitable replacement, and disposal of old unit.',
    categories: ['plumbing'],
    location: 'Pakenham, VIC',
    state: 'VIC',
    budgetMin: 1200,
    budgetMax: 2500,
    timeline: '1–2 days',
    urgency: 'urgent',
    type: 'one-off',
    quotes: 5,
    customerId: 'michael-roberts',
    postedAt: '2026-01-17T23:10:00.000Z',
    status: 'open'
  },
  {
    id: 'job-lawn-ongoing-007',
    title: 'Ongoing lawn maintenance (fortnightly)',
    description: 'Small front + backyard. Fortnightly mow/edge and seasonal tidy-ups.',
    categories: ['gardening'],
    location: 'Melbourne, VIC',
    state: 'VIC',
    budgetMin: 80,
    budgetMax: 140,
    timeline: 'Ongoing',
    urgency: 'flexible',
    type: 'ongoing',
    quotes: 6,
    customerId: 'sarah-johnson',
    postedAt: '2026-01-14T02:00:00.000Z',
    status: 'open'
  },
  {
    id: 'job-bond-clean-008',
    title: 'Bond clean (2 bed unit)',
    description: 'End-of-lease clean. Kitchen, bathroom, floors, windows. Must be completed by Friday.',
    categories: ['cleaning'],
    location: 'Sydney, NSW',
    state: 'NSW',
    budgetMin: 300,
    budgetMax: 550,
    timeline: '1 day',
    urgency: 'week',
    type: 'one-off',
    quotes: 9,
    customerId: 'lisa-williams',
    postedAt: '2026-01-13T10:30:00.000Z',
    status: 'open'
  },
  {
    id: 'job-handy-009',
    title: 'Fix doors + replace handles',
    description: '3 internal doors sticking. Replace 2 handles and align hinges. Quick handyman job.',
    categories: ['handyman'],
    location: 'Brisbane, QLD',
    state: 'QLD',
    budgetMin: 180,
    budgetMax: 350,
    timeline: 'Half day',
    urgency: 'flexible',
    type: 'one-off',
    quotes: 1,
    customerId: 'david-chen',
    postedAt: '2026-01-12T00:15:00.000Z',
    status: 'open'
  },
  {
    id: 'job-switchboard-010',
    title: 'Switchboard safety check',
    description: 'Need a licensed electrician to inspect switchboard, test RCDs, and provide compliance note.',
    categories: ['electrical'],
    location: 'Adelaide, SA',
    state: 'SA',
    budgetMin: 220,
    budgetMax: 420,
    timeline: '1–2 hours',
    urgency: 'week',
    type: 'one-off',
    quotes: 7,
    customerId: 'robert-kim',
    postedAt: '2026-01-11T04:45:00.000Z',
    status: 'open'
  },
  {
    id: 'job-fence-011',
    title: 'Replace side fence (approx. 18m)',
    description: 'Old timber fence needs replacement. Prefer treated pine. Please include removal of old fence and materials.',
    categories: ['carpentry', 'building'],
    location: 'Perth, WA',
    state: 'WA',
    budgetMin: 4000,
    budgetMax: 6500,
    timeline: '1 week',
    urgency: 'flexible',
    type: 'contract',
    quotes: 3,
    customerId: 'lisa-williams',
    postedAt: '2026-01-10T09:00:00.000Z',
    status: 'open'
  },
  {
    id: 'job-kitchen-tap-012',
    title: 'Kitchen tap leaking',
    description: 'Tap is dripping constantly. Might need new mixer. Accessible under-sink plumbing.',
    categories: ['plumbing'],
    location: 'Melbourne, VIC',
    state: 'VIC',
    budgetMin: 150,
    budgetMax: 380,
    timeline: '1–2 hours',
    urgency: 'urgent',
    type: 'one-off',
    quotes: 2,
    customerId: 'sarah-johnson',
    postedAt: '2026-01-18T02:40:00.000Z',
    status: 'open'
  }
];

// ------------------------------------------------------------
// CUSTOMERS — Customer profiles data
// ------------------------------------------------------------
Object.assign(window.CUSTOMERS, {
  'sarah-mitchell': {
    id: 'sarah-mitchell',
    name: 'Sarah Mitchell',
    typeLabel: 'Homeowner',
    typeColor: 'bg-blue-500',
    location: 'Bondi, NSW',
    serviceArea: 'Eastern Suburbs, Sydney',
    memberSince: '2024-03-15',
    rating: '4.8',
    reviewCount: 12,
    jobsPosted: 8,
    jobsCompleted: 7,
    verified: true,
    image: 'https://randomuser.me/api/portraits/women/44.jpg',
    bio: 'Homeowner looking for reliable tradies for ongoing property maintenance and occasional renovations.',
    preferredJobs: ['Residential', 'Renovation', 'Repair']
  },
  'david-chen': {
    id: 'david-chen',
    name: 'David Chen',
    typeLabel: 'Homeowner',
    typeColor: 'bg-blue-500',
    location: 'Parramatta, NSW',
    serviceArea: 'Western Sydney, NSW',
    memberSince: '2023-11-20',
    rating: '5.0',
    reviewCount: 15,
    jobsPosted: 10,
    jobsCompleted: 10,
    verified: true,
    image: 'https://randomuser.me/api/portraits/men/32.jpg',
    bio: 'Property investor managing multiple rental properties. Always need quick, quality work from licensed professionals.',
    preferredJobs: ['Emergency', 'Repair', 'Commercial']
  },
  'emma-wilson': {
    id: 'emma-wilson',
    name: 'Emma Wilson',
    typeLabel: 'Business',
    typeColor: 'bg-purple-500',
    location: 'Melbourne, VIC',
    serviceArea: 'Melbourne Metro, VIC',
    memberSince: '2025-01-08',
    rating: '4.9',
    reviewCount: 6,
    jobsPosted: 4,
    jobsCompleted: 4,
    verified: true,
    image: 'https://randomuser.me/api/portraits/women/68.jpg',
    bio: 'Small business owner needing commercial fit-outs and maintenance for office spaces.',
    preferredJobs: ['Commercial', 'Renovation']
  },
  'michael-brown': {
    id: 'michael-brown',
    name: 'Michael Brown',
    typeLabel: 'Homeowner',
    typeColor: 'bg-blue-500',
    location: 'Brisbane, QLD',
    serviceArea: 'Brisbane, QLD',
    memberSince: '2024-06-12',
    rating: '4.7',
    reviewCount: 9,
    jobsPosted: 6,
    jobsCompleted: 5,
    verified: true,
    image: 'https://randomuser.me/api/portraits/men/86.jpg',
    bio: 'Renovating our family home room by room. Looking for skilled tradies who take pride in their work.',
    preferredJobs: ['Residential', 'Renovation']
  },
  'lisa-taylor': {
    id: 'lisa-taylor',
    name: 'Lisa Taylor',
    typeLabel: 'Real Estate',
    typeColor: 'bg-green-500',
    location: 'Sydney, NSW',
    serviceArea: 'Greater Sydney, NSW',
    memberSince: '2023-09-30',
    rating: '5.0',
    reviewCount: 18,
    jobsPosted: 12,
    jobsCompleted: 12,
    verified: true,
    image: 'https://randomuser.me/api/portraits/women/22.jpg',
    bio: 'Real estate agent coordinating repairs and renovations for property sales. Fast payment, clear communication.',
    preferredJobs: ['Residential', 'Repair', 'Emergency']
  },
  'james-anderson': {
    id: 'james-anderson',
    name: 'James Anderson',
    typeLabel: 'Homeowner',
    typeColor: 'bg-blue-500',
    location: 'Perth, WA',
    serviceArea: 'Perth Metro, WA',
    memberSince: '2024-02-18',
    rating: '4.6',
    reviewCount: 7,
    jobsPosted: 5,
    jobsCompleted: 4,
    verified: true,
    bio: 'Building our dream home. Need experienced tradies for outdoor landscaping and deck construction.',
    preferredJobs: ['New Build', 'Residential']
  },
  'rachel-nguyen': {
    id: 'rachel-nguyen',
    name: 'Rachel Nguyen',
    typeLabel: 'Business',
    typeColor: 'bg-purple-500',
    location: 'Adelaide, SA',
    serviceArea: 'Adelaide, SA',
    memberSince: '2024-08-05',
    rating: '4.9',
    reviewCount: 11,
    jobsPosted: 8,
    jobsCompleted: 7,
    verified: true,
    bio: 'Restaurant owner needing commercial kitchen maintenance and occasional emergency repairs.',
    preferredJobs: ['Commercial', 'Emergency', 'Repair']
  },
  'tom-roberts': {
    id: 'tom-roberts',
    name: 'Tom Roberts',
    typeLabel: 'Homeowner',
    typeColor: 'bg-blue-500',
    location: 'Gold Coast, QLD',
    serviceArea: 'Gold Coast, QLD',
    memberSince: '2025-01-12',
    rating: '5.0',
    reviewCount: 3,
    jobsPosted: 2,
    jobsCompleted: 2,
    verified: true,
    bio: 'First home buyer tackling DIY projects but need professionals for electrical and plumbing work.',
    preferredJobs: ['Residential', 'Repair']
  },
  'kate-sullivan': {
    id: 'kate-sullivan',
    name: 'Kate Sullivan',
    typeLabel: 'Homeowner',
    typeColor: 'bg-blue-500',
    location: 'Canberra, ACT',
    serviceArea: 'Canberra, ACT',
    memberSince: '2024-04-22',
    rating: '4.8',
    reviewCount: 14,
    jobsPosted: 10,
    jobsCompleted: 9,
    verified: true,
    bio: 'Managing rental properties for family investment portfolio. Reliability and clear quotes are essential.',
    preferredJobs: ['Residential', 'Repair', 'Renovation']
  },
  'mark-johnson': {
    id: 'mark-johnson',
    name: 'Mark Johnson',
    typeLabel: 'Business',
    typeColor: 'bg-purple-500',
    location: 'Newcastle, NSW',
    serviceArea: 'Newcastle, NSW',
    memberSince: '2023-12-10',
    rating: '4.9',
    reviewCount: 16,
    jobsPosted: 11,
    jobsCompleted: 10,
    verified: true,
    bio: 'Contractor coordinating sub-contractors for residential builds and renovations across Newcastle region.',
    preferredJobs: ['New Build', 'Commercial', 'Residential']
  }
});
