// Pure, deterministic mapping helpers for the ambient synth engine.
//
// Kept as plain JavaScript (no types to strip) so Node's test runner can import
// them directly with zero build step — see tests/synth-mapping.test.mjs. The
// TypeScript engine consumes them through the matching synth-math.d.mts types.

export const scaleIntervals = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  "minor-pentatonic": [0, 3, 5, 7, 10],
  "major-pentatonic": [0, 2, 4, 7, 9],
};

export const keyRootMidi = {
  C: 48,
  D: 50,
  E: 52,
  F: 53,
  G: 43,
  A: 45,
};

const noteNames = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Equal-offset stereo carrier pair whose frequency difference is the binaural beat. */
export function binauralPair(carrierHz, beatHz) {
  const safeCarrier = clamp(Number(carrierHz), 80, 1000);
  const safeBeat = clamp(Number(beatHz), 0.5, 40);
  return {
    leftHz: safeCarrier - safeBeat / 2,
    rightHz: safeCarrier + safeBeat / 2,
    beatHz: safeBeat,
  };
}

export const rhythmProfiles = {
  ambient: {
    label: "AMBIENT",
    bpm: 0,
    description: "Free-flowing pads without a beat",
  },
  edm: {
    label: "EDM",
    bpm: 126,
    description: "Elastic club energy with breaks, lifts and syncopated returns",
  },
  techno: {
    label: "TECHNO",
    bpm: 132,
    description: "Hypnotic drive, rumble and shifting percussion",
  },
  idm: {
    label: "IDM",
    bpm: 112,
    description: "Broken geometry, microtiming and signal mutations",
  },
};

/**
 * A deterministic point on an effectively unbounded generative timeline.
 * `step` never resets in the audio engine: every 32-step phrase receives a new
 * data-derived identity, while each style retains a recognisable musical spine.
 */
export function rhythmStepFor(mode, step, seed = 0, energy = 0.5) {
  const absoluteStep = Math.max(0, Math.round(step));
  const index = absoluteStep % 32;
  const phrase = Math.floor(absoluteStep / 32);
  const safeEnergy = clamp(Number(energy), 0, 1);
  const phraseSeed = hashText(`${mode}:${seed}:phrase:${phrase}`);
  const variation = hashText(`${mode}:${seed}:${phrase}:${index}`);
  const chance = (variation % 1000) / 1000;
  const section = phraseSeed % 9;
  const density = clamp(0.3 + safeEnergy * 0.58 + ((phraseSeed >>> 8) % 17) / 100, 0.25, 1);
  const cell = {
    kick: false,
    snare: false,
    closedHat: false,
    openHat: false,
    percussion: false,
    bass: false,
    synth: false,
    accent: 0.72,
    microShift: 0,
    gate: 0.5,
  };

  if (mode === "ambient") return cell;

  if (mode === "edm") {
    const breakSection = section === 0 || section === 7;
    const omittedBeat = 4 * (1 + (phraseSeed % 3));
    const syncopatedKick = [3, 7, 14, 19, 27, 30].includes(index);
    cell.kick =
      (!breakSection && index % 4 === 0 && index !== omittedBeat) ||
      (breakSection && [0, 10, 18, 27].includes(index)) ||
      (syncopatedKick && chance < 0.13 + safeEnergy * 0.28);
    cell.snare =
      (!breakSection && index % 8 === 4) ||
      (breakSection && [6, 12, 23, 29].includes(index) && chance < 0.78);
    cell.closedHat =
      section % 3 === 0
        ? index % 2 === 1 && chance < density
        : index % 4 === 2 && chance < 0.72 + density * 0.24;
    cell.openHat =
      !breakSection && [2, 10, 18, 26].includes(index) && chance < 0.56 + density * 0.36;
    cell.bass =
      (section % 2 === 0 ? index % 4 === 2 : [2, 7, 14, 19, 26, 30].includes(index)) &&
      chance < 0.66 + density * 0.28;
    cell.percussion =
      (index >= 24 || breakSection) && chance < 0.12 + safeEnergy * 0.44;
    // A quiet phrase may lose kicks, never its time reference.
    if (index % 4 === 2) cell.closedHat = true;
    if (index % 8 === 7) cell.percussion = true;
    cell.synth = [1, 9, 17, 25].includes(index) || (breakSection && index % 6 === 3);
    cell.accent = index === 0 ? 1 : 0.68 + safeEnergy * 0.24;
    cell.gate = 0.24 + ((variation >>> 10) % 58) / 100;
    return cell;
  }

  if (mode === "techno") {
    const airBreak = section === 2 && index >= 20;
    const rolling = section === 5 || section === 8;
    cell.kick =
      (!airBreak && index % 4 === 0 && !(section === 4 && index === 20)) ||
      (rolling && [11, 15, 27, 31].includes(index) && chance < 0.48 + safeEnergy * 0.35);
    cell.snare =
      [12, 28].includes(index) && (section % 3 !== 1 || chance < 0.54);
    cell.closedHat =
      (section % 2 === 0 ? index % 2 === 1 : index % 4 === 2) &&
      chance < 0.46 + density * 0.48;
    cell.openHat =
      !airBreak && [2, 10, 18, 26].includes(index) && chance < 0.38 + density * 0.4;
    cell.percussion =
      (index + phraseSeed) % (section % 2 ? 5 : 7) === 0 ||
      chance < 0.06 + safeEnergy * 0.21;
    if (index % 4 === 2) cell.closedHat = true;
    cell.bass =
      (rolling ? [3, 6, 11, 14, 22, 27, 30].includes(index) : index % 8 === 6) &&
      chance < 0.82;
    cell.synth = [5, 13, 21, 29].includes(index) && chance < 0.5 + density * 0.36;
    cell.accent = index % 16 === 0 ? 1 : 0.82;
    cell.gate = 0.16 + ((variation >>> 12) % 47) / 100;
    return cell;
  }

  // IDM keeps the downbeat intelligible, then lets the live data bend the
  // remaining grid into broken, microtimed clusters.
  const anchorA = phraseSeed % 8;
  const anchorB = 16 + ((phraseSeed >>> 5) % 8);
  cell.kick =
    index === anchorA ||
    index === anchorB ||
    ([3, 5, 7, 11, 14, 19, 22, 27, 30].includes(index) &&
      chance < 0.22 + safeEnergy * 0.48);
  cell.snare =
    index === (8 + (phraseSeed % 5)) ||
    index === (24 + ((phraseSeed >>> 4) % 5)) ||
    (index % 8 === 6 && chance < safeEnergy * 0.32);
  cell.closedHat =
    index % (section % 2 ? 3 : 2) === 1
      ? chance < 0.42 + safeEnergy * 0.42
      : chance < 0.11 + density * 0.1;
  cell.openHat =
    [3, 13, 21, 29].includes((index + section) % 32) &&
    chance < 0.28 + safeEnergy * 0.5;
  cell.percussion =
    chance < 0.16 + safeEnergy * 0.42 ||
    index % 8 === ((phraseSeed >>> 9) % 8);
  if (index % 4 === phraseSeed % 4) cell.closedHat = true;
  cell.bass =
    [2, 10, 17, 26].includes((index + section) % 32) ||
    (index % 8 === 7 && chance < 0.28 + density * 0.22);
  cell.synth = chance < 0.12 + density * 0.27 && index % 2 === section % 2;
  cell.accent = 0.58 + ((variation >>> 8) % 43) / 100;
  cell.microShift = (((variation >>> 16) % 13) - 6) * 0.0018;
  cell.gate = 0.08 + ((variation >>> 11) % 82) / 100;
  return cell;
}

/**
 * Maps each normalized public event onto bounded modular-synthesis targets.
 * Source decides the role; magnitude and event identity decide the exact value.
 */
export function modulationForSignal(signal, sequence = 0) {
  const seed = hashText(
    `${signal.source}:${signal.kind}:${Math.round(signal.magnitude)}:${sequence}`,
  );
  const magnitude = clamp(Number(signal.magnitude) / 100, 0, 1);
  const sourceBias = {
    RIS: { cutoff: -520, delay: 0.08, reverb: 0.04, density: 0.06 },
    ATLAS: { cutoff: 1350, delay: 0.2, reverb: 0.02, density: 0.03 },
    WIKIMEDIA: { cutoff: 420, delay: 0.1, reverb: 0.22, density: -0.02 },
    GITHUB: { cutoff: 920, delay: 0.16, reverb: 0.08, density: 0.08 },
    HACKERNEWS: { cutoff: 180, delay: 0.24, reverb: 0.12, density: 0.11 },
    BLOCKCHAIN: { cutoff: -260, delay: 0.12, reverb: 0.16, density: 0.05 },
    INFRASTRUCTURE: { cutoff: -780, delay: 0.18, reverb: 0.28, density: 0.16 },
    SYNTHETIC: { cutoff: 0, delay: 0.12, reverb: 0.16, density: 0 },
  }[signal.source];
  const voices = ["SUB", "FOLD", "FM", "GLASS", "AIR", "PULSE"];
  const distress = /OUTAGE|NOTIFICATION|WITHDRAWN|DEGRADED|HIGH LATENCY/.test(signal.kind);
  return {
    seed,
    octave: 0,
    pitchCents: 0,
    voice: voices[(seed >>> 11) % voices.length],
    cutoff: clamp(680 + magnitude * 4200 + sourceBias.cutoff, 240, 6400),
    delay: clamp(0.08 + magnitude * 0.28 + sourceBias.delay, 0.06, 0.46),
    reverb: clamp(0.18 + magnitude * 0.48 + sourceBias.reverb, 0.16, 0.92),
    feedback: clamp(0.13 + magnitude * 0.2 + (seed % 9) / 100, 0.12, 0.42),
    density: clamp(0.28 + magnitude * 0.52 + sourceBias.density, 0.18, 0.98),
    chordAdvance: 1 + ((seed >>> 15) % (distress ? 3 : 2)),
    driftRate: clamp(0.025 + ((seed >>> 18) % 70) / 1000, 0.025, 0.095),
  };
}

export function midiToFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

export function midiToName(note) {
  const rounded = Math.round(note);
  return `${noteNames[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}

export function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/**
 * Snap an arbitrary scale-degree index to an absolute MIDI note within `key`
 * and `scale`, wrapping across octaves.
 */
export function quantizeToScale(degreeIndex, scale, key, octaveSpan = 3) {
  const intervals = scaleIntervals[scale];
  const span = intervals.length * octaveSpan;
  const wrapped = ((degreeIndex % span) + span) % span;
  const octave = Math.floor(wrapped / intervals.length);
  const interval = intervals[wrapped % intervals.length];
  return keyRootMidi[key] + octave * 12 + interval;
}

/**
 * Stable deep drone whose fixed harmonic layers open as more feeds come live.
 * Data changes texture and space around this floor, never its pitch.
 */
export function padChordForHealth(liveCount, _scale, key) {
  const root = keyRootMidi[key] - 12;
  const harmonics = [root, root + 12, root + 19, root + 24, root + 31, root + 36];
  const available = liveCount >= 4 ? 6 : liveCount >= 3 ? 5 : liveCount === 2 ? 3 : 2;
  return harmonics.slice(0, available);
}

/** Translate a signal into the musical parameters of one accent voice. */
export function accentForSignal(signal, _scale, key) {
  const descending = /WITHDRAWN|NOTIFICATION|REMOVED|HIGH LATENCY|OUTAGE|DEGRADED|ROOT CONSENSUS/.test(signal.kind);
  // Every packet floats on the same open fifth above the deep root. Meaning is
  // carried by envelope, stereo position, timbre and space instead of pitch.
  const midi = keyRootMidi[key] + 7;
  const velocity = clamp(0.16 + signal.magnitude / 190, 0.16, 0.7);
  const attack =
    signal.source === "ATLAS"
      ? 0.05
      : signal.source === "WIKIMEDIA" || signal.source === "GITHUB"
        ? 0.14
        : 0.22;
  const release = descending ? 3.4 : 2.2 + (signal.magnitude / 100) * 1.8;
  const pan = {
    RIS: -0.4,
    ATLAS: 0.38,
    WIKIMEDIA: 0.12,
    GITHUB: 0.56,
    HACKERNEWS: -0.18,
    BLOCKCHAIN: -0.58,
    INFRASTRUCTURE: 0,
    SYNTHETIC: -0.1,
  }[signal.source];
  const bright =
    signal.tone === "cyan" ? 1 : signal.tone === "amber" ? 0.7 : signal.tone === "coral" ? 0.45 : 0.85;
  return { midi, velocity, attack, release, pan, bright };
}

/** Detune spread (in cents) per oscillator for an n-voice ensemble. */
export function ensembleDetune(count, widthCents) {
  if (count <= 1) return [0];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push((i / (count - 1) - 0.5) * 2 * widthCents);
  }
  return out;
}
