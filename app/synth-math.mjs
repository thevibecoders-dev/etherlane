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
    description: "Four-on-the-floor lift with data-driven builds",
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
 * Deterministic 32-step rhythm cell. Signal-derived seed and energy change the
 * optional notes, while each mode keeps its own recognisable rhythmic spine.
 */
export function rhythmStepFor(mode, step, seed = 0, energy = 0.5) {
  const index = ((Math.round(step) % 32) + 32) % 32;
  const safeEnergy = clamp(Number(energy), 0, 1);
  const variation = hashText(`${mode}:${seed}:${index}`);
  const chance = (variation % 1000) / 1000;
  const cell = {
    kick: false,
    snare: false,
    closedHat: false,
    openHat: false,
    percussion: false,
    bass: false,
    accent: 0.72,
    microShift: 0,
  };

  if (mode === "ambient") return cell;

  if (mode === "edm") {
    cell.kick = index % 4 === 0;
    cell.snare = index % 8 === 4;
    cell.closedHat = index % 2 === 0 && index % 4 !== 0;
    cell.openHat = index % 8 === 2;
    cell.bass = index % 4 === 2;
    cell.percussion = index >= 28 && chance < 0.25 + safeEnergy * 0.55;
    cell.accent = index % 16 === 0 ? 1 : 0.76 + safeEnergy * 0.16;
    return cell;
  }

  if (mode === "techno") {
    cell.kick = index % 4 === 0;
    cell.snare = index % 16 === 12;
    cell.closedHat = index % 2 === 0 && index % 4 !== 0;
    cell.openHat = index % 4 === 2;
    cell.percussion = (index + seed) % 7 === 0 || chance < 0.08 + safeEnergy * 0.16;
    cell.bass = index % 8 === 6;
    cell.accent = index % 16 === 0 ? 1 : 0.82;
    return cell;
  }

  // IDM keeps the downbeat intelligible, then lets the live data bend the
  // remaining grid into broken, microtimed clusters.
  cell.kick =
    index === 0 ||
    index === 16 ||
    ([5, 7, 11, 19, 22, 27, 30].includes(index) && chance < 0.34 + safeEnergy * 0.45);
  cell.snare = index === 8 || index === 24 || (index % 8 === 6 && chance < safeEnergy * 0.34);
  cell.closedHat = index % 2 === 1 ? chance < 0.58 + safeEnergy * 0.3 : chance < 0.18;
  cell.openHat = [3, 13, 21, 29].includes(index) && chance < 0.45 + safeEnergy * 0.4;
  cell.percussion = chance < 0.22 + safeEnergy * 0.36;
  cell.bass = [2, 10, 17, 26].includes(index) || (index % 8 === 7 && chance < 0.35);
  cell.accent = 0.58 + ((variation >>> 8) % 43) / 100;
  cell.microShift = (((variation >>> 16) % 13) - 6) * 0.0018;
  return cell;
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
 * Sustained pad chord (MIDI notes) for a given number of live feeds.
 * The evolution step moves through a slow modal progression while keeping
 * every note inside the selected scale.
 */
export function padChordForHealth(liveCount, scale, key, evolutionStep = 0) {
  const progression = [0, 3, 5, 1, 4, 2];
  const rootDegree = progression[((evolutionStep % progression.length) + progression.length) % progression.length];
  const note = (degree) => quantizeToScale(rootDegree + degree, scale, key, 5);
  if (liveCount >= 4) return [note(0), note(4), note(7), note(9), note(15), note(18)];
  if (liveCount >= 3) return [note(0), note(4), note(7), note(9), note(15)];
  if (liveCount === 2) return [note(0), note(4), note(7)];
  return [note(0), note(7)];
}

/** Translate a signal into the musical parameters of one accent voice. */
export function accentForSignal(signal, scale, key) {
  const seed = hashText(`${signal.source}:${signal.kind}:${Math.round(signal.magnitude)}`);
  const sourceRegister = {
    RIS: -7, // low, structural
    WIKIMEDIA: 0,
    ATLAS: 7, // high, bell-like pings
    GITHUB: 4,
    HACKERNEWS: 2,
    BLOCKCHAIN: -4,
    INFRASTRUCTURE: -9,
    SYNTHETIC: -2,
  };
  // ATLAS: fast return (low magnitude) => bright/high; high latency => low/dark.
  const latencyDegree = signal.source === "ATLAS" ? Math.round((100 - signal.magnitude) / 12) : 0;
  const baseDegree = sourceRegister[signal.source] + latencyDegree + (seed % 5);
  const descending = /WITHDRAWN|NOTIFICATION|REMOVED|HIGH LATENCY|OUTAGE|DEGRADED|ROOT CONSENSUS/.test(signal.kind);
  // +7 keeps accents above the pad root; withdrawals/notifications drop a full
  // octave so they always read as "something left" regardless of hash jitter.
  const midi = quantizeToScale(baseDegree + 7, scale, key) - (descending ? 12 : 0);
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
