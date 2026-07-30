// Etherlane immersive generative engine.
//
// Three layers shaped by the live signal flow:
//   1. A sustained supersaw STRING PAD whose chord follows how many public
//      feeds are live (1 = root drone, 2 = root+fifth, 3 = full add9 shimmer).
//   2. Soft, bowed ACCENT voices triggered by real signals, pitch quantised to
//      a musical scale, spaced by >=70 ms (precedence effect) so dense traffic
//      stays legible instead of turning to mud.
//   3. Optional procedural EDM, techno and IDM drums scheduled on the exact
//      AudioContext clock. Signal energy and identity mutate the pattern.
//
// Everything runs through a lush convolution reverb + ensemble chorus + stereo
// delay + a soft master limiter, so the whole thing reads as one warm space.
// Pure, side-effect-free helpers live at the top so they can be unit-tested in
// Node without a Web Audio context (see tests/synth-mapping.test.mjs).

import {
  accentForSignal,
  binauralPair,
  clamp,
  ensembleDetune,
  hashText,
  midiToFrequency,
  midiToName,
  modulationForSignal,
  padChordForHealth,
  quantizeToScale,
  rhythmProfiles,
  rhythmStepFor,
} from "./synth-math.mjs";

export type SynthSource =
  | "RIS"
  | "ATLAS"
  | "WIKIMEDIA"
  | "GITHUB"
  | "HACKERNEWS"
  | "BLOCKCHAIN"
  | "INFRASTRUCTURE"
  | "SYNTHETIC";
export type SynthTone = "violet" | "cyan" | "amber" | "coral";
export type ScaleName =
  | "aeolian"
  | "dorian"
  | "lydian"
  | "minor-pentatonic"
  | "major-pentatonic";
export type KeyName = "C" | "D" | "E" | "F" | "G" | "A";
export type Palette = "strings" | "glass" | "choir";
export type BinauralMode = "delta" | "theta" | "alpha" | "focus";
export type RhythmMode = "ambient" | "edm" | "techno" | "idm";
export type KickPulse = {
  mode: Exclude<RhythmMode, "ambient">;
  energy: number;
  tone: SynthTone;
};

export type DataModulation = {
  seed: number;
  octave: number;
  pitchCents: number;
  voice: string;
  cutoff: number;
  delay: number;
  reverb: number;
  feedback: number;
  density: number;
  chordAdvance: number;
  driftRate: number;
};

export const rhythmPresets = rhythmProfiles as Record<
  RhythmMode,
  { label: string; bpm: number; description: string }
>;

export const binauralPresets: Record<
  BinauralMode,
  { label: string; beatHz: number; carrierHz: number; description: string }
> = {
  delta: {
    label: "DELTA REST",
    beatHz: 2.5,
    carrierHz: 174,
    description: "Very slow pulse for settling and stillness",
  },
  theta: {
    label: "THETA DRIFT",
    beatHz: 6,
    carrierHz: 192,
    description: "Slow pulse for an open meditation atmosphere",
  },
  alpha: {
    label: "ALPHA CALM",
    beatHz: 10,
    carrierHz: 210,
    description: "Gentle pulse for relaxed wakefulness",
  },
  focus: {
    label: "SOFT FOCUS",
    beatHz: 14,
    carrierHz: 228,
    description: "Quicker pulse for quiet concentration",
  },
};

export type MusicSignal = {
  source: SynthSource;
  kind: string;
  magnitude: number;
  tone: SynthTone;
  timestamp: number;
};

export type SynthSettings = {
  /** Reverb amount (0-100) — size of the room. */
  space: number;
  /** Master low-pass warmth (0-100) — lower = darker/softer. */
  warmth: number;
  /** Ensemble chorus/detune width (0-100). */
  shimmer: number;
  /** Filter/pitch movement depth (0-100). */
  drift: number;
  /** Stereo delay send (0-100). */
  delay: number;
  /** Master output level (0-100). */
  master: number;
  scale: ScaleName;
  key: KeyName;
  palette: Palette;
};

export type SynthFrame = {
  chord: string;
  note: string;
  source: SynthSource;
  energy: number;
  voices: number;
  rhythm: RhythmMode;
  bpm: number;
  modulation: DataModulation;
};

export type VoicePlaybackProfile = {
  rate?: number;
  depth?: number;
};

export const defaultSynthSettings: SynthSettings = {
  space: 62,
  warmth: 58,
  shimmer: 48,
  drift: 40,
  delay: 30,
  master: 70,
  scale: "aeolian",
  key: "D",
  palette: "strings",
};

// ---------------------------------------------------------------------------
// Web Audio engine (browser only). Everything below touches AudioContext.
// ---------------------------------------------------------------------------

type PadVoice = {
  sources: AudioScheduledSourceNode[];
  gain: GainNode;
  midi: number;
};

const defaultDataModulation: DataModulation = {
  seed: 911,
  octave: 0,
  pitchCents: 0,
  voice: "AIR",
  cutoff: 2400,
  delay: 0.2,
  reverb: 0.54,
  feedback: 0.22,
  density: 0.5,
  chordAdvance: 1,
  driftRate: 0.06,
};

function makeHallImpulse(context: BaseAudioContext, seconds: number, decay: number) {
  const rate = context.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = context.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    let seed = 22222 + channel * 4099;
    // A few early reflections for a sense of a real room.
    const reflections = [0.011, 0.019, 0.027, 0.041, 0.058];
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 16807) % 2147483647;
      const noise = (seed / 2147483647) * 2 - 1;
      const t = index / length;
      let sample = noise * (1 - t) ** decay;
      const timeSec = index / rate;
      for (const r of reflections) {
        if (Math.abs(timeSec - r) < 1 / rate) sample += (channel ? -1 : 1) * 0.5;
      }
      data[index] = sample;
    }
  }
  return impulse;
}

export class EtherlaneVoiceSpace {
  private context: AudioContext | null = null;
  private input: GainNode | null = null;
  private wet: GainNode | null = null;
  private delaySend: GainNode | null = null;

  async prepare() {
    this.ensureGraph();
    await this.context?.resume();
  }

  async playBlob(
    blob: Blob,
    tone: SynthTone,
    energy: number,
    amount: number,
    profile: VoicePlaybackProfile = {},
  ) {
    this.ensureGraph();
    if (!this.context || !this.input) return;
    await this.context.resume();
    const audio = await this.context.decodeAudioData(await blob.arrayBuffer());
    const source = this.context.createBufferSource();
    const toneFilter = this.context.createBiquadFilter();
    toneFilter.type = "highshelf";
    toneFilter.frequency.value = 4200;
    toneFilter.gain.value =
      (tone === "coral" ? -4 : tone === "cyan" ? 1.2 : -1.2) -
      clamp(profile.depth ?? 0.5, 0, 1) * 2.4;
    source.playbackRate.value = clamp(profile.rate ?? 0.94, 0.78, 1.05);
    source.buffer = audio;
    source.connect(toneFilter).connect(this.input);
    this.setSpace(clamp(amount + (profile.depth ?? 0.5) * 18, 0, 100), energy);
    source.start();
  }

  playTexture(tone: SynthTone, energy: number, amount: number) {
    if (!this.context || !this.input || !this.wet || amount <= 0) return;
    const now = this.context.currentTime;
    const duration = 0.52 + (amount / 100) * 0.9;
    const buffer = this.context.createBuffer(
      1,
      Math.floor(this.context.sampleRate * duration),
      this.context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    let seed = 901 + Math.round(energy) * 17;
    for (let index = 0; index < data.length; index += 1) {
      seed = (seed * 48271) % 2147483647;
      const noise = (seed / 2147483647) * 2 - 1;
      data[index] = noise * (1 - index / data.length) ** 2.4;
    }

    const source = this.context.createBufferSource();
    const formant = this.context.createBiquadFilter();
    const shimmer = this.context.createOscillator();
    const shimmerGain = this.context.createGain();
    const envelope = this.context.createGain();
    const center = { violet: 720, cyan: 1240, amber: 910, coral: 510 }[tone];
    const peak = clamp((amount / 100) * (0.025 + energy / 4600), 0.008, 0.065);

    source.buffer = buffer;
    formant.type = "bandpass";
    formant.frequency.value = center;
    formant.Q.value = 2.4 + amount / 22;
    shimmer.type = "sine";
    shimmer.frequency.value = center * 1.51;
    shimmer.detune.value = tone === "coral" ? -11 : 7;
    shimmerGain.gain.setValueAtTime(peak * 0.16, now);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 1.4);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(peak, now + 0.045);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    this.setSpace(amount, energy);

    source.connect(formant).connect(envelope).connect(this.input);
    shimmer.connect(shimmerGain).connect(this.input);
    source.start(now);
    shimmer.start(now);
    shimmer.stop(now + duration * 1.45);
  }

  dispose() {
    void this.context?.close();
    this.context = null;
  }

  private ensureGraph() {
    if (this.context) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const input = context.createGain();
    const dry = context.createGain();
    const preDelay = context.createDelay(0.4);
    const convolver = context.createConvolver();
    const wet = context.createGain();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const delaySend = context.createGain();
    const delayL = context.createDelay(0.8);
    const delayR = context.createDelay(0.8);
    const feedbackL = context.createGain();
    const feedbackR = context.createGain();
    const panL = context.createStereoPanner();
    const panR = context.createStereoPanner();
    const output = context.createGain();
    const limiter = context.createDynamicsCompressor();

    dry.gain.value = 0.84;
    preDelay.delayTime.value = 0.044;
    convolver.buffer = makeHallImpulse(context, 3.8, 2.45);
    wet.gain.value = 0.5;
    highpass.type = "highpass";
    highpass.frequency.value = 170;
    lowpass.type = "lowpass";
    lowpass.frequency.value = 6200;

    // Different left/right times create a wide, non-metallic voice echo.
    delayL.delayTime.value = 0.31;
    delayR.delayTime.value = 0.47;
    delaySend.gain.value = 0.18;
    feedbackL.gain.value = 0.16;
    feedbackR.gain.value = 0.12;
    panL.pan.value = -0.82;
    panR.pan.value = 0.82;

    limiter.threshold.value = -4;
    limiter.knee.value = 14;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.3;
    output.gain.value = 0.88;

    input.connect(dry).connect(output);
    input
      .connect(preDelay)
      .connect(convolver)
      .connect(highpass)
      .connect(lowpass)
      .connect(wet)
      .connect(output);
    input.connect(delaySend);
    delaySend.connect(delayL);
    delaySend.connect(delayR);
    delayL.connect(panL).connect(output);
    delayR.connect(panR).connect(output);
    delayL.connect(feedbackL).connect(delayR);
    delayR.connect(feedbackR).connect(delayL);
    output.connect(limiter).connect(context.destination);
    this.context = context;
    this.input = input;
    this.wet = wet;
    this.delaySend = delaySend;
  }

  private setSpace(amount: number, energy: number) {
    if (!this.context || !this.wet || !this.delaySend) return;
    const now = this.context.currentTime;
    this.wet.gain.setTargetAtTime(0.18 + (amount / 100) * 0.7, now, 0.05);
    this.delaySend.gain.setTargetAtTime(
      clamp(0.045 + amount / 360 + energy / 1900, 0.045, 0.34),
      now,
      0.05,
    );
  }
}

/**
 * True binaural oscillator pair: one mono carrier is sent only to the left
 * channel and the other only to the right. The perceived beat equals the
 * frequency difference. This graph deliberately bypasses all reverb and delay
 * so channel separation remains intact.
 */
export class EtherlaneBinaural {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private left: OscillatorNode | null = null;
  private right: OscillatorNode | null = null;
  private drift: OscillatorNode | null = null;
  private mode: BinauralMode = "theta";

  async start(mode: BinauralMode) {
    this.mode = mode;
    this.ensureGraph();
    if (!this.context || !this.output) return false;
    await this.context.resume();
    this.applyMode(mode);
    const now = this.context.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(Math.max(this.output.gain.value, 0.0001), now);
    this.output.gain.setTargetAtTime(0.034, now, 1.8);
    return true;
  }

  setMode(mode: BinauralMode) {
    this.mode = mode;
    this.applyMode(mode);
  }

  stop() {
    if (!this.context || !this.output) return;
    const now = this.context.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setTargetAtTime(0.0001, now, 1.2);
  }

  dispose() {
    try {
      this.left?.stop();
      this.right?.stop();
      this.drift?.stop();
    } catch {
      // Nodes may already be stopped by the browser.
    }
    void this.context?.close();
    this.context = null;
    this.output = null;
  }

  private ensureGraph() {
    if (this.context) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const left = context.createOscillator();
    const right = context.createOscillator();
    const leftGain = context.createGain();
    const rightGain = context.createGain();
    const merger = context.createChannelMerger(2);
    const output = context.createGain();
    const drift = context.createOscillator();
    const driftDepth = context.createGain();

    left.type = "sine";
    right.type = "sine";
    leftGain.gain.value = 1;
    rightGain.gain.value = 1;
    output.gain.value = 0.0001;
    merger.channelInterpretation = "discrete";

    // A very slow common drift keeps the bed organic while preserving the
    // exact difference between left and right frequencies.
    drift.type = "sine";
    drift.frequency.value = 0.027;
    driftDepth.gain.value = 1.6;
    drift.connect(driftDepth);
    driftDepth.connect(left.frequency);
    driftDepth.connect(right.frequency);

    left.connect(leftGain).connect(merger, 0, 0);
    right.connect(rightGain).connect(merger, 0, 1);
    merger.connect(output).connect(context.destination);
    left.start();
    right.start();
    drift.start();

    this.context = context;
    this.output = output;
    this.left = left;
    this.right = right;
    this.drift = drift;
    this.applyMode(this.mode);
  }

  private applyMode(mode: BinauralMode) {
    if (!this.context || !this.left || !this.right) return;
    const preset = binauralPresets[mode];
    const now = this.context.currentTime;
    const { leftHz, rightHz } = binauralPair(preset.carrierHz, preset.beatHz);
    this.left.frequency.setTargetAtTime(leftHz, now, 0.8);
    this.right.frequency.setTargetAtTime(rightHz, now, 0.8);
  }
}

export class EtherlaneSynth {
  private context: AudioContext | null = null;
  private masterBus: GainNode | null = null;
  private padBus: GainNode | null = null;
  private accentBus: GainNode | null = null;
  private drumBus: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private filterLfo: OscillatorNode | null = null;
  private filterLfoGain: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private delayL: DelayNode | null = null;
  private delayR: DelayNode | null = null;
  private delaySend: GainNode | null = null;
  private feedbackL: GainNode | null = null;
  private feedbackR: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private breathBuffer: AudioBuffer | null = null;
  private drumNoiseBuffer: AudioBuffer | null = null;

  private padVoices: PadVoice[] = [];
  private activeAccents = 0;
  private queue: MusicSignal[] = [];
  private drainTimer: number | null = null;
  private evolutionTimer: number | null = null;
  private padClearTimer: number | null = null;
  private rhythmTimer: number | null = null;
  private kickPulseTimers = new Set<number>();
  private evolutionStep = 0;
  private rhythmStep = 0;
  private rhythmSeed = 911;
  private rhythmEnergy = 0.5;
  private nextRhythmAt = 0;
  private rhythmMode: RhythmMode = "ambient";
  private modulation: DataModulation = { ...defaultDataModulation };
  private signalSequence = 0;
  private lastHarmonyAt = 0;
  private lastAccentAt = 0;
  private running = false;
  private liveCount = 1;
  private intensity = 0.72;
  private lastSignal: MusicSignal = {
    source: "SYNTHETIC",
    kind: "AMBIENT",
    magnitude: 40,
    tone: "violet",
    timestamp: 0,
  };
  private settings: SynthSettings = { ...defaultSynthSettings };
  private readonly onFrame: (frame: SynthFrame) => void;
  private readonly onKick?: (pulse: KickPulse) => void;

  constructor(onFrame: (frame: SynthFrame) => void, onKick?: (pulse: KickPulse) => void) {
    this.onFrame = onFrame;
    this.onKick = onKick;
  }

  setSettings(next: SynthSettings) {
    const scaleChanged = next.scale !== this.settings.scale || next.key !== this.settings.key;
    const timbreChanged =
      next.palette !== this.settings.palette || next.shimmer !== this.settings.shimmer;
    this.settings = { ...next };
    if (!this.context) return;
    const now = this.context.currentTime;
    const softClamp = 0.12;
    const cutoff = clamp(this.warmthHz() * 0.62 + this.modulation.cutoff * 0.38, 260, 6200);
    this.padFilter?.frequency.setTargetAtTime(cutoff, now, softClamp);
    this.reverbSend?.gain.setTargetAtTime(
      clamp((next.space / 100) * 0.58 + this.modulation.reverb * 0.42, 0.12, 0.9),
      now,
      softClamp,
    );
    this.delaySend?.gain.setTargetAtTime(
      clamp((next.delay / 100) * 0.28 + this.modulation.delay * 0.64, 0.04, 0.48),
      now,
      softClamp,
    );
    const safeFeedback = clamp(
      0.12 + (next.delay / 100) * 0.16 + this.modulation.feedback * 0.34,
      0.12,
      0.43,
    );
    this.feedbackL?.gain.setTargetAtTime(safeFeedback, now, softClamp);
    this.feedbackR?.gain.setTargetAtTime(safeFeedback, now, softClamp);
    this.filterLfoGain?.gain.setTargetAtTime((next.drift / 100) * 900, now, softClamp);
    this.masterBus?.gain.setTargetAtTime(this.running ? (next.master / 100) * 0.9 : 0.0001, now, softClamp);
    if ((scaleChanged || timbreChanged) && this.running) this.retunePad(timbreChanged);
  }

  /** Number of live public feeds (0-3) — drives the pad chord. */
  setHealth(liveCount: number) {
    const clamped = clamp(Math.round(liveCount), 0, 6);
    if (clamped === this.liveCount) return;
    this.liveCount = clamped;
    if (this.running) this.retunePad();
  }

  /** Global intensity (0-1) — scales movement + accent energy. */
  setIntensity(value: number) {
    this.intensity = clamp(value, 0, 1);
  }

  setRhythmMode(mode: RhythmMode) {
    if (mode === this.rhythmMode) return;
    this.rhythmMode = mode;
    this.rhythmStep = 0;
    this.rhythmSeed = hashText(`${mode}:${this.lastSignal.source}:${this.lastSignal.kind}`);
    if (!this.running) return;
    this.stopRhythm();
    this.startRhythm();
    this.emitFrame();
  }

  push(signal: MusicSignal) {
    this.lastSignal = signal;
    this.signalSequence += 1;
    this.modulation = modulationForSignal(signal, this.signalSequence) as DataModulation;
    this.rhythmSeed = hashText(
      `${this.rhythmSeed}:${signal.source}:${signal.kind}:${Math.round(signal.magnitude)}`,
    );
    this.rhythmEnergy = clamp(
      this.rhythmEnergy * 0.68 + (signal.magnitude / 100) * 0.32,
      0.12,
      1,
    );
    this.applyDataModulation();
    const harmonyNow = performance.now();
    const harmonicSource =
      signal.source === "WIKIMEDIA" ||
      signal.source === "INFRASTRUCTURE" ||
      signal.source === "RIS" ||
      this.modulation.seed % 11 === 0;
    if (this.running && harmonicSource && harmonyNow - this.lastHarmonyAt > 2600) {
      this.lastHarmonyAt = harmonyNow;
      this.evolutionStep += this.modulation.chordAdvance;
      this.retunePad();
      this.scheduleEvolution();
    }
    if (!this.running) return;
    this.queue.push(signal);
    this.queue = this.queue.slice(-32);
  }

  async start() {
    this.ensureGraph();
    if (!this.context || !this.masterBus) return false;
    await this.context.resume();
    if (this.padClearTimer !== null) {
      window.clearTimeout(this.padClearTimer);
      this.padClearTimer = null;
    }
    this.running = true;
    const now = this.context.currentTime;
    this.masterBus.gain.cancelScheduledValues(now);
    this.masterBus.gain.setValueAtTime(0.0001, now);
    this.masterBus.gain.setTargetAtTime((this.settings.master / 100) * 0.9, now, 0.6);
    this.retunePad();
    this.applyDataModulation();
    if (this.drainTimer === null) {
      this.drainTimer = window.setInterval(() => this.drainQueue(), 45);
    }
    this.scheduleEvolution();
    this.startRhythm();
    return true;
  }

  stop() {
    if (!this.context || !this.masterBus) {
      this.running = false;
      return;
    }
    const now = this.context.currentTime;
    this.masterBus.gain.cancelScheduledValues(now);
    this.masterBus.gain.setTargetAtTime(0.0001, now, 0.5);
    this.running = false;
    this.queue = [];
    if (this.evolutionTimer !== null) window.clearTimeout(this.evolutionTimer);
    this.evolutionTimer = null;
    this.stopRhythm();
    if (this.padClearTimer !== null) window.clearTimeout(this.padClearTimer);
    this.padClearTimer = window.setTimeout(() => {
      if (!this.running) this.clearPad();
      this.padClearTimer = null;
    }, 1600);
  }

  dispose() {
    if (this.drainTimer !== null) window.clearInterval(this.drainTimer);
    this.drainTimer = null;
    this.stopRhythm();
    if (this.evolutionTimer !== null) window.clearTimeout(this.evolutionTimer);
    if (this.padClearTimer !== null) window.clearTimeout(this.padClearTimer);
    this.evolutionTimer = null;
    this.padClearTimer = null;
    this.running = false;
    this.clearPad();
    try {
      this.filterLfo?.stop();
    } catch {
      // already stopped
    }
    void this.context?.close();
    this.context = null;
  }

  private warmthHz() {
    // 300 Hz (very dark) .. 6000 Hz (open), curved for musical taste.
    const t = this.settings.warmth / 100;
    return 300 + t ** 1.8 * 5700;
  }

  private applyDataModulation() {
    if (!this.context) return;
    const now = this.context.currentTime;
    const glide = 0.18 + (1 - this.modulation.density) * 0.34;
    const cutoff = clamp(
      this.warmthHz() * 0.58 + this.modulation.cutoff * 0.42,
      240,
      6400,
    );
    const reverb = clamp(
      (this.settings.space / 100) * 0.55 + this.modulation.reverb * 0.45,
      0.14,
      0.92,
    );
    const delay = clamp(
      (this.settings.delay / 100) * 0.27 + this.modulation.delay * 0.68,
      0.045,
      0.48,
    );
    const feedback = clamp(
      0.1 + (this.settings.delay / 100) * 0.15 + this.modulation.feedback * 0.38,
      0.11,
      0.43,
    );
    this.padFilter?.frequency.setTargetAtTime(cutoff, now, glide);
    this.reverbSend?.gain.setTargetAtTime(reverb, now, glide);
    this.delaySend?.gain.setTargetAtTime(delay, now, glide);
    this.delayL?.delayTime.setTargetAtTime(
      0.17 + this.modulation.delay * 0.58,
      now,
      0.7,
    );
    this.delayR?.delayTime.setTargetAtTime(
      0.29 + this.modulation.delay * 0.71,
      now,
      0.7,
    );
    this.feedbackL?.gain.setTargetAtTime(feedback, now, glide);
    this.feedbackR?.gain.setTargetAtTime(clamp(feedback * 0.91, 0.1, 0.4), now, glide);
    this.filterLfo?.frequency.setTargetAtTime(this.modulation.driftRate, now, 0.8);
    this.filterLfoGain?.gain.setTargetAtTime(
      (this.settings.drift / 100) * (520 + this.modulation.density * 760),
      now,
      0.6,
    );
    this.emitFrame();
  }

  private ensureGraph() {
    if (this.context) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();

    const masterBus = context.createGain();
    const limiter = context.createDynamicsCompressor();
    const highShelf = context.createBiquadFilter();

    const padBus = context.createGain();
    const accentBus = context.createGain();
    const drumBus = context.createGain();
    const padFilter = context.createBiquadFilter();

    const reverb = context.createConvolver();
    const reverbSend = context.createGain();

    const delayL = context.createDelay(1.5);
    const delayR = context.createDelay(1.5);
    const delaySend = context.createGain();
    const feedbackL = context.createGain();
    const feedbackR = context.createGain();

    // Master chain: [buses] -> highShelf -> limiter -> destination
    limiter.threshold.value = -3.5;
    limiter.knee.value = 12;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;
    highShelf.type = "highshelf";
    highShelf.frequency.value = 5200;
    highShelf.gain.value = -3.5; // tame fizz for a warmer top end
    masterBus.gain.value = 0.0001;

    padFilter.type = "lowpass";
    padFilter.frequency.value = this.warmthHz();
    padFilter.Q.value = 0.6;
    drumBus.gain.value = 0.72;

    reverb.buffer = makeHallImpulse(context, 4.6, 2.6);
    reverbSend.gain.value = (this.settings.space / 100) * 0.9;

    delayL.delayTime.value = 0.38;
    delayR.delayTime.value = 0.53; // offset for stereo spread
    delaySend.gain.value = (this.settings.delay / 100) * 0.5;
    feedbackL.gain.value = 0.12 + (this.settings.delay / 100) * 0.34;
    feedbackR.gain.value = feedbackL.gain.value;

    // Slow filter movement (drift).
    const filterLfo = context.createOscillator();
    const filterLfoGain = context.createGain();
    filterLfo.type = "sine";
    filterLfo.frequency.value = 0.06;
    filterLfoGain.gain.value = (this.settings.drift / 100) * 900;
    filterLfo.connect(filterLfoGain).connect(padFilter.frequency);
    filterLfo.start();

    // Routing.
    padBus.connect(padFilter);
    padFilter.connect(highShelf); // dry pad
    accentBus.connect(highShelf); // dry accents
    drumBus.connect(highShelf); // dry procedural drums

    // Sends (post-filter for pad, direct for accents via a tap).
    padFilter.connect(reverbSend);
    accentBus.connect(reverbSend);
    reverbSend.connect(reverb).connect(highShelf);

    padFilter.connect(delaySend);
    accentBus.connect(delaySend);
    delaySend.connect(delayL);
    delaySend.connect(delayR);
    delayL.connect(feedbackL).connect(delayR);
    delayR.connect(feedbackR).connect(delayL);
    const delayMergeL = context.createStereoPanner();
    const delayMergeR = context.createStereoPanner();
    delayMergeL.pan.value = -0.6;
    delayMergeR.pan.value = 0.6;
    delayL.connect(delayMergeL).connect(highShelf);
    delayR.connect(delayMergeR).connect(highShelf);

    highShelf.connect(limiter).connect(masterBus).connect(context.destination);

    this.context = context;
    this.masterBus = masterBus;
    this.padBus = padBus;
    this.accentBus = accentBus;
    this.drumBus = drumBus;
    this.padFilter = padFilter;
    this.filterLfo = filterLfo;
    this.filterLfoGain = filterLfoGain;
    this.reverbSend = reverbSend;
    this.delayL = delayL;
    this.delayR = delayR;
    this.delaySend = delaySend;
    this.feedbackL = feedbackL;
    this.feedbackR = feedbackR;
    this.limiter = limiter;
    const breathBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.7), context.sampleRate);
    const breathData = breathBuffer.getChannelData(0);
    let breathSeed = 9191;
    for (let index = 0; index < breathData.length; index += 1) {
      breathSeed = (breathSeed * 16807) % 2147483647;
      breathData[index] = ((breathSeed / 2147483647) * 2 - 1) * 0.7;
    }
    this.breathBuffer = breathBuffer;
    const drumNoiseBuffer = context.createBuffer(
      1,
      Math.floor(context.sampleRate * 1.2),
      context.sampleRate,
    );
    const drumNoise = drumNoiseBuffer.getChannelData(0);
    let drumSeed = 1447;
    for (let index = 0; index < drumNoise.length; index += 1) {
      drumSeed = (drumSeed * 48271) % 2147483647;
      drumNoise[index] = (drumSeed / 2147483647) * 2 - 1;
    }
    this.drumNoiseBuffer = drumNoiseBuffer;
  }

  private retunePad(forceRebuild = false) {
    if (!this.context || !this.padBus) return;
    const chord = padChordForHealth(
      this.liveCount,
      this.settings.scale,
      this.settings.key,
      this.evolutionStep,
    );
    const wanted = new Set(chord);
    if (forceRebuild) {
      this.padVoices.forEach((voice) => this.fadeOutPadVoice(voice));
      this.padVoices = [];
    }
    // Fade out voices no longer in the chord.
    this.padVoices = this.padVoices.filter((voice) => {
      if (wanted.has(voice.midi)) return true;
      this.fadeOutPadVoice(voice);
      return false;
    });
    // Add new voices.
    const existing = new Set(this.padVoices.map((v) => v.midi));
    for (const midi of chord) {
      if (!existing.has(midi)) this.padVoices.push(this.spawnPadVoice(midi));
    }
    this.emitFrame(midiToName(chord[0]));
  }

  private spawnPadVoice(midi: number): PadVoice {
    const context = this.context!;
    const now = context.currentTime;
    const gain = context.createGain();
    const freq = midiToFrequency(midi);
    const width = 4 + (this.settings.shimmer / 100) * 14 + this.modulation.density * 5;
    const voiceCount = this.modulation.voice === "AIR" || this.modulation.voice === "FOLD" ? 4 : 3;
    const detunes = ensembleDetune(voiceCount, width);
    const sources: AudioScheduledSourceNode[] = detunes.map((cents) => {
      const osc = context.createOscillator();
      osc.type =
        this.settings.palette === "glass"
          ? "triangle"
          : this.settings.palette === "choir"
            ? "sine"
            : this.modulation.voice === "PULSE"
              ? "square"
              : this.modulation.voice === "GLASS"
                ? "triangle"
                : "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = cents + this.modulation.pitchCents * 0.12;
      osc.connect(gain);
      osc.start(now);
      return osc;
    });
    if (this.settings.palette === "choir" && this.breathBuffer) {
      const breath = context.createBufferSource();
      const breathFilter = context.createBiquadFilter();
      const breathGain = context.createGain();
      breath.buffer = this.breathBuffer;
      breath.loop = true;
      breathFilter.type = "bandpass";
      breathFilter.frequency.value = clamp(freq * 4.2, 480, 1900);
      breathFilter.Q.value = 0.72;
      breathGain.gain.value = 0.24;
      breath.connect(breathFilter).connect(breathGain).connect(gain);
      breath.start(now);
      sources.push(breath);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.setTargetAtTime(this.settings.palette === "choir" ? 0.082 : 0.06, now, 1.4);
    gain.connect(this.padBus!);
    return { sources, gain, midi };
  }

  private fadeOutPadVoice(voice: PadVoice) {
    const context = this.context!;
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.8);
    voice.sources.forEach((source) => {
      try {
        source.stop(now + 3);
      } catch {
        // ignore
      }
    });
  }

  private clearPad() {
    this.padVoices.forEach((voice) => {
      try {
        voice.gain.disconnect();
        voice.sources.forEach((source) => source.stop());
      } catch {
        // ignore
      }
    });
    this.padVoices = [];
  }

  private scheduleEvolution() {
    if (!this.running) return;
    if (this.evolutionTimer !== null) window.clearTimeout(this.evolutionTimer);
    const irregularity = (this.modulation.seed >>> 9) % 4200;
    const wait =
      4200 +
      (1 - this.intensity) * 3600 +
      (1 - this.modulation.density) * 3100 +
      irregularity;
    this.evolutionTimer = window.setTimeout(() => {
      if (!this.running) return;
      this.evolutionStep += this.modulation.chordAdvance;
      this.retunePad(this.modulation.voice === "FOLD" || this.evolutionStep % 5 === 0);
      this.scheduleEvolution();
    }, wait);
  }

  private drainQueue() {
    if (!this.running || !this.context) return;
    const now = performance.now();
    if (this.queue.length === 0) return;
    if (now - this.lastAccentAt < 70) return; // precedence effect spacing
    if (this.activeAccents > 12) {
      this.queue.shift(); // drop rather than pile up
      return;
    }
    const signal = this.queue.shift()!;
    this.lastAccentAt = now;
    this.triggerAccent(signal);
  }

  private triggerAccent(signal: MusicSignal) {
    if (!this.context || !this.accentBus) return;
    const context = this.context;
    const at = context.currentTime + 0.02;
    const {
      midi: mappedMidi,
      velocity,
      attack,
      release,
      pan,
      bright,
    } = accentForSignal(
      signal,
      this.settings.scale,
      this.settings.key,
    );
    const midi = clamp(mappedMidi + this.modulation.octave * 12, 35, 91);
    const freq = midiToFrequency(midi);
    const level = velocity * (0.5 + this.intensity * 0.6);

    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(
      clamp(480 + bright * 2100 + this.modulation.cutoff * 0.48, 360, 6800),
      at,
    );
    filter.Q.value = 0.7 + this.modulation.density * 2.1;
    panner.pan.value = pan;

    // Bowed-string timbre: two detuned saws + a soft sub, gentle attack.
    const oscA = context.createOscillator();
    const oscB = context.createOscillator();
    const sub = context.createOscillator();
    oscA.type =
      this.settings.palette === "glass"
        ? "triangle"
        : this.settings.palette === "choir"
          ? "sine"
          : this.modulation.voice === "PULSE"
            ? "square"
            : this.modulation.voice === "GLASS"
              ? "triangle"
              : "sawtooth";
    oscB.type = oscA.type;
    sub.type = "sine";
    oscA.frequency.value = freq;
    oscB.frequency.value = freq;
    sub.frequency.value = freq / 2;
    oscA.detune.value = -6 + this.modulation.pitchCents;
    oscB.detune.value = 6 + this.modulation.pitchCents;
    const subGain = context.createGain();
    subGain.gain.value = signal.source === "RIS" ? 0.4 : 0.18;

    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0015, level * 0.32), at + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0008, level * 0.16), at + attack + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);

    oscA.connect(filter);
    oscB.connect(filter);
    sub.connect(subGain).connect(filter);
    filter.connect(panner).connect(gain).connect(this.accentBus);

    const stopAt = at + attack + release + 0.1;
    [oscA, oscB, sub].forEach((osc) => {
      osc.start(at);
      osc.stop(stopAt);
    });
    this.activeAccents += 1;
    oscA.onended = () => {
      this.activeAccents = Math.max(0, this.activeAccents - 1);
    };

    this.emitFrame(midiToName(midi));
  }

  private startRhythm() {
    if (
      !this.running ||
      !this.context ||
      this.rhythmMode === "ambient" ||
      this.rhythmTimer !== null
    ) {
      return;
    }
    this.nextRhythmAt = this.context.currentTime + 0.06;
    this.scheduleRhythmWindow();
    this.rhythmTimer = window.setInterval(() => this.scheduleRhythmWindow(), 25);
  }

  private stopRhythm() {
    if (this.rhythmTimer !== null) window.clearInterval(this.rhythmTimer);
    this.rhythmTimer = null;
    for (const timer of this.kickPulseTimers) window.clearTimeout(timer);
    this.kickPulseTimers.clear();
  }

  private scheduleRhythmWindow() {
    if (!this.context || !this.running || this.rhythmMode === "ambient") return;
    const mode = this.rhythmMode;
    const profile = rhythmPresets[mode];
    const livingTempo =
      profile.bpm +
      (this.modulation.density - 0.5) * (mode === "idm" ? 10 : 5) +
      ((this.modulation.seed >>> 21) % 5) -
      2;
    const sixteenth = 60 / livingTempo / 4;
    const horizon = this.context.currentTime + 0.12;

    while (this.nextRhythmAt < horizon) {
      const cell = rhythmStepFor(mode, this.rhythmStep, this.rhythmSeed, this.rhythmEnergy);
      const at = Math.max(
        this.context.currentTime + 0.003,
        this.nextRhythmAt + cell.microShift,
      );
      if (cell.kick) this.triggerKick(at, mode, cell.accent);
      if (cell.snare) this.triggerNoiseDrum(at, "snare", cell.accent);
      if (cell.closedHat) this.triggerNoiseDrum(at, "closed-hat", cell.accent);
      if (cell.openHat) this.triggerNoiseDrum(at, "open-hat", cell.accent);
      if (cell.percussion) this.triggerPercussion(at, cell.accent, this.rhythmStep);
      if (cell.bass) this.triggerBass(at, mode, cell.accent);
      if (cell.synth) this.triggerDataSynth(at, mode, cell.accent, cell.gate, this.rhythmStep);

      this.rhythmStep += 1;
      this.nextRhythmAt += sixteenth;
      this.rhythmEnergy = Math.max(0.18, this.rhythmEnergy * 0.996);
    }
  }

  private triggerKick(
    at: number,
    mode: Exclude<RhythmMode, "ambient">,
    accent: number,
  ) {
    if (!this.context || !this.drumBus) return;
    const context = this.context;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const body = context.createBiquadFilter();
    const duration = mode === "techno" ? 0.38 : mode === "edm" ? 0.3 : 0.22;
    const level = clamp(0.42 + accent * 0.3 + this.rhythmEnergy * 0.1, 0.42, 0.78);

    oscillator.type = mode === "idm" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(mode === "edm" ? 178 : 154, at);
    oscillator.frequency.exponentialRampToValueAtTime(mode === "techno" ? 43 : 47, at + 0.055);
    body.type = "lowpass";
    body.frequency.value = mode === "techno" ? 360 : 520;
    body.Q.value = 0.8;
    envelope.gain.setValueAtTime(level, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(body).connect(envelope).connect(this.drumBus);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);

    if (mode === "techno") {
      const rumble = context.createOscillator();
      const rumbleEnvelope = context.createGain();
      const rumbleFilter = context.createBiquadFilter();
      rumble.type = "sine";
      rumble.frequency.setValueAtTime(47, at + 0.025);
      rumble.frequency.exponentialRampToValueAtTime(36, at + 0.46);
      rumbleFilter.type = "lowpass";
      rumbleFilter.frequency.value = 115;
      rumbleEnvelope.gain.setValueAtTime(0.0001, at);
      rumbleEnvelope.gain.exponentialRampToValueAtTime(level * 0.16, at + 0.055);
      rumbleEnvelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.46);
      rumble.connect(rumbleFilter).connect(rumbleEnvelope).connect(this.drumBus);
      rumble.start(at);
      rumble.stop(at + 0.49);
    }

    // Musical sidechain: the kick creates breathing room in the evolving pad.
    if (this.padBus) {
      this.padBus.gain.setValueAtTime(1, at);
      this.padBus.gain.exponentialRampToValueAtTime(mode === "edm" ? 0.18 : 0.28, at + 0.014);
      this.padBus.gain.exponentialRampToValueAtTime(0.98, at + (mode === "edm" ? 0.24 : 0.18));
    }

    if (this.onKick) {
      const delayMs = Math.max(0, (at - context.currentTime) * 1000);
      const timer = window.setTimeout(() => {
        this.kickPulseTimers.delete(timer);
        this.onKick?.({
          mode,
          energy: clamp(level, 0, 1),
          tone: this.lastSignal.tone,
        });
      }, delayMs);
      this.kickPulseTimers.add(timer);
    }
  }

  private triggerNoiseDrum(
    at: number,
    kind: "snare" | "closed-hat" | "open-hat",
    accent: number,
  ) {
    if (!this.context || !this.drumBus || !this.drumNoiseBuffer) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    const panner = this.context.createStereoPanner();
    const duration = kind === "snare" ? 0.19 : kind === "open-hat" ? 0.24 : 0.048;
    const base = kind === "snare" ? 0.18 : kind === "open-hat" ? 0.095 : 0.075;

    source.buffer = this.drumNoiseBuffer;
    source.playbackRate.value = kind === "snare" ? 0.82 : 1.2;
    filter.type = kind === "snare" ? "bandpass" : "highpass";
    filter.frequency.value =
      kind === "snare"
        ? clamp(1250 + this.modulation.cutoff * 0.24, 1350, 2800)
        : clamp(
            (this.rhythmMode === "idm" ? 6100 : 5600) + this.modulation.cutoff * 0.32,
            6200,
            9800,
          );
    filter.Q.value = kind === "snare" ? 0.7 : 0.45;
    panner.pan.value =
      kind === "snare" ? 0.05 : ((this.rhythmStep + this.rhythmSeed) % 5 - 2) * 0.16;
    envelope.gain.setValueAtTime(base * accent, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(envelope).connect(panner).connect(this.drumBus);
    source.start(at);
    source.stop(at + duration + 0.02);
  }

  private triggerPercussion(at: number, accent: number, step: number) {
    if (!this.context || !this.drumBus) return;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    const panner = this.context.createStereoPanner();
    const pitch =
      150 +
      ((this.rhythmSeed + step * 47) % 560) *
        2 ** (clamp(this.modulation.octave, -1, 1) * 0.5);

    oscillator.type = this.rhythmMode === "idm" ? "square" : "triangle";
    oscillator.frequency.setValueAtTime(pitch, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(90, pitch * 0.58), at + 0.08);
    filter.type = "bandpass";
    filter.frequency.value = pitch * 1.3;
    filter.Q.value = 2.8;
    panner.pan.value = ((this.rhythmSeed + step * 13) % 17) / 8 - 1;
    envelope.gain.setValueAtTime(0.045 * accent, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
    oscillator.connect(filter).connect(envelope).connect(panner).connect(this.drumBus);
    oscillator.start(at);
    oscillator.stop(at + 0.13);
  }

  private triggerBass(
    at: number,
    mode: Exclude<RhythmMode, "ambient">,
    accent: number,
  ) {
    if (!this.context || !this.drumBus) return;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    const rootMidi = clamp(
      (this.padVoices[0]?.midi ?? 50) - 12 + this.modulation.octave * 12,
      27,
      58,
    );
    const duration = mode === "edm" ? 0.18 : mode === "techno" ? 0.24 : 0.12;

    oscillator.type = mode === "idm" ? "square" : "sawtooth";
    oscillator.frequency.value =
      midiToFrequency(rootMidi) * 2 ** (this.modulation.pitchCents / 1200);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(
      clamp((mode === "techno" ? 180 : 320) + this.modulation.cutoff * 0.13, 190, 980),
      at,
    );
    filter.frequency.exponentialRampToValueAtTime(120, at + duration);
    filter.Q.value = mode === "edm" ? 3.2 : 1.7;
    envelope.gain.setValueAtTime(0.08 * accent, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(filter).connect(envelope).connect(this.drumBus);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.03);
  }

  private triggerDataSynth(
    at: number,
    mode: Exclude<RhythmMode, "ambient">,
    accent: number,
    gate: number,
    step: number,
  ) {
    if (!this.context || !this.accentBus) return;
    const context = this.context;
    const voice = this.modulation.voice;
    const phrase = Math.floor(step / 32);
    const degree =
      ((this.modulation.seed >>> 4) + step * (mode === "idm" ? 3 : 2) + phrase * 5) % 28;
    const baseMidi = quantizeToScale(
      degree,
      this.settings.scale,
      this.settings.key,
      5,
    );
    const midi = clamp(baseMidi + this.modulation.octave * 12, 38, 94);
    const frequency =
      midiToFrequency(midi) * 2 ** (this.modulation.pitchCents / 1200);
    const duration = 0.08 + clamp(gate, 0, 1) * (mode === "idm" ? 0.34 : 0.56);

    const carrier = context.createOscillator();
    const modulator = context.createOscillator();
    const modDepth = context.createGain();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const panner = context.createStereoPanner();

    carrier.type =
      voice === "GLASS"
        ? "triangle"
        : voice === "PULSE"
          ? "square"
          : voice === "SUB"
            ? "sine"
            : "sawtooth";
    carrier.frequency.value = frequency;
    modulator.type = voice === "AIR" ? "sine" : "triangle";
    modulator.frequency.value =
      frequency * (voice === "FM" ? 2.01 : voice === "FOLD" ? 0.503 : 1.004);
    modDepth.gain.value =
      voice === "FM" ? frequency * 0.38 : voice === "FOLD" ? frequency * 0.12 : 2.8;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(
      clamp(this.modulation.cutoff * (voice === "SUB" ? 0.28 : 0.78), 220, 6200),
      at,
    );
    filter.frequency.exponentialRampToValueAtTime(
      clamp(260 + this.modulation.cutoff * 0.18, 240, 1800),
      at + duration,
    );
    filter.Q.value = voice === "FOLD" ? 5.2 : 1.1 + this.modulation.density * 3.4;
    panner.pan.value = ((this.modulation.seed + step * 17) % 19) / 9 - 1;
    const level = 0.018 + accent * 0.035 + this.modulation.density * 0.018;
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(level, at + Math.min(0.035, duration * 0.22));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    modulator.connect(modDepth).connect(carrier.frequency);
    carrier.connect(filter).connect(envelope).connect(panner).connect(this.accentBus);
    carrier.start(at);
    modulator.start(at);
    carrier.stop(at + duration + 0.03);
    modulator.stop(at + duration + 0.03);
  }

  private emitFrame(note?: string) {
    this.onFrame({
      chord: this.padVoices.map((voice) => midiToName(voice.midi)).join(" "),
      note: note ?? midiToName(this.padVoices[0]?.midi ?? 50),
      source: this.lastSignal.source,
      energy: this.lastSignal.magnitude,
      voices: this.padVoices.length + this.activeAccents,
      rhythm: this.rhythmMode,
      bpm: rhythmPresets[this.rhythmMode].bpm,
      modulation: { ...this.modulation },
    });
  }
}
