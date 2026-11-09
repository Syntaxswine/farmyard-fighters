// Retiming happens before synthesis: change the performance's clock, never the
// playback speed (which would also change the character's pitch and formants).
const positive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const fail = (message) => { throw new Error(`babble: timing ${message}`); };

export function retimePlan(plan, timing) {
  if (timing == null) return plan;
  if (typeof timing !== 'object' || Array.isArray(timing)) fail('must be { duration } or { cues: [[start, end], ...] }');
  const { duration, cues } = timing;
  if (duration !== undefined && (!positive(duration) || duration > 600)) fail('duration must be between 0 and 600 seconds');
  if (cues === undefined) {
    if (duration === undefined) return plan;
    const scale = duration / plan.duration;
    return {
      ...plan, duration,
      units: plan.units.map((u) => ({ ...u, t0: u.t0 * scale, t1: u.t1 * scale })),
      words: plan.words.map((w) => ({ ...w, t0: w.t0 * scale, t1: w.t1 * scale })),
      pitch: plan.pitch.map((p) => ({ ...p, t: p.t * scale })),
      segs: plan.segs.map((s) => scaleSegment(s, s.t0 * scale, scale)),
    };
  }

  const voiced = plan.units.map((u, index) => ({ ...u, index })).filter((u) => u.kind !== 'rest');
  if (!Array.isArray(cues) || cues.length !== voiced.length || !cues.length) fail(`needs exactly ${voiced.length} syllable/letter cues`);
  let end = 0;
  cues.forEach((cue, i) => {
    if (!Array.isArray(cue) || cue.length !== 2 || !cue.every(Number.isFinite) || cue[0] < end || cue[1] - cue[0] < 0.02 || cue[1] > 600) {
      fail(`cue ${i + 1} must be [start, end] in seconds, ordered, non-overlapping, and at least 0.02 s long (maximum end 600 s)`);
    }
    end = cue[1];
  });
  const tail = plan.duration - voiced.at(-1).t1;
  const total = duration ?? end + tail;
  if (total < end) fail('duration ends before the last cue');
  const units = plan.units.map((u) => ({ ...u }));
  const segs = [], pitch = [];
  const rest = (t0, t1, template) => {
    if (t1 > t0) segs.push({ t0, dur: t1 - t0, F: [...template.F], av: 0, ah: 0, af: 0, tr: 0.004, atr: 0.004, rest: true, raw: template.raw, nasal: 0, unit: -1 });
  };
  let clock = 0, priorIndex = -1;
  voiced.forEach((u, i) => {
    const [t0, t1] = cues[i], scale = (t1 - t0) / (u.t1 - u.t0);
    const parts = plan.segs.filter((s) => s.unit === u.index);
    const map = (t) => t0 + (t - u.t0) * scale;
    rest(clock, t0, parts[0]);
    for (let k = priorIndex + 1; k < u.index; k++) Object.assign(units[k], { t0: clock, t1: t0 });
    Object.assign(units[u.index], { t0, t1 });
    for (const s of parts) segs.push(scaleSegment(s, map(s.t0), scale));
    for (const p of plan.pitch) if (p.t >= u.t0 && p.t < u.t1) pitch.push({ ...p, t: map(p.t) });
    clock = t1;
    priorIndex = u.index;
  });
  for (let k = priorIndex + 1; k < units.length; k++) Object.assign(units[k], { t0: end, t1: end });
  rest(end, total, segs.at(-1));
  const words = plan.words.map((w) => {
    const said = units.filter((u) => u.kind !== 'rest' && u.word === w.index);
    return { ...w, t0: said[0].t0, t1: said.at(-1).t1 };
  });
  return { ...plan, duration: total, units, words, segs, pitch };
}

function scaleSegment(s, t0, scale) {
  return { ...s, t0, dur: s.dur * scale, tr: s.tr * scale, atr: s.atr * scale,
    ...(s.decay === undefined ? {} : { decay: s.decay * scale }) };
}

// Small, renderer-independent animation track. One opening per spoken unit;
// rests and skipped blips close the mouth. Times are relative to the clip.
export function mouthCues(plan) {
  return plan.units.filter((u) => u.kind !== 'rest' && !u.silent).map((u) => ({
    t0: u.t0, t1: u.t1, c0: u.c0, c1: u.c1, label: u.label,
    open: u.stress && !u.reduced ? 1 : 0.6,
  }));
}

export function mouthAt(plan, time) {
  const u = plan.units.find((u) => u.kind !== 'rest' && !u.silent && time > u.t0 && time < u.t1);
  return u ? (u.stress && !u.reduced ? 1 : 0.6) * Math.pow(Math.sin(Math.PI * (time - u.t0) / (u.t1 - u.t0)), 0.8) : 0;
}
