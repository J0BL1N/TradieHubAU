/**
 * generate-beta-access-cards.mjs
 *
 * Generates individual license-style Beta Access Card PNGs and PDFs
 * for each tester in private/beta/BETA_TEST_PROFILE_CARDS.md.
 *
 * Output:
 *   private/beta/profile-card-images/   <- PNGs
 *   private/beta/profile-card-pdfs/     <- PDFs
 *   private/beta/TradieHubAU_Beta_Access_Cards.zip
 *
 * Usage:
 *   node scripts/generate-beta-access-cards.mjs
 *
 * Requires: sharp  pdfkit  archiver  (installed in scripts/node_modules)
 * Run from: F:\TradieHubAU  (the repo root)
 *
 * Safe: reads only private/beta/BETA_TEST_PROFILE_CARDS.md
 *       writes only to private/beta/ (gitignored)
 *       does NOT touch Supabase, app code, or migrations
 */

import { readFile, mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const AdmZip = require('adm-zip');

// Paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT     = path.resolve(__dirname, '..');
const SOURCE_MD = path.join(ROOT, 'private', 'beta', 'BETA_TEST_PROFILE_CARDS.md');
const PNG_DIR   = path.join(ROOT, 'private', 'beta', 'profile-card-images');
const PDF_DIR   = path.join(ROOT, 'private', 'beta', 'profile-card-pdfs');
const ZIP_PATH  = path.join(ROOT, 'private', 'beta', 'TradieHubAU_Beta_Access_Cards.zip');

// Card dimensions (landscape, ~16:9)
const W = 1600;
const H = 900;

// Colours
const C = {
  bg:          '#0f1117',
  panel:       '#1a1d27',
  accent:      '#f97316',
  accentDim:   '#7c3d0e',
  teal:        '#14b8a6',
  tealDim:     '#0f766e',
  gold:        '#f59e0b',
  white:       '#f8fafc',
  muted:       '#94a3b8',
  border:      '#2a2d3a',
  customerTag: '#1d4ed8',
  tradieTag:   '#7c3aed',
};

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

function qr(x, y, sz) {
  const c = sz / 9;
  const p = [
    [1,1,1,0,1,0,1,1,1],[1,0,1,0,0,0,1,0,1],[1,0,1,0,1,0,1,0,1],
    [0,0,0,1,0,1,0,0,0],[1,0,1,0,1,0,1,0,1],[0,0,0,1,0,1,0,0,0],
    [1,0,1,0,1,0,1,0,1],[1,0,1,0,0,0,1,0,1],[1,1,1,0,1,0,1,1,1],
  ];
  let s = `<rect x="${x-3}" y="${y-3}" width="${sz+6}" height="${sz+6}" rx="6" fill="#1a1d27" stroke="#f97316" stroke-width="2"/>`;
  p.forEach((row, ri) => row.forEach((on, ci) => {
    if (on) s += `<rect x="${x+ci*c}" y="${y+ri*c}" width="${c-1}" height="${c-1}" rx="1" fill="#f97316"/>`;
  }));
  return s;
}

function buildSvg(t) {
  const ac  = t.isTradie ? C.teal    : C.accent;
  const acd = t.isTradie ? C.tealDim : C.accentDim;
  const rc  = t.isTradie ? C.tradieTag : C.customerTag;

  const L  = 56;    // left margin
  const C2 = 460;   // col 2
  const C3 = 900;   // col 3
  const QX = 1460;  // QR x
  const QY = 78;
  const QS = 110;

  let extra = '';
  if (t.isTradie) {
    extra = `
<text x="${C2}" y="480" font-size="17" fill="${C.muted}" font-family="Arial,sans-serif" font-weight="bold">BUSINESS</text>
<text x="${C2}" y="506" font-size="21" fill="${C.white}" font-family="Arial,sans-serif">${esc(trunc(t.business, 40))}</text>
<text x="${C2}" y="548" font-size="17" fill="${C.muted}" font-family="Arial,sans-serif" font-weight="bold">TRADE</text>
<text x="${C2}" y="574" font-size="22" fill="${ac}" font-family="Arial,sans-serif" font-weight="bold">${esc((t.trade||'').toUpperCase())}</text>
<text x="${C3}" y="480" font-size="17" fill="${C.muted}" font-family="Arial,sans-serif" font-weight="bold">FAKE ABN</text>
<text x="${C3}" y="506" font-size="21" fill="${C.white}" font-family="Arial,sans-serif" letter-spacing="1">${esc(t.abn)}</text>
<text x="${C3}" y="548" font-size="17" fill="${C.muted}" font-family="Arial,sans-serif" font-weight="bold">FAKE LICENCE</text>
<text x="${C3}" y="574" font-size="21" fill="${C.white}" font-family="Arial,sans-serif" letter-spacing="1">${esc(t.licence)}</text>`;
  } else {
    extra = `
<text x="${C2}" y="480" font-size="17" fill="${C.muted}" font-family="Arial,sans-serif" font-weight="bold">JOB SCENARIO</text>
<text x="${C2}" y="506" font-size="20" fill="${C.white}" font-family="Arial,sans-serif">${esc(trunc(t.scenario, 48))}</text>
<text x="${C2}" y="548" font-size="17" fill="${C.muted}" font-family="Arial,sans-serif" font-weight="bold">BUDGET</text>
<text x="${C2}" y="574" font-size="22" fill="${ac}" font-family="Arial,sans-serif" font-weight="bold">${esc(t.budget)}</text>
<text x="${C3}" y="480" font-size="17" fill="${C.muted}" font-family="Arial,sans-serif" font-weight="bold">URGENCY</text>
<text x="${C3}" y="506" font-size="22" fill="${C.gold}" font-family="Arial,sans-serif" font-weight="bold">${esc((t.urgency||'').toUpperCase())}</text>`;
  }

  const roleLabelW = t.isTradie ? 232 : 172;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#0f1117"/><stop offset="100%" stop-color="#151823"/>
  </linearGradient>
  <linearGradient id="bar" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="${ac}"/><stop offset="100%" stop-color="${acd}"/>
  </linearGradient>
  <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="${ac}" stop-opacity="0.6"/>
    <stop offset="60%" stop-color="${ac}" stop-opacity="0.1"/>
    <stop offset="100%" stop-color="${ac}" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="clip"><rect width="${W}" height="${H}" rx="32"/></clipPath>
</defs>
<g clip-path="url(#clip)">
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- subtle dots -->
  ${[...Array(14)].map((_,i)=>`<circle cx="${110*i+55}" cy="${H-36}" r="2" fill="${ac}" opacity="0.12"/>`).join('')}
  <!-- top glow bar -->
  <rect x="0" y="0" width="${W}" height="5" fill="url(#glow)"/>
  <!-- left stripe -->
  <rect x="0" y="0" width="13" height="${H}" fill="url(#bar)"/>
  <!-- inner panel -->
  <rect x="24" y="18" width="${W-42}" height="${H-36}" rx="18" fill="${C.panel}" opacity="0.5"/>

  <!-- HEADER -->
  <text x="${L}" y="76" font-size="28" font-weight="900" letter-spacing="2" font-family="Arial Black,Arial,sans-serif" fill="${C.white}">TradieHub<tspan fill="${ac}">AU</tspan></text>
  <!-- role badge -->
  <rect x="${L}" y="88" width="${roleLabelW}" height="36" rx="18" fill="${rc}"/>
  <text x="${L + roleLabelW/2}" y="111" text-anchor="middle" font-size="17" font-weight="900" letter-spacing="2" font-family="Arial Black,Arial,sans-serif" fill="${C.white}">${esc((t.role||'').toUpperCase())}</text>
  <!-- title -->
  <text x="${W/2}" y="70" text-anchor="middle" font-size="38" font-weight="900" letter-spacing="4" font-family="Arial Black,Arial,sans-serif" fill="${C.white}">BETA ACCESS CARD</text>
  <!-- slogan -->
  <text x="${W/2}" y="99" text-anchor="middle" font-size="17" font-style="italic" font-family="Arial,sans-serif" fill="${C.muted}">Find trusted tradies. Pay with confidence.</text>
  <!-- batch -->
  <text x="${W-56}" y="70" text-anchor="end" font-size="15" font-family="Arial,sans-serif" fill="${C.muted}">discord-beta-001</text>
  <!-- divider -->
  <line x1="${L}" y1="144" x2="${W-56}" y2="144" stroke="${C.border}" stroke-width="1.5"/>

  <!-- COL 1: Identity -->
  <text x="${L}" y="202" font-size="16" fill="${C.muted}" font-family="Arial,sans-serif" font-weight="bold">TESTER ID</text>
  <text x="${L}" y="232" font-size="30" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${ac}" letter-spacing="1">${esc(t.testerId)}</text>
  <text x="${L}" y="276" font-size="16" fill="${C.muted}" font-family="Arial,sans-serif" font-weight="bold">NAME</text>
  <text x="${L}" y="308" font-size="32" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${C.white}">${esc(t.name)}</text>
  <text x="${L}" y="356" font-size="16" fill="${C.muted}" font-family="Arial,sans-serif" font-weight="bold">LOCATION</text>
  <text x="${L}" y="384" font-size="22" font-family="Arial,sans-serif" fill="${C.white}">${esc(t.location)}</text>

  <!-- COL 2/3: Credentials -->
  <text x="${C2}" y="202" font-size="16" fill="${C.muted}" font-family="Arial,sans-serif" font-weight="bold">LOGIN EMAIL</text>
  <text x="${C2}" y="226" font-size="18" font-family="Arial,sans-serif" fill="${C.white}" letter-spacing="0.3">${esc(t.email)}</text>
  <text x="${C2}" y="268" font-size="16" fill="${C.muted}" font-family="Arial,sans-serif" font-weight="bold">PASSWORD</text>
  <text x="${C2}" y="294" font-size="22" font-family="Arial,sans-serif" fill="${C.gold}" letter-spacing="1" font-weight="bold">${esc(t.password)}</text>
  <text x="${C2}" y="342" font-size="16" fill="${C.muted}" font-family="Arial,sans-serif" font-weight="bold">FEEDBACK LINK</text>
  <rect x="${C2}" y="350" width="210" height="32" rx="8" fill="${acd}" opacity="0.6"/>
  <text x="${C2+10}" y="372" font-size="19" font-family="Arial,sans-serif" fill="${ac}" font-weight="bold">/beta-feedback</text>

  ${extra}

  <!-- MISSION -->
  <line x1="${L}" y1="610" x2="${W-56}" y2="610" stroke="${C.border}" stroke-width="1"/>
  <text x="${L}" y="638" font-size="15" fill="${C.muted}" font-family="Arial,sans-serif" font-weight="bold">YOUR MISSION</text>
  <text x="${L}" y="662" font-size="18" font-family="Arial,sans-serif" fill="${C.white}">${esc(trunc(t.mission, 140))}</text>

  <!-- STAMP -->
  <g transform="translate(${W-242},555) rotate(-16)">
    <rect x="0" y="0" width="205" height="82" rx="8" fill="none" stroke="${C.teal}" stroke-width="2.5" opacity="0.75"/>
    <text x="102" y="29" text-anchor="middle" font-size="12" font-weight="900" letter-spacing="2" font-family="Arial Black,Arial,sans-serif" fill="${C.teal}" opacity="0.9">&#x2713; VERIFIED</text>
    <text x="102" y="52" text-anchor="middle" font-size="12" font-weight="900" letter-spacing="2" font-family="Arial Black,Arial,sans-serif" fill="${C.teal}" opacity="0.9">BETA TESTER</text>
    <text x="102" y="69" text-anchor="middle" font-size="11" letter-spacing="1" font-family="Arial,sans-serif" fill="${C.teal}" opacity="0.7">discord-beta-001</text>
  </g>

  <!-- QR placeholder -->
  ${qr(QX, QY, QS)}
  <text x="${QX + QS/2}" y="${QY + QS + 18}" text-anchor="middle" font-size="13" font-family="Arial,sans-serif" fill="${C.muted}">/beta-feedback</text>

  <!-- DISCLAIMER -->
  <rect x="${L}" y="${H-50}" width="${W-112}" height="28" rx="5" fill="#dc2626" opacity="0.12"/>
  <text x="${W/2}" y="${H-31}" text-anchor="middle" font-size="14" font-family="Arial,sans-serif" fill="${C.muted}">&#x26A0; Not a real ID. Beta testing account only. Use fake information only.</text>
</g>
<rect x="1" y="1" width="${W-2}" height="${H-2}" rx="32" fill="none" stroke="${ac}" stroke-width="2" opacity="0.35"/>
</svg>`;
}

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
    const numM = header.match(/(\d+)/);
    const num  = numM ? numM[1].padStart(2,'0') : '??';
    const nameM = header.match(/- (.+)$/);
    const name  = nameM ? nameM[1].trim() : 'Unknown';
    const t = {
      isTradie, num, name, nameSafe: name.replace(/\s+/g,'-'),
      role: get('Role'), email: get('Email'), password: get('Password'),
      location: get('Location'), mission: get('Mission'),
    };
    if (isTradie) {
      t.business = get('Business'); t.trade = get('Trade category');
      t.abn = get('Fake ABN');     t.licence = get('Fake licence');
    } else {
      t.scenario = get('Fake job scenario'); t.budget = get('Budget range');
      t.urgency  = get('Urgency');
    }
    const prefix = isTradie ? 'Tradie' : 'Customer';
    t.filename = `${prefix}-${num}-${t.nameSafe}`;
    t.testerId = `${prefix} ${num}`;
    testers.push(t);
  }
  return testers;
}

async function svgToPng(svgStr, outPath) {
  await sharp(Buffer.from(svgStr, 'utf8'), { density: 144 })
    .png({ quality: 95 })
    .toFile(outPath);
}

async function pngToPdf(pngPath, outPath) {
  return new Promise((res, rej) => {
    const doc = new PDFDocument({ layout: 'landscape', size: 'A4', margin: 28 });
    const ws  = createWriteStream(outPath);
    doc.pipe(ws);
    const pw = doc.page.width, ph = doc.page.height;
    const cw = pw - 56, ch = cw * (H / W), cy = (ph - ch) / 2;
    doc.image(pngPath, 28, cy, { width: cw });
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

async function main() {
  console.log('='.repeat(60));
  console.log('  TradieHubAU - Beta Access Card Generator');
  console.log('='.repeat(60));
  await mkdir(PNG_DIR, { recursive: true });
  await mkdir(PDF_DIR, { recursive: true });

  const md = await readFile(SOURCE_MD, 'utf8');
  const testers = parseMd(md);
  console.log(`Parsed: ${testers.length} testers\n`);

  let pngOk = 0, pdfOk = 0, errs = 0;
  for (const t of testers) {
    process.stdout.write(`  ${t.filename} ... `);
    try {
      const svg = buildSvg(t);
      const pngPath = path.join(PNG_DIR, `${t.filename}.png`);
      const pdfPath = path.join(PDF_DIR, `${t.filename}.pdf`);
      await svgToPng(svg, pngPath);
      await pngToPdf(pngPath, pdfPath);
      pngOk++; pdfOk++;
      console.log('OK');
    } catch(e) {
      console.log(`ERROR: ${e.message}`);
      errs++;
    }
  }

  console.log(`\nPNGs: ${pngOk}  PDFs: ${pdfOk}  Errors: ${errs}`);
  console.log(`  -> ${path.relative(ROOT, PNG_DIR)}/`);
  console.log(`  -> ${path.relative(ROOT, PDF_DIR)}/`);

  try {
    await buildZip();
    console.log(`ZIP: ${path.relative(ROOT, ZIP_PATH)}`);
  } catch(e) {
    console.warn(`ZIP skipped: ${e.message}`);
  }

  console.log('\nDone. All output in private/beta/ (gitignored).');
  console.log('No Supabase changes. No app changes. No commits.');
}

main().catch(e => { console.error(e); process.exit(1); });
