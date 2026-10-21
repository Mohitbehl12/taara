// Speech in/out via Sarvam AI (Indian-language STT and TTS). Swap this file to use another provider.
// STT (Saaras) covers all 22 scheduled languages; TTS (Bulbul) covers the languages marked `tts: true` in config/languages.ts.
import { env } from '../config/env.js';
import { langInfo } from '../config/languages.js';
import { HttpError } from '../lib/http.js';

const BASE = 'https://api.sarvam.ai';
export const voiceEnabled = () => Boolean(env.sarvamApiKey);

export async function speechToText(audio: Buffer, mime: string, lang: string): Promise<{ transcript: string }> {
  if (!voiceEnabled()) throw new HttpError(503, 'voice_not_configured');
  const form = new FormData();
  // m4a recordings from phones are MP4 audio, which Saaras accepts; max 30 s per request.
  form.append('file', new Blob([new Uint8Array(audio)], { type: mime.includes('wav') ? 'audio/wav' : 'audio/mp4' }), `speech.${mime.includes('wav') ? 'wav' : 'mp4'}`);
  form.append('model', 'saaras:v4');
  form.append('mode', 'transcribe');
  form.append('language_code', langInfo(lang).sarvam);
  const r = await fetch(`${BASE}/speech-to-text`, { method: 'POST', headers: { 'api-subscription-key': env.sarvamApiKey }, body: form });
  if (!r.ok) throw new HttpError(502, 'stt_failed', await r.text());
  const j = await r.json() as { transcript?: string };
  return { transcript: (j.transcript ?? '').trim() };
}

/** Returns base64 WAV audio, or null when the language has no voice (the app then shows text only). */
export async function textToSpeech(text: string, lang: string): Promise<string | null> {
  const L = langInfo(lang);
  if (!voiceEnabled() || !L.tts) return null;
  const chunks = splitForTts(text, 450);
  const parts: string[] = [];
  for (const chunk of chunks) {
    const r = await fetch(`${BASE}/text-to-speech`, {
      method: 'POST',
      headers: { 'api-subscription-key': env.sarvamApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: chunk, language_code: L.sarvam, model: 'bulbul:v3' }),
    });
    if (!r.ok) throw new HttpError(502, 'tts_failed', await r.text());
    const j = await r.json() as { audios: string[] };
    parts.push(j.audios.join(''));
  }
  return parts.length === 1 ? parts[0] : concatWavBase64(parts);
}

function splitForTts(text: string, max: number) {
  const sentences = text.replace(/[*#_`>]/g, '').split(/(?<=[.!?।॥\n])\s+/);
  const out: string[] = []; let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).length > max && cur) { out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

/** Joins PCM WAV files that share a format by concatenating their data chunks. */
function concatWavBase64(parts: string[]) {
  const bufs = parts.map((p) => Buffer.from(p, 'base64'));
  const dataOf = (b: Buffer) => { const i = b.indexOf('data'); return b.subarray(i + 8, i + 8 + b.readUInt32LE(i + 4)); };
  const header = Buffer.from(bufs[0].subarray(0, bufs[0].indexOf('data') + 8));
  const data = Buffer.concat(bufs.map(dataOf));
  header.writeUInt32LE(data.length, header.length - 4);
  header.writeUInt32LE(header.length - 8 + data.length, 4);
  return Buffer.concat([header, data]).toString('base64');
}
