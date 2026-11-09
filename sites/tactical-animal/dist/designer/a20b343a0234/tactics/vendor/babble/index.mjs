// babble-lab: text in, video-game voice out.
//
//   import { render, encodeWav } from 'babble-lab';
//   const { samples, sampleRate, plan } = render('Welcome, stranger!', 'gruff');
//
// `samples` is a Float32Array you can hand to WebAudio or encodeWav().
// `plan` is the timed score: plan.units carry character spans, so a typewriter
// can reveal the line in step with the sound (revealAt / revealSchedule).
// Everything is a pure function of (text, voice, opts): same in, same out.

import { makePlan, revealAt, revealSchedule, weightsMap } from './prosody.mjs';
import { renderPlan, finish, checkRate } from './synth.mjs';
import { synthesizeFromBank } from './sampler.mjs';
import { resolveVoice } from './voices.mjs';

export function plan(text, voice, opts) {
  return makePlan(text, voice, opts);
}

// opts: { sampleRate = 44100, seed = 0 (another take of the same line), gain = 1,
//         weights (a tts-weights table), fx = true,
//         timing: { duration (score seconds), cues ([[start, end], ...] per sounding unit) },
//         bank (a decoded voice bank: speak with slices of a recording instead of the synth) }
export function render(text, voice, opts = {}) {
  const p = makePlan(text, voice, opts);
  const sampleRate = checkRate(opts.sampleRate ?? 44100);
  const bank = opts.bank ?? (p.voice.bank ? opts.banks?.[p.voice.bank] : null);
  // a voice that names a bank must get it: falling back to the synth would be a
  // different character speaking, silently
  if (p.voice.bank && !bank) throw new Error(`babble: voice "${p.voice.name}" speaks with the bank "${p.voice.bank}", which was not supplied (opts.bank, or opts.banks["${p.voice.bank}"])`);
  if (!bank) return { samples: renderPlan(p, { ...opts, sampleRate }), sampleRate, plan: p };
  const { samples, used } = synthesizeFromBank(p, bank, sampleRate);
  return { samples: finish(samples, p.voice, sampleRate, opts), sampleRate, plan: p, used };
}

// A whole script with a cast: [{ who, text }] + { who: voice } -> rendered lines.
export function renderScript(lines, cast, opts = {}) {
  const voices = new Map();
  return lines.map((line, index) => {
    if (!Object.hasOwn(cast, line.who)) throw new Error(`babble: line ${index + 1} is spoken by "${line.who}", who is not in the cast (${Object.keys(cast).join(', ')})`);
    if (!voices.has(line.who)) voices.set(line.who, resolveVoice(cast[line.who]));
    return { index, who: line.who, text: line.text, ...render(line.text, voices.get(line.who), opts) };
  });
}

// "name: what they say" per line; blank lines and # comments are skipped.
export function parseScript(source) {
  const out = [];
  source.split(/\r?\n/).forEach((raw, k) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const m = line.match(/^([^:]{1,40}):\s*(.+)$/);
    if (!m) throw new Error(`babble: script line ${k + 1} is not "name: text" — ${JSON.stringify(line.slice(0, 60))}`);
    out.push({ who: m[1].trim(), text: m[2] });
  });
  return out;
}

export { makePlan, renderPlan, revealAt, revealSchedule, weightsMap };
export { resolveVoice, randomVoice, compactVoice, PRESETS, PARAMS, FX_PARAMS, MODES, WAVES, DEFAULT_VOICE } from './voices.mjs';
export { encodeWav, decodeWav } from './wav.mjs';
export { makeBank, encodeBank, decodeBank, unarrange, recut, DEFAULT_PIECE } from './bank.mjs';
export { makeTongue, applyTongue, MANNER_CLASSES } from './tongue.mjs';
export { analyze, tokenize, countSyllables, wordToSyllables } from './text.mjs';
export { g2p } from './g2p.mjs';
export { retimePlan, mouthCues, mouthAt } from './timing.mjs';
export { PHONEMES, respell } from './phonemes.mjs';
