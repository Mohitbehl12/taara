// Fills missing UI strings in every locale from en.json using Claude, keeping {{placeholders}} intact.
// Usage:  ANTHROPIC_API_KEY=... node scripts/translate-locales.mjs [codes...]   (default: all 21 non-English/Hindi locales)
// Existing translations are never overwritten — only missing keys are added. Review output with a native speaker.
import fs from 'node:fs';
import path from 'node:path';

const LANGS = {
  bn: 'Bengali (বাংলা)', mr: 'Marathi (मराठी)', te: 'Telugu (తెలుగు)', ta: 'Tamil (தமிழ்)', gu: 'Gujarati (ગુજરાતી)',
  ur: 'Urdu (اردو)', kn: 'Kannada (ಕನ್ನಡ)', or: 'Odia (ଓଡ଼ିଆ)', ml: 'Malayalam (മലയാളം)', pa: 'Punjabi in Gurmukhi (ਪੰਜਾਬੀ)',
  as: 'Assamese (অসমীয়া)', mai: 'Maithili in Devanagari (मैथिली)', sat: 'Santali in Ol Chiki script (ᱥᱟᱱᱛᱟᱲᱤ)',
  ks: 'Kashmiri in Perso-Arabic script (کٲشُر)', ne: 'Nepali (नेपाली)', kok: 'Konkani in Devanagari (कोंकणी)',
  sd: 'Sindhi in Perso-Arabic script (سنڌي)', doi: 'Dogri in Devanagari (डोगरी)', mni: 'Manipuri (Meitei) in Bengali script (মণিপুরী)',
  brx: 'Bodo in Devanagari (बड़ो)', sa: 'Sanskrit in Devanagari (संस्कृतम्)',
};
const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }
const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/i18n/locales');
const en = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));
const hi = JSON.parse(fs.readFileSync(path.join(dir, 'hi.json'), 'utf8'));
const flat = (o, p = '') => Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? Object.entries(flat(v, `${p}${k}.`)) : [[`${p}${k}`, v]])));
const unflat = (f) => { const o = {}; for (const [k, v] of Object.entries(f)) { const ps = k.split('.'); let c = o; ps.slice(0, -1).forEach((p) => (c = c[p] ??= {})); c[ps.at(-1)] = v; } return o; };
const vars = (s) => [...String(s).matchAll(/\{\{\w+\}\}/g)].map((m) => m[0]).sort().join();

async function translateChunk(code, entries) {
  const prompt = `Translate these UI strings for an Indian astrology app into ${LANGS[code]}.
Rules: natural, simple, warm everyday language a non-technical user understands; keep every {{placeholder}} exactly; keep emoji, ₹, numbers, "AI" and the brand "Taara"/"तारा" as is; astrology terms use the common native word (Kundli, Rashi, Nakshatra, Dasha, Pandit Ji).
The Hindi version is given as a reference for tone. Return ONLY a JSON object mapping each key to its translation.

${JSON.stringify(Object.fromEntries(entries.map(([k, v]) => [k, { en: v, hi: hiFlat[k] }])), null, 1)}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.AI_MODEL ?? 'claude-sonnet-5-5', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const j = await r.json();
  const text = j.content.map((b) => b.text ?? '').join('');
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

const enFlat = flat(en);
const hiFlat = flat(hi);
const codes = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LANGS);
for (const code of codes) {
  const file = path.join(dir, `${code}.json`);
  const cur = fs.existsSync(file) ? flat(JSON.parse(fs.readFileSync(file, 'utf8'))) : {};
  const missing = Object.entries(enFlat).filter(([k]) => !(k in cur));
  if (!missing.length) { console.log(`${code}: complete`); continue; }
  for (let i = 0; i < missing.length; i += 120) {
    const out = await translateChunk(code, missing.slice(i, i + 120));
    for (const [k, v] of Object.entries(out)) if (k in enFlat && vars(v) === vars(enFlat[k])) cur[k] = v;
  }
  fs.writeFileSync(file, JSON.stringify(unflat(cur), null, 2) + '\n');
  console.log(`${code}: +${missing.length} keys`);
}
console.log('Now run: node scripts/check-i18n.mjs');
