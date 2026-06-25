/**
 * generate-beta-access-cards.mjs  (v2)
 *
 * Redesigned: compact CR80-style access card (1080x680 px)
 * Front card: identity, role, scenario/trade info
 * Back card:  credentials, mission, feedback badge
 *
 * Outputs:
 *   private/beta/profile-card-images/<name>-front.png
 *   private/beta/profile-card-images/<name>-back.png
 *   private/beta/profile-card-pdfs/<name>.pdf   (both cards, 1 page each)
 *   private/beta/TradieHubAU_Beta_Access_Cards.zip
 *
 * Usage:  node scripts/generate-beta-access-cards.mjs
 * Run from repo root: F:\TradieHubAU
 */

import { readFile, mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp       = require('sharp');
const PDFDocument = require('pdfkit');
const AdmZip      = require('adm-zip');

// ── Paths ─────────────────────────────────────────────────────────────────────
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const SOURCE_MD  = path.join(ROOT, 'private', 'beta', 'BETA_TEST_PROFILE_CARDS.md');
const PNG_DIR    = path.join(ROOT, 'private', 'beta', 'profile-card-images');
const PDF_DIR    = path.join(ROOT, 'private', 'beta', 'profile-card-pdfs');
const ZIP_PATH   = path.join(ROOT, 'private', 'beta', 'TradieHubAU_Beta_Access_Cards.zip');

// ── Card dimensions  (CR80-style landscape, 1.586 ratio) ─────────────────────
// Rendered at 2× for crisp Discord viewing: 1080 × 680 px
const W = 1080;
const H = 680;

// ── Palette ───────────────────────────────────────────────────────────────────
const P = {
  bg0:     '#0b0e18',   // darkest bg
  bg1:     '#131626',   // card body
  panel:   '#1c2035',   // section panels
  border:  '#252a42',   // subtle borders
  white:   '#f1f5f9',
  muted:   '#7c8bab',
  dim:     '#4a5470',
  gold:    '#f59e0b',
  // per-role overridden below
};

// Customer: orange + blue
const CUS = { ac: '#f97316', ac2: '#fb923c', ac3: '#7c3d0e', tag: '#1d4ed8', tag2: '#1e40af' };
// Tradie: teal + purple
const TRD = { ac: '#14b8a6', ac2: '#2dd4bf', ac3: '#0f5f59', tag: '#7c3aed', tag2: '#6d28d9' };

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function trunc(s, max) {
  if (!s) return '';
  s = String(s);
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

// ── Shared card shell SVG ─────────────────────────────────────────────────────
// Returns opening tags + defs + background layer; caller adds content + closing tags
function cardShell(id_suffix, ac, ac3) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bg${id_suffix}" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#0b0e18"/>
    <stop offset="100%" stop-color="#101422"/>
  </linearGradient>
  <linearGradient id="ac${id_suffix}" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="${ac}"/>
    <stop offset="100%" stop-color="${ac3}"/>
  </linearGradient>
  <linearGradient id="glow${id_suffix}" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="${ac}" stop-opacity="0.7"/>
    <stop offset="70%" stop-color="${ac}" stop-opacity="0.12"/>
    <stop offset="100%" stop-color="${ac}" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="card${id_suffix}"><rect width="${W}" height="${H}" rx="28"/></clipPath>
</defs>
<g clip-path="url(#card${id_suffix})">
  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg${id_suffix})"/>
  <!-- Subtle mesh dots -->
  <g opacity="0.06">
    ${Array.from({length:18},(_,i)=>Array.from({length:11},(_,j)=>`<circle cx="${i*64+32}" cy="${j*68+34}" r="1.5" fill="${ac}"/>`).join('')).join('')}
  </g>
  <!-- Top glow bar -->
  <rect x="0" y="0" width="${W}" height="4" fill="url(#glow${id_suffix})"/>
  <!-- Bottom glow bar (subtle) -->
  <rect x="0" y="${H-3}" width="${W*0.6}" height="3" fill="${ac}" opacity="0.25"/>
  <!-- Left accent stripe -->
  <rect x="0" y="0" width="10" height="${H}" fill="url(#ac${id_suffix})"/>
  <!-- Card border -->
  <rect x="1" y="1" width="${W-2}" height="${H-2}" rx="28" fill="none" stroke="${ac}" stroke-width="1.5" opacity="0.3"/>`;
}

// ── FRONT card SVG ────────────────────────────────────────────────────────────
function buildFront(t) {
  const R = t.isTradie ? TRD : CUS;
  const { ac, ac2, ac3, tag } = R;

  // Layout
  const LM = 36;           // left margin (after stripe)
  const RM = W - 36;       // right margin
  const COL2 = 420;        // second column x
  const COL2W = RM - COL2; // second column width

  const roleLabelW = t.isTradie ? 210 : 152;
  const roleLabel  = (t.role || '').toUpperCase();

  // Extra info panel content
  let extraPanelItems = '';
  if (t.isTradie) {
    extraPanelItems = `
  <!-- Business -->
  <text x="${COL2+20}" y="300" font-size="11" fill="${P.muted}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="1.5">BUSINESS</text>
  <text x="${COL2+20}" y="320" font-size="16" fill="${P.white}" font-family="Arial,sans-serif" font-weight="bold">${esc(trunc(t.business,36))}</text>
  <!-- Trade -->
  <text x="${COL2+20}" y="356" font-size="11" fill="${P.muted}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="1.5">TRADE CATEGORY</text>
  <text x="${COL2+20}" y="376" font-size="18" fill="${ac}" font-family="Arial,sans-serif" font-weight="bold">${esc((t.trade||'').toUpperCase())}</text>
  <!-- Licence -->
  <text x="${COL2+20}" y="412" font-size="11" fill="${P.muted}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="1.5">FAKE LICENCE</text>
  <text x="${COL2+20}" y="432" font-size="15" fill="${P.white}" font-family="Arial,sans-serif" letter-spacing="1">${esc(t.licence)}</text>`;
  } else {
    extraPanelItems = `
  <!-- Scenario -->
  <text x="${COL2+20}" y="300" font-size="11" fill="${P.muted}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="1.5">JOB SCENARIO</text>
  <text x="${COL2+20}" y="320" font-size="15" fill="${P.white}" font-family="Arial,sans-serif">${esc(trunc(t.scenario,40))}</text>
  <!-- Budget -->
  <text x="${COL2+20}" y="360" font-size="11" fill="${P.muted}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="1.5">BUDGET</text>
  <text x="${COL2+20}" y="382" font-size="20" fill="${ac}" font-family="Arial,sans-serif" font-weight="bold">${esc(t.budget)}</text>
  <!-- Urgency -->
  <text x="${COL2+20}" y="418" font-size="11" fill="${P.muted}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="1.5">URGENCY</text>
  <text x="${COL2+20}" y="438" font-size="16" fill="${P.gold}" font-family="Arial,sans-serif" font-weight="bold">${esc((t.urgency||'').toUpperCase())}</text>`;
  }

  return cardShell('F'+t.filename, ac, ac3) + `

  <!-- ═══ HEADER STRIP ═══════════════════════════════════ -->
  <rect x="18" y="18" width="${W-36}" height="72" rx="12" fill="${P.panel}"/>
  <!-- Wordmark -->
  <text x="${LM+12}" y="62" font-size="22" font-weight="900" letter-spacing="1.5" font-family="Arial Black,Arial,sans-serif" fill="${P.white}">TradieHub<tspan fill="${ac}">AU</tspan></text>
  <!-- Title -->
  <text x="${W/2}" y="50" text-anchor="middle" font-size="13" font-weight="900" letter-spacing="4" font-family="Arial Black,Arial,sans-serif" fill="${P.muted}">BETA ACCESS PASS</text>
  <text x="${W/2}" y="70" text-anchor="middle" font-size="11" font-style="italic" font-family="Arial,sans-serif" fill="${P.dim}">Find trusted tradies. Pay with confidence.</text>
  <!-- Role badge -->
  <rect x="${RM-roleLabelW-6}" y="30" width="${roleLabelW}" height="28" rx="14" fill="${tag}"/>
  <text x="${RM-roleLabelW/2-6}" y="49" text-anchor="middle" font-size="12" font-weight="900" letter-spacing="2" font-family="Arial Black,Arial,sans-serif" fill="${P.white}">${esc(roleLabel)}</text>

  <!-- ═══ LEFT COLUMN: Identity ═══════════════════════════ -->
  <rect x="18" y="104" width="${COL2-36}" height="${H-156}" rx="12" fill="${P.panel}"/>

  <!-- Tester ID -->
  <text x="${LM+12}" y="148" font-size="11" fill="${P.muted}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="1.5">TESTER ID</text>
  <text x="${LM+12}" y="174" font-size="28" font-weight="900" letter-spacing="1" font-family="Arial Black,Arial,sans-serif" fill="${ac}">${esc(t.testerId)}</text>

  <!-- Divider -->
  <line x1="${LM+12}" y1="190" x2="${COL2-54}" y2="190" stroke="${P.border}" stroke-width="1"/>

  <!-- Name -->
  <text x="${LM+12}" y="218" font-size="11" fill="${P.muted}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="1.5">NAME</text>
  <text x="${LM+12}" y="244" font-size="26" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${P.white}">${esc(trunc(t.name,22))}</text>

  <!-- Location -->
  <text x="${LM+12}" y="278" font-size="11" fill="${P.muted}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="1.5">LOCATION</text>
  <text x="${LM+12}" y="300" font-size="17" font-family="Arial,sans-serif" fill="${P.white}">${esc(t.location)}</text>

  <!-- Divider -->
  <line x1="${LM+12}" y1="318" x2="${COL2-54}" y2="318" stroke="${P.border}" stroke-width="1"/>

  <!-- Verified badge -->
  <rect x="${LM+12}" y="332" width="140" height="30" rx="15" fill="${ac3}" opacity="0.8"/>
  <text x="${LM+82}" y="352" text-anchor="middle" font-size="11" font-weight="900" letter-spacing="1.5" font-family="Arial Black,Arial,sans-serif" fill="${ac2}">+ VERIFIED TESTER</text>

  <!-- Batch label -->
  <text x="${LM+12}" y="396" font-size="10" fill="${P.dim}" font-family="Arial,sans-serif">Batch: discord-beta-001</text>

  <!-- Avatar circle placeholder (decorative) -->
  <circle cx="${LM+52}" cy="490" r="50" fill="${P.border}"/>
  <circle cx="${LM+52}" cy="490" r="50" fill="none" stroke="${ac}" stroke-width="1.5" opacity="0.4"/>
  <text x="${LM+52}" y="498" text-anchor="middle" font-size="32" font-family="Arial,sans-serif" fill="${ac}" opacity="0.6">${esc(t.name.charAt(0))}</text>
  <text x="${LM+52}" y="560" text-anchor="middle" font-size="10" fill="${P.dim}" font-family="Arial,sans-serif">BETA TESTER</text>

  <!-- ═══ RIGHT COLUMN: Info panel ═══════════════════════ -->
  <rect x="${COL2}" y="104" width="${COL2W-18}" height="${H-156}" rx="12" fill="${P.panel}"/>

  <text x="${COL2+20}" y="148" font-size="11" fill="${P.muted}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="1.5">BETA TESTER DETAILS</text>
  <line x1="${COL2+20}" y1="158" x2="${RM-20}" y2="158" stroke="${P.border}" stroke-width="1"/>

  <!-- Corner accent dot -->
  <circle cx="${RM-24}" cy="128" r="6" fill="${ac}" opacity="0.7"/>

  ${extraPanelItems}

  <!-- Feedback link badge -->
  <rect x="${COL2+20}" y="${H-108}" width="${COL2W-58}" height="36" rx="10" fill="${ac3}" opacity="0.7"/>
  <text x="${COL2+20+12}" y="${H-84}" font-size="14" fill="${ac2}" font-family="Arial,sans-serif" font-weight="bold">&gt; /beta-feedback</text>

  <!-- ═══ FOOTER ══════════════════════════════════════════ -->
  <rect x="18" y="${H-44}" width="${W-36}" height="30" rx="8" fill="${P.border}" opacity="0.6"/>
  <text x="${W/2}" y="${H-24}" text-anchor="middle" font-size="10" fill="${P.dim}" font-family="Arial,sans-serif">Beta testing account only. Not a real ID.  |  TradieHubAU Beta Programme 2026</text>

</g>
</svg>`;
}

// ── BACK card SVG ─────────────────────────────────────────────────────────────
function buildBack(t) {
  const R = t.isTradie ? TRD : CUS;
  const { ac, ac2, ac3, tag } = R;

  const LM = 36;
  const RM = W - 36;
  const missionLines = splitLines(t.mission || '', 68, 3);

  return cardShell('B'+t.filename, ac, ac3) + `

  <!-- ═══ HEADER ═════════════════════════════════════════ -->
  <rect x="18" y="18" width="${W-36}" height="60" rx="12" fill="${P.panel}"/>
  <text x="${LM+12}" y="54" font-size="19" font-weight="900" letter-spacing="1.5" font-family="Arial Black,Arial,sans-serif" fill="${P.white}">TradieHub<tspan fill="${ac}">AU</tspan><tspan font-size="12" fill="${P.muted}" font-weight="400" letter-spacing="0" font-style="italic"> — Beta Access Pass (Back)</tspan></text>
  <text x="${RM-8}" y="54" text-anchor="end" font-size="11" fill="${P.dim}" font-family="Arial,sans-serif">${esc(t.testerId)}</text>

  <!-- ═══ CREDENTIALS PANEL ══════════════════════════════ -->
  <rect x="18" y="92" width="${W-36}" height="182" rx="12" fill="${P.panel}"/>
  <!-- Section heading -->
  <text x="${LM+12}" y="120" font-size="11" fill="${P.muted}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="2">LOGIN CREDENTIALS</text>
  <line x1="${LM+12}" y1="130" x2="${RM-12}" y2="130" stroke="${P.border}" stroke-width="1"/>

  <!-- Email -->
  <text x="${LM+12}" y="158" font-size="11" fill="${P.muted}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="1.5">EMAIL</text>
  <rect x="${LM+12}" y="164" width="${W-80}" height="30" rx="6" fill="${P.bg0}" opacity="0.7"/>
  <text x="${LM+24}" y="184" font-size="15" fill="${P.white}" font-family="Arial,sans-serif" letter-spacing="0.3">${esc(t.email)}</text>

  <!-- Password -->
  <text x="${LM+12}" y="212" font-size="11" fill="${P.muted}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="1.5">PASSWORD</text>
  <rect x="${LM+12}" y="218" width="${W-80}" height="30" rx="6" fill="${P.bg0}" opacity="0.7"/>
  <text x="${LM+24}" y="238" font-size="16" fill="${P.gold}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="1">${esc(t.password)}</text>

  <!-- ═══ MISSION PANEL ═══════════════════════════════════ -->
  <rect x="18" y="286" width="${W-36}" height="162" rx="12" fill="${P.panel}"/>
  <text x="${LM+12}" y="314" font-size="11" fill="${P.muted}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="2">YOUR MISSION</text>
  <line x1="${LM+12}" y1="324" x2="${RM-12}" y2="324" stroke="${P.border}" stroke-width="1"/>
  ${missionLines.map((line, i) => `<text x="${LM+12}" y="${346 + i*24}" font-size="14" fill="${P.white}" font-family="Arial,sans-serif">${esc(line)}</text>`).join('\n  ')}

  <!-- Feedback badge in mission panel corner -->
  <rect x="${RM-180}" y="340" width="156" height="40" rx="10" fill="${ac3}" opacity="0.8"/>
  <text x="${RM-102}" y="356" text-anchor="middle" font-size="10" fill="${ac}" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="1">SUBMIT FEEDBACK</text>
  <text x="${RM-102}" y="372" text-anchor="middle" font-size="13" fill="${ac2}" font-family="Arial,sans-serif" font-weight="bold">/beta-feedback</text>

  <!-- ═══ WARNING PANEL ════════════════════════════════════ -->
  <rect x="18" y="460" width="${W-36}" height="72" rx="12" fill="#1a0a0a"/>
  <rect x="18" y="460" width="5" height="72" rx="3" fill="#dc2626"/>
  <text x="${LM+16}" y="484" font-size="11" fill="#dc2626" font-family="Arial,sans-serif" font-weight="bold" letter-spacing="1.5">!! IMPORTANT</text>
  <text x="${LM+16}" y="503" font-size="12" fill="#f87171" font-family="Arial,sans-serif">Use fake information only. Do not enter real personal details,</text>
  <text x="${LM+16}" y="521" font-size="12" fill="#f87171" font-family="Arial,sans-serif">real payment details, or private documents.</text>

  <!-- ═══ FOOTER ══════════════════════════════════════════ -->
  <rect x="18" y="${H-48}" width="${W-36}" height="30" rx="8" fill="${P.border}" opacity="0.6"/>
  <text x="${LM+12}" y="${H-28}" font-size="10" fill="${P.dim}" font-family="Arial,sans-serif">Batch: discord-beta-001</text>
  <text x="${W/2}" y="${H-28}" text-anchor="middle" font-size="10" fill="${P.dim}" font-family="Arial,sans-serif">TradieHubAU Beta Programme 2026</text>
  <text x="${RM-12}" y="${H-28}" text-anchor="end" font-size="10" fill="${P.dim}" font-family="Arial,sans-serif">${esc(t.testerId)}</text>

</g>
</svg>`;
}

// ── Text wrapping helper ───────────────────────────────────────────────────────
function splitLines(text, charsPerLine, maxLines) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    if (lines.length >= maxLines) break;
    if ((current + ' ' + w).trim().length <= charsPerLine) {
      current = (current + ' ' + w).trim();
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = trunc(lines[maxLines - 1], charsPerLine);
  }
  return lines;
}

// ── Parse markdown ────────────────────────────────────────────────────────────
function parseMd(md) {
  const testers = [];
  const sections = md.split(/^### (?=Customer|Tradie)/m).slice(1);
  for (const sec of sections) {
    const lines = sec.trim().split('\n');
    const header = lines[0].trim();
    const isTradie = header.startsWith('Tradie');
    const get = (key) => {
      const line = lines.find(l => l.includes(`- ${key}:`));
      if (!line) return '';
      return line.replace(/^.*?:\s*`?/, '').replace(/`$/, '').trim();
    };
    const numM  = header.match(/(\d+)/);
    const num   = numM ? numM[1].padStart(2,'0') : '??';
    const nameM = header.match(/- (.+)$/);
    const name  = nameM ? nameM[1].trim() : 'Unknown';
    const t = {
      isTradie, num, name, nameSafe: name.replace(/\s+/g,'-'),
      role: get('Role'), email: get('Email'), password: get('Password'),
      location: get('Location'), mission: get('Mission'),
    };
    if (isTradie) {
      t.business = get('Business'); t.trade = get('Trade category');
      t.abn      = get('Fake ABN'); t.licence = get('Fake licence');
    } else {
      t.scenario = get('Fake job scenario');
      t.budget   = get('Budget range');
      t.urgency  = get('Urgency');
    }
    const prefix  = isTradie ? 'Tradie' : 'Customer';
    t.filename    = `${prefix}-${num}-${t.nameSafe}`;
    t.testerId    = `${prefix} ${num}`;
    testers.push(t);
  }
  return testers;
}

// ── Render helpers ────────────────────────────────────────────────────────────
async function svgToPng(svgStr, outPath) {
  await sharp(Buffer.from(svgStr, 'utf8'), { density: 150 })
    .png({ quality: 95 })
    .toFile(outPath);
}

async function twoCardPdf(frontPng, backPng, outPath) {
  return new Promise((res, rej) => {
    // A4 portrait, one card per page
    const doc = new PDFDocument({ size: 'A4', margin: 28 });
    const ws  = createWriteStream(outPath);
    doc.pipe(ws);

    const pw = doc.page.width;
    const ph = doc.page.height;
    const cw = pw - 56;
    const ch = cw * (H / W);
    const cy = (ph - ch) / 2;

    // Page 1: front
    doc.image(frontPng, 28, cy, { width: cw });

    // Page 2: back
    doc.addPage();
    doc.image(backPng, 28, cy, { width: cw });

    doc.end();
    ws.on('finish', res);
    ws.on('error', rej);
  });
}

async function buildZip() {
  const zip = new AdmZip();
  zip.addLocalFolder(PNG_DIR, 'profile-card-images');
  zip.addLocalFolder(PDF_DIR, 'profile-card-pdfs');
  await zip.writeZipPromise(ZIP_PATH);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('  TradieHubAU - Beta Access Card Generator  (v2)');
  console.log('='.repeat(60));

  await mkdir(PNG_DIR, { recursive: true });
  await mkdir(PDF_DIR, { recursive: true });

  const md      = await readFile(SOURCE_MD, 'utf8');
  const testers = parseMd(md);
  console.log(`Parsed: ${testers.length} testers\n`);

  let frontOk = 0, backOk = 0, pdfOk = 0, errs = 0;

  for (const t of testers) {
    process.stdout.write(`  ${t.filename} ... `);
    try {
      const frontSvg  = buildFront(t);
      const backSvg   = buildBack(t);
      const frontPath = path.join(PNG_DIR, `${t.filename}-front.png`);
      const backPath  = path.join(PNG_DIR, `${t.filename}-back.png`);
      const pdfPath   = path.join(PDF_DIR, `${t.filename}.pdf`);

      await svgToPng(frontSvg, frontPath);
      frontOk++;
      await svgToPng(backSvg, backPath);
      backOk++;
      await twoCardPdf(frontPath, backPath, pdfPath);
      pdfOk++;

      console.log('OK');
    } catch(e) {
      console.log(`ERROR: ${e.message}`);
      errs++;
    }
  }

  console.log(`\nFront PNGs: ${frontOk}  Back PNGs: ${backOk}  PDFs: ${pdfOk}  Errors: ${errs}`);
  console.log(`  -> ${path.relative(ROOT, PNG_DIR)}/`);
  console.log(`  -> ${path.relative(ROOT, PDF_DIR)}/`);

  try {
    await buildZip();
    console.log(`ZIP: ${path.relative(ROOT, ZIP_PATH)}`);
  } catch(e) {
    console.warn(`ZIP skipped: ${e.message}`);
  }

  console.log('\nDone. All output in private/beta/ (gitignored).');
  console.log('No Supabase changes. No app changes.');
}

main().catch(e => { console.error(e); process.exit(1); });