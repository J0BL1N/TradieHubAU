/**
 * generate-beta-access-cards.mjs
 *
 * Light TradieHubAU beta access card generator.
 *
 * Outputs:
 *   private/beta/profile-card-images/<name>-front.png
 *   private/beta/profile-card-images/<name>-back.png
 *   private/beta/profile-card-pdfs/<name>.pdf
 *   private/beta/TradieHubAU_Beta_Access_Cards.zip (full run only)
 *
 * Usage:
 *   node scripts/generate-beta-access-cards.mjs --sample
 *   node scripts/generate-beta-access-cards.mjs --all
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE_MD = path.join(ROOT, 'private', 'beta', 'BETA_TEST_PROFILE_CARDS.md');
const PNG_DIR = path.join(ROOT, 'private', 'beta', 'profile-card-images');
const PDF_DIR = path.join(ROOT, 'private', 'beta', 'profile-card-pdfs');
const ZIP_PATH = path.join(ROOT, 'private', 'beta', 'TradieHubAU_Beta_Access_Cards.zip');

const W = 1080;
const H = 680;
const SAMPLE_FILENAMES = new Set([
  'Customer-01-Sarah-Mitchell',
  'Tradie-01-Lingo-Chen',
]);

const P = {
  card: '#fbfaf6',
  card2: '#f4f1ea',
  ink: '#07101f',
  text: '#0b1220',
  muted: '#4b5563',
  faint: '#e5e0d6',
  line: '#d8d2c8',
  orange: '#ff4b0b',
  orange2: '#ff7a00',
  amber: '#f7c20a',
  yellow: '#ffd43b',
  black: '#09111f',
  green: '#49a313',
  greenDark: '#2f7d0a',
  cream: '#fff7df',
  panel: '#ffffff',
};

function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function trunc(s, max) {
  if (!s) return '';
  const v = String(s);
  return v.length > max ? `${v.slice(0, max - 1)}...` : v;
}

function splitLines(text, charsPerLine, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const next = `${current} ${word}`.trim();
    if (next.length <= charsPerLine) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = trunc(lines[maxLines - 1], charsPerLine);
  }
  return lines;
}

function serialFor(t) {
  const roleCode = t.isTradie ? 'T' : 'C';
  return `THAU-${roleCode}${t.num}-2026-005`;
}

function iconBox(x, y, kind) {
  const glyphs = {
    id: `<circle cx="21" cy="19" r="6"/><path d="M12 36c2-9 22-9 24 0"/><path d="M31 15h12M31 23h9M31 31h12"/>`,
    user: `<circle cx="25" cy="18" r="8"/><path d="M10 39c3-15 27-15 30 0"/>`,
    pin: `<path d="M25 9c-8 0-14 6-14 14 0 11 14 25 14 25s14-14 14-25c0-8-6-14-14-14z"/><circle cx="25" cy="23" r="5" fill="${P.card}"/>`,
    brief: `<rect x="10" y="18" width="30" height="22" rx="4"/><path d="M17 18v-5h16v5M10 27h30"/><rect x="22" y="25" width="6" height="5" fill="${P.card}"/>`,
    bolt: `<path d="M29 7 15 31h12l-5 17 16-27H26z"/>`,
    shield: `<path d="M25 8 39 14v10c0 11-7 19-14 23-7-4-14-12-14-23V14z"/>`,
    cash: `<path d="M10 17h30v22H10z"/><circle cx="25" cy="28" r="6" fill="${P.card}"/><path d="M14 22h5M31 34h5"/>`,
    clock: `<circle cx="25" cy="28" r="14"/><path d="M25 18v11l8 5"/>`,
  };

  return `
  <rect x="${x}" y="${y}" width="50" height="50" rx="6" fill="${P.card}" stroke="${P.orange}" stroke-width="2"/>
  <g transform="translate(${x} ${y})" fill="${P.orange}" stroke="${P.orange}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${glyphs[kind] || glyphs.id}
  </g>`;
}

function calendarIcon(x, y) {
  return `
  <rect x="${x}" y="${y}" width="36" height="36" rx="5" fill="none" stroke="${P.ink}" stroke-width="3"/>
  <path d="M8 12h20M11 5v8M25 5v8" transform="translate(${x} ${y})" stroke="${P.ink}" stroke-width="3" stroke-linecap="round"/>
  <g fill="${P.ink}">
    <rect x="${x + 10}" y="${y + 19}" width="4" height="4"/><rect x="${x + 17}" y="${y + 19}" width="4" height="4"/><rect x="${x + 24}" y="${y + 19}" width="4" height="4"/>
    <rect x="${x + 10}" y="${y + 26}" width="4" height="4"/><rect x="${x + 17}" y="${y + 26}" width="4" height="4"/><rect x="${x + 24}" y="${y + 26}" width="4" height="4"/>
  </g>`;
}

function hazardStripes(x, y, width, height, id) {
  const stripeWidth = 30;
  const count = Math.ceil(width / stripeWidth) + 4;
  return `
  <clipPath id="haz${id}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="2"/></clipPath>
  <g clip-path="url(#haz${id})">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${P.ink}"/>
    ${Array.from({ length: count }, (_, i) => {
      const sx = x - 40 + i * stripeWidth;
      return `<polygon points="${sx},${y + height} ${sx + 18},${y + height} ${sx + 58},${y} ${sx + 40},${y}" fill="${P.yellow}"/>`;
    }).join('')}
  </g>`;
}

function logo(x, y, scale = 1) {
  const s = scale;
  return `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M8 35 42 5l34 30" fill="none" stroke="${P.ink}" stroke-width="7" stroke-linejoin="round"/>
    <path d="M20 35v32h43V35" fill="none" stroke="${P.ink}" stroke-width="6"/>
    <path d="M14 50h18M52 50h18" stroke="${P.orange}" stroke-width="5" stroke-linecap="square"/>
    <path d="M47 31l13 10-13 10 4-10z" fill="${P.ink}"/>
    <rect x="4" y="27" width="9" height="25" fill="${P.orange}"/>
  </g>
  <text x="${x + 96 * scale}" y="${y + 38 * scale}" font-size="${38 * scale}" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${P.ink}">TradieHub<tspan fill="${P.orange}">AU</tspan></text>
  <text x="${x + 98 * scale}" y="${y + 63 * scale}" font-size="${13 * scale}" font-weight="700" font-family="Arial,sans-serif" fill="${P.ink}">Find trusted tradies. Pay with confidence.</text>`;
}

function shell(id) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="cardBg${id}" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${P.card}"/>
    <stop offset="100%" stop-color="${P.card2}"/>
  </linearGradient>
  <linearGradient id="orange${id}" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="${P.orange}"/>
    <stop offset="100%" stop-color="${P.orange2}"/>
  </linearGradient>
  <linearGradient id="amber${id}" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="${P.amber}"/>
    <stop offset="100%" stop-color="${P.yellow}"/>
  </linearGradient>
  <filter id="shadow${id}" x="-10%" y="-10%" width="120%" height="130%">
    <feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#000000" flood-opacity="0.18"/>
  </filter>
  <clipPath id="clip${id}"><rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="27"/></clipPath>
</defs>
<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="27" fill="url(#cardBg${id})" stroke="${P.line}" filter="url(#shadow${id})"/>
<g clip-path="url(#clip${id})">`;
}

function closeShell() {
  return `
</g>
</svg>`;
}

function verifiedBadge(x, y, label) {
  return `
  <rect x="${x}" y="${y}" width="282" height="44" rx="8" fill="${P.card}" stroke="${P.green}" stroke-width="2"/>
  <circle cx="${x + 28}" cy="${y + 22}" r="16" fill="${P.green}"/>
  <path d="m${x + 20} ${y + 22} 6 6 12-15" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="${x + 53}" y="${y + 29}" font-size="17" font-weight="900" letter-spacing="1.1" font-family="Arial Black,Arial,sans-serif" fill="${P.ink}">${esc(label)}</text>`;
}

function roleBadge(t) {
  if (t.isTradie) return verifiedBadge(758, 34, 'VERIFIED TRADIE');
  return `
  <rect x="842" y="36" width="186" height="40" rx="8" fill="${P.card}" stroke="${P.orange}" stroke-width="2"/>
  <text x="935" y="63" text-anchor="middle" font-size="18" font-weight="900" letter-spacing="2" font-family="Arial Black,Arial,sans-serif" fill="${P.ink}">CUSTOMER</text>`;
}

function infoRow(x, y, icon, label, value, options = {}) {
  const valueSize = options.valueSize || 21;
  const valueColor = options.valueColor || P.text;
  return `
  ${iconBox(x, y, icon)}
  <text x="${x + 68}" y="${y + 17}" font-size="13" font-family="Arial,sans-serif" font-weight="800" letter-spacing="1.1" fill="${P.text}">${esc(label)}</text>
  <text x="${x + 68}" y="${y + 42}" font-size="${valueSize}" font-family="Arial Black,Arial,sans-serif" font-weight="900" fill="${valueColor}">${esc(value)}</text>
  <line x1="${x + 68}" y1="${y + 55}" x2="${x + 244}" y2="${y + 55}" stroke="${P.line}" stroke-width="1"/>`;
}

function buildFront(t) {
  const id = `F${t.filename.replace(/[^a-zA-Z0-9]/g, '')}`;
  const isTradie = t.isTradie;
  const serial = serialFor(t);
  const rightRows = isTradie
    ? [
        ['brief', 'BUSINESS', trunc(t.business, 29), 17, P.text],
        ['bolt', 'TRADE CATEGORY', String(t.trade || '').toUpperCase(), 20, P.orange],
        ['shield', 'FAKE LICENCE', t.licence, 20, P.text],
      ]
    : [
        ['brief', 'JOB SCENARIO', trunc(t.scenario, 30), 17, P.text],
        ['cash', 'BUDGET', t.budget, 20, P.orange],
        ['clock', 'URGENCY', String(t.urgency || '').toUpperCase(), 18, P.text],
      ];

  return shell(id) + `
  <rect x="6" y="6" width="32" height="172" fill="${P.ink}"/>
  ${hazardStripes(6, 22, 32, 124, `${id}left`)}
  <path d="M998 122 1068 32v288l-62 58 44-124-88 124z" fill="url(#orange${id})"/>
  <text x="706" y="236" font-size="148" font-family="Arial Black,Arial,sans-serif" fill="#d8d8d8" opacity="0.45" font-style="italic">TH</text>
  <text x="865" y="234" font-size="60" font-family="Arial Black,Arial,sans-serif" fill="#d8d8d8" opacity="0.45" font-style="italic">AU</text>

  ${logo(66, 38, 0.74)}
  ${roleBadge(t)}

  <text x="66" y="174" font-size="47" font-weight="900" letter-spacing="1" font-family="Arial Black,Arial,sans-serif" fill="${P.ink}">BETA</text>
  <text x="214" y="174" font-size="47" font-weight="900" letter-spacing="1" font-family="Arial Black,Arial,sans-serif" fill="${P.orange}">ACCESS</text>
  <text x="438" y="174" font-size="47" font-weight="900" letter-spacing="1" font-family="Arial Black,Arial,sans-serif" fill="${P.ink}">PASS</text>
  <line x1="66" y1="194" x2="542" y2="194" stroke="${P.orange}" stroke-width="2"/>
  <line x1="66" y1="199" x2="720" y2="199" stroke="${P.line}" stroke-width="1"/>

  ${infoRow(66, 222, 'id', 'TESTER ID', t.testerId.toUpperCase(), { valueSize: 22 })}
  ${infoRow(66, 294, 'user', 'NAME', trunc(t.name, 22), { valueSize: 21 })}
  ${infoRow(66, 366, 'pin', 'LOCATION', t.location, { valueSize: 20 })}

  ${infoRow(464, 222, rightRows[0][0], rightRows[0][1], rightRows[0][2], { valueSize: rightRows[0][3], valueColor: rightRows[0][4] })}
  ${infoRow(464, 294, rightRows[1][0], rightRows[1][1], rightRows[1][2], { valueSize: rightRows[1][3], valueColor: rightRows[1][4] })}
  ${infoRow(464, 366, rightRows[2][0], rightRows[2][1], rightRows[2][2], { valueSize: rightRows[2][3], valueColor: rightRows[2][4] })}

  <g transform="translate(810 282)">
    <path d="M77 0 154 44v88l-77 44L0 132V44z" fill="none" stroke="${P.orange}" stroke-width="2"/>
    <path d="M77 22 139 58v72l-62 36-62-36V58z" fill="${P.card}" opacity="0.78"/>
    <text x="77" y="54" text-anchor="middle" font-size="25" fill="${P.orange}" font-family="Arial Black,Arial,sans-serif">*</text>
    <text x="77" y="92" text-anchor="middle" font-size="28" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${P.orange}">BETA</text>
    <text x="77" y="124" text-anchor="middle" font-size="28" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${P.ink}">TESTER</text>
    <line x1="66" y1="144" x2="88" y2="144" stroke="${P.orange}" stroke-width="3"/>
  </g>

  <rect x="6" y="524" width="${W - 12}" height="64" fill="#efede8" opacity="0.82"/>
  ${calendarIcon(70, 542)}
  <text x="122" y="559" font-size="13" font-weight="900" letter-spacing="1.2" font-family="Arial,sans-serif" fill="${P.text}">BATCH</text>
  <text x="122" y="581" font-size="18" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${P.text}">discord-beta-001</text>
  <line x1="384" y1="540" x2="384" y2="584" stroke="${P.line}"/>
  ${calendarIcon(414, 542)}
  <text x="466" y="559" font-size="13" font-weight="900" letter-spacing="1.2" font-family="Arial,sans-serif" fill="${P.text}">ISSUED</text>
  <text x="466" y="581" font-size="18" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${P.text}">June 2026</text>
  <line x1="648" y1="540" x2="648" y2="584" stroke="${P.line}"/>
  <text x="684" y="575" font-size="41" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${P.ink}">#</text>
  <text x="734" y="559" font-size="13" font-weight="900" letter-spacing="1.2" font-family="Arial,sans-serif" fill="${P.text}">SERIAL</text>
  <text x="734" y="581" font-size="18" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${P.text}">${serial}</text>

  <rect x="6" y="588" width="${W - 12}" height="86" fill="url(#amber${id})"/>
  <path d="M82 625h16l-8-17z" fill="none" stroke="${P.ink}" stroke-width="2.5" stroke-linejoin="round"/>
  <line x1="90" y1="613" x2="90" y2="620" stroke="${P.ink}" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="90" cy="624" r="1.7" fill="${P.ink}"/>
  <text x="118" y="624" font-size="19" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${P.ink}">Beta testing account only. Not a real ID.</text>
  <text x="648" y="624" font-size="13" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${P.ink}">TradieHubAU Beta Programme 2026</text>
  ${hazardStripes(966, 588, 98, 86, `${id}bottom`)}
  ` + closeShell();
}

function credentialsPanel(t) {
  return `
  <rect x="64" y="130" width="444" height="246" rx="10" fill="${P.panel}" stroke="${P.line}"/>
  <text x="98" y="166" font-size="16" font-weight="900" letter-spacing="1.4" font-family="Arial Black,Arial,sans-serif" fill="${P.orange}">LOGIN CREDENTIALS</text>
  <text x="98" y="216" font-size="16" font-weight="800" letter-spacing="1.2" font-family="Arial,sans-serif" fill="${P.muted}">EMAIL</text>
  <text x="98" y="248" font-size="19" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${P.text}">${esc(t.email)}</text>
  <text x="98" y="300" font-size="16" font-weight="800" letter-spacing="1.2" font-family="Arial,sans-serif" fill="${P.muted}">PASSWORD</text>
  <text x="98" y="333" font-size="26" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${P.orange}">${esc(t.password)}</text>
  <rect x="88" y="346" width="386" height="52" rx="8" fill="${P.cream}" stroke="#f2d8a2"/>
  <circle cx="116" cy="372" r="13" fill="none" stroke="${P.orange}" stroke-width="3"/>
  <text x="116" y="381" text-anchor="middle" font-size="25" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${P.orange}">i</text>
  <text x="146" y="378" font-size="15" font-family="Arial,sans-serif" fill="${P.text}">Use these details to log in to the beta platform.</text>`;
}

function missionPanel(t) {
  const missionLines = splitLines(t.mission, 44, 3);
  return `
  <rect x="540" y="130" width="476" height="246" rx="10" fill="${P.panel}" stroke="${P.line}"/>
  <text x="596" y="166" font-size="16" font-weight="900" letter-spacing="1.4" font-family="Arial Black,Arial,sans-serif" fill="${P.orange}">YOUR MISSION</text>
  ${missionLines.map((line, i) => `<text x="596" y="${206 + i * 24}" font-size="18" font-family="Arial,sans-serif" fill="${P.text}">${esc(line)}</text>`).join('\n  ')}
  <line x1="582" y1="270" x2="858" y2="270" stroke="${P.line}" />
  <text x="596" y="308" font-size="16" font-weight="900" letter-spacing="1.4" font-family="Arial Black,Arial,sans-serif" fill="${P.orange}">GIVE FEEDBACK</text>
  <text x="596" y="340" font-size="17" font-family="Arial,sans-serif" fill="${P.text}">Help us build a better platform.</text>
  <rect x="596" y="354" width="170" height="42" rx="8" fill="url(#orangeB${t.filename.replace(/[^a-zA-Z0-9]/g, '')})"/>
  <text x="681" y="382" text-anchor="middle" font-size="20" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="#fff">/beta-feedback</text>
  <g transform="translate(878 258)" fill="none" stroke="#c4c4c4" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="0" y="28" width="92" height="94" rx="9"/>
    <path d="M30 28v-12h32v12"/>
    <path d="M22 62l11 11 19-22" stroke="${P.orange}"/>
    <path d="M22 88l11 11 19-22" stroke="${P.orange}"/>
    <path d="M58 68h24M58 94h24"/>
  </g>`;
}

function barcode(x, y, width, height, seed) {
  let cursor = x;
  const bars = [];
  for (let i = 0; i < seed.length * 4 && cursor < x + width; i++) {
    const code = seed.charCodeAt(i % seed.length);
    const barW = 2 + ((code + i) % 4);
    const gap = 2 + ((code + i * 3) % 3);
    bars.push(`<rect x="${cursor}" y="${y}" width="${barW}" height="${height}" fill="${P.ink}"/>`);
    cursor += barW + gap;
  }
  return `<g>${bars.join('')}</g>`;
}

function buildBack(t) {
  const id = `B${t.filename.replace(/[^a-zA-Z0-9]/g, '')}`;
  const serial = serialFor(t);
  const warning = 'Use fake information only. Do not enter real personal details, real payment details, or private documents.';

  return shell(id) + `
  ${logo(60, 38, 0.58)}
  <text x="520" y="67" font-size="13" font-weight="900" letter-spacing="1.2" font-family="Arial,sans-serif" fill="${P.ink}">REAL TRADIES. REAL JOBS. <tspan fill="${P.orange}">REAL CONFIDENCE.</tspan></text>

  ${credentialsPanel(t)}
  ${missionPanel(t)}

  <rect x="6" y="454" width="${W - 12}" height="84" fill="#efede8" opacity="0.75"/>
  <rect x="64" y="470" width="250" height="54" rx="6" fill="url(#amber${id})"/>
  <path d="M111 510h42l-21-45z" fill="none" stroke="${P.ink}" stroke-width="4" stroke-linejoin="round"/>
  <line x1="132" y1="478" x2="132" y2="496" stroke="${P.ink}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="132" cy="506" r="3" fill="${P.ink}"/>
  <text x="178" y="505" font-size="20" font-weight="900" font-family="Arial Black,Arial,sans-serif" fill="${P.ink}">IMPORTANT</text>
  <text x="338" y="492" font-size="17" font-family="Arial,sans-serif" fill="${P.text}">${esc(splitLines(warning, 72, 1)[0])}</text>
  <text x="338" y="518" font-size="17" font-family="Arial,sans-serif" fill="${P.text}">${esc(splitLines(warning, 72, 2)[1] || '')}</text>

  ${barcode(708, 560, 320, 44, serial)}
  <text x="868" y="626" text-anchor="middle" font-size="17" letter-spacing="3" font-family="Arial,sans-serif" fill="${P.text}">${serial}</text>
  <text x="66" y="626" font-size="15" font-family="Arial,sans-serif" fill="${P.muted}">Batch: discord-beta-001</text>
  ${hazardStripes(64, 646, 180, 22, `${id}back`)}
  ` + closeShell();
}

function parseMd(md) {
  const testers = [];
  const sections = md.split(/^### (?=Customer|Tradie)/m).slice(1);

  for (const sec of sections) {
    const lines = sec.trim().split('\n');
    const header = lines[0].trim();
    const isTradie = header.startsWith('Tradie');
    const get = (key) => {
      const line = lines.find((l) => l.includes(`- ${key}:`));
      if (!line) return '';
      return line.replace(/^.*?:\s*`?/, '').replace(/`$/, '').trim();
    };
    const numM = header.match(/(\d+)/);
    const num = numM ? numM[1].padStart(2, '0') : '??';
    const nameM = header.match(/- (.+)$/);
    const name = nameM ? nameM[1].trim() : 'Unknown';
    const t = {
      isTradie,
      num,
      name,
      nameSafe: name.replace(/\s+/g, '-'),
      role: get('Role'),
      email: get('Email'),
      password: get('Password'),
      location: get('Location'),
      mission: get('Mission'),
    };

    if (isTradie) {
      t.business = get('Business');
      t.trade = get('Trade category');
      t.abn = get('Fake ABN');
      t.licence = get('Fake licence');
    } else {
      t.scenario = get('Fake job scenario');
      t.budget = get('Budget range');
      t.urgency = get('Urgency');
    }

    const prefix = isTradie ? 'Tradie' : 'Customer';
    t.filename = `${prefix}-${num}-${t.nameSafe}`;
    t.testerId = `${prefix} ${num}`;
    testers.push(t);
  }

  return testers;
}

async function svgToPng(svgStr, outPath) {
  await sharp(Buffer.from(svgStr, 'utf8'), { density: 150 })
    .png({ quality: 95 })
    .toFile(outPath);
}

async function twoCardPdf(frontPng, backPng, outPath) {
  return new Promise((res, rej) => {
    const doc = new PDFDocument({ size: 'A4', margin: 28 });
    const ws = createWriteStream(outPath);
    doc.pipe(ws);

    const cw = doc.page.width - 56;
    const ch = cw * (H / W);
    const cy = (doc.page.height - ch) / 2;

    doc.image(frontPng, 28, cy, { width: cw });
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

function selectedTesters(testers) {
  const args = new Set(process.argv.slice(2));
  const sampleMode = args.has('--sample') || !args.has('--all');
  if (!sampleMode) return { testers, sampleMode };
  return {
    testers: testers.filter((t) => SAMPLE_FILENAMES.has(t.filename)),
    sampleMode,
  };
}

async function main() {
  console.log('='.repeat(60));
  console.log('  TradieHubAU - Beta Access Card Generator');
  console.log('='.repeat(60));

  await mkdir(PNG_DIR, { recursive: true });
  await mkdir(PDF_DIR, { recursive: true });

  const md = await readFile(SOURCE_MD, 'utf8');
  const parsed = parseMd(md);
  const { testers, sampleMode } = selectedTesters(parsed);
  console.log(`Parsed: ${parsed.length} testers`);
  console.log(`Mode: ${sampleMode ? 'sample' : 'all'} (${testers.length} selected)\n`);

  let frontOk = 0;
  let backOk = 0;
  let pdfOk = 0;
  let errs = 0;

  for (const t of testers) {
    process.stdout.write(`  ${t.filename} ... `);
    try {
      const frontSvg = buildFront(t);
      const backSvg = buildBack(t);
      const frontPath = path.join(PNG_DIR, `${t.filename}-front.png`);
      const backPath = path.join(PNG_DIR, `${t.filename}-back.png`);
      const pdfPath = path.join(PDF_DIR, `${t.filename}.pdf`);

      await svgToPng(frontSvg, frontPath);
      frontOk++;
      await svgToPng(backSvg, backPath);
      backOk++;
      await twoCardPdf(frontPath, backPath, pdfPath);
      pdfOk++;

      console.log('OK');
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      errs++;
    }
  }

  console.log(`\nFront PNGs: ${frontOk}  Back PNGs: ${backOk}  PDFs: ${pdfOk}  Errors: ${errs}`);
  console.log(`  -> ${path.relative(ROOT, PNG_DIR)}/`);
  console.log(`  -> ${path.relative(ROOT, PDF_DIR)}/`);

  if (!sampleMode) {
    try {
      await buildZip();
      console.log(`ZIP: ${path.relative(ROOT, ZIP_PATH)}`);
    } catch (e) {
      console.warn(`ZIP skipped: ${e.message}`);
    }
  } else {
    console.log('ZIP skipped in sample mode.');
  }

  if (errs > 0) process.exitCode = 1;
  console.log('\nDone. Output is under private/beta/ (gitignored).');
  console.log('No Supabase changes. No app route/page changes.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
