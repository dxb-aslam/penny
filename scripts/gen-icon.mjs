// Penny — generate launcher icon art (a gold coin minted with the Penny face)
// → assets/icon-foreground.png, icon-background.png, icon-only.png, splash.png(+dark)
// Run: node scripts/gen-icon.mjs   then: npx @capacitor/assets generate --android
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('assets', { recursive: true });
const S = 1024;

// The Penny face (coral blob + eyes + smile) drawn in a 40-unit grid, reusable.
function pennyFace(cx, cy, d) {
  const s = d / 40;
  return `
  <g transform="translate(${cx - d / 2} ${cy - d / 2}) scale(${s})">
    <ellipse cx="20" cy="20" rx="19.5" ry="19.5" fill="url(#coral)"/>
    <ellipse cx="20" cy="20" rx="19.5" ry="19.5" fill="url(#coralShade)" opacity="0.5"/>
    <g fill="#3A2418">
      <rect x="13" y="15" width="3.6" height="8" rx="1.8"/>
      <rect x="23.4" y="15" width="3.6" height="8" rx="1.8"/>
    </g>
    <path d="M16 28 q4 3 8 0" stroke="#3A2418" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </g>`;
}

// A gold coin centered at (cx,cy) radius r, with the Penny face minted on it.
function coin(cx, cy, r) {
  return `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gold)"/>
  <circle cx="${cx}" cy="${cy}" r="${r - 2}" fill="none" stroke="#A8731C" stroke-width="6" opacity="0.55"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.86}" fill="none" stroke="#FBE7B8" stroke-width="6" opacity="0.7"/>
  <circle cx="${cx - r * 0.32}" cy="${cy - r * 0.34}" r="${r * 0.5}" fill="#FFFFFF" opacity="0.14"/>
  ${pennyFace(cx, cy, r * 1.18)}`;
}

const defs = `
  <defs>
    <linearGradient id="coral" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#E0854F"/>
      <stop offset="0.6" stop-color="#D96845"/>
      <stop offset="1" stop-color="#C2532F"/>
    </linearGradient>
    <radialGradient id="coralShade" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#7A280F" stop-opacity="0.55"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#F0CE7E"/>
      <stop offset="0.5" stop-color="#D9A33F"/>
      <stop offset="1" stop-color="#B9821F"/>
    </linearGradient>
    <linearGradient id="cream" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F6F1E6"/>
      <stop offset="1" stop-color="#EBE2CE"/>
    </linearGradient>
  </defs>`;

// Foreground: coin within the adaptive safe zone (~62% of canvas).
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  ${defs}
  ${coin(S / 2, S / 2, 300)}
</svg>`;

// Background: warm cream gradient (adaptive bg layer).
const background = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  ${defs}
  <rect width="${S}" height="${S}" fill="url(#cream)"/>
</svg>`;

// icon-only (iOS / legacy / PWA): cream field + larger coin.
const iconOnly = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  ${defs}
  <rect width="${S}" height="${S}" fill="url(#cream)"/>
  ${coin(S / 2, S / 2, 360)}
</svg>`;

// Splash: cream field + centred coin (smaller).
function splash(bg) {
  const W = 2732;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">
  ${defs}
  <rect width="${W}" height="${W}" fill="${bg}"/>
  ${coin(W / 2, W / 2, 300)}
</svg>`;
}

async function render(svg, out, size = S) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`assets/${out}`);
  console.log('wrote assets/' + out);
}

await render(foreground, 'icon-foreground.png');
await render(background, 'icon-background.png');
await render(iconOnly, 'icon-only.png');
await render(splash('#F6F1E6'), 'splash.png', 2732);
await render(splash('#EBE2CE'), 'splash-dark.png', 2732);
console.log('done');
