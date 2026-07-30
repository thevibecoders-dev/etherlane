// Etherlane immersive ambient engine.
//
// Two layers, both event-driven — no step sequencer, no "chiptune" blips:
//   1. A sustained supersaw STRING PAD whose chord follows how many public
//      feeds are live (1 = root drone, 2 = root+fifth, 3 = full add9 shimmer).
//   2. Soft, bowed ACCENT voices triggered by real signals, pitch quantised to
//      a musical scale, spaced by >=70 ms (precedence effect) so dense traffic
//      stays legible instead of turning to mud.
//
// Everything runs through a lush convolution reverb + ensemble chorus + stereo
// delay + a soft master limiter, so the whole thing reads as one warm space.
// Pure, side-effect-free helpers live at the top so they can be unit-tested in
// Node without a Web Audio context (see tests/synth-mapping.test.mjs).

import {
  accentForSignal,
  clamp,
  ensembleDetune,
  midiToFrequency,
  midiToName,
  padChordForHealth,
} from "./synth-math.mjs";

export type SynthSource = "RIS" | "ATLAS" | "WIKIMEDIA" | "SYNTHETIC";
export type SynthTone = "violet" | "cyan" | "amber" | "coral";
export type ScaleName =
  | "aeolian"
  | "dorian"
  | "lydian"
  | "minor-pentatonic"
  | "major-pentatonic";
export type KeyName = "C" | "D" | "E" | "F" | "G" | "A";
export type Palette = "strings" | "glass" | "choir";

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
  oscillators: OscillatorNode[];
  gain: GainNode;
  midi: number;
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

  async prepare() {
    this.ensureGraph();
    await this.context?.resume();
  }

  play(tone: SynthTone, energy: number, amount: number) {
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
    this.wet.gain.setTargetAtTime(0.34 + amount / 165, now, 0.04);

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
    const preDelay = context.createDelay(0.4);
    const convolver = context.createConvolver();
    const wet = context.createGain();
    const highpass = context.createBiquadFilter();

    preDelay.delayTime.value = 0.038;
    convolver.buffer = makeHallImpulse(context, 2.1, 3.1);
    wet.gain.value = 0.54;
    highpass.type = "highpass";
    highpass.frequency.value = 190;

    input.connect(preDelay).connect(convolver).connect(highpass).connect(wet).connect(context.destination);
    this.context = context;
    this.input = input;
    this.wet = wet;
  }
}

export class EtherlaneSynth {
  private context: AudioContext | null = null;
  private masterBus: GainNode | null = null;
  private padBus: GainNode | null = null;
  private accentBus: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private filterLfo: OscillatorNode | null = null;
  private filterLfoGain: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private delayL: DelayNode | null = null;
  private delayR: DelayNode | null = null;
  private delaySend: GainNode | null = null;
  private feedback: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;

  private padVoices: PadVoice[] = [];
  private activeAccents = 0;
  private queue: MusicSignal[] = [];
  private drainTimer: number | null = null;
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

  constructor(onFrame: (frame: SynthFrame) => void) {
    this.onFrame = onFrame;
  }

  setSettings(next: SynthSettings) {
    const scaleChanged = next.scale !== this.settings.scale || next.key !== this.settings.key;
    this.settings = { ...next };
    if (!this.context) return;
    const now = this.context.currentTime;
    const softClamp = 0.12;
    this.padFilter?.frequency.setTargetAtTime(this.warmthHz(), now, softClamp);
    this.reverbSend?.gain.setTargetAtTime((next.space / 100) * 0.9, now, softClamp);
    this.delaySend?.gain.setTargetAtTime((next.delay / 100) * 0.5, now, softClamp);
    this.feedback?.gain.setTargetAtTime(0.2 + (next.delay / 100) * 0.42, now, softClamp);
    this.filterLfoGain?.gain.setTargetAtTime((next.drift / 100) * 900, now, softClamp);
    this.masterBus?.gain.setTargetAtTime(this.running ? (next.master / 100) * 0.9 : 0.0001, now, softClamp);
    if (scaleChanged && this.running) this.retunePad();
  }

  /** Number of live public feeds (0-3) — drives the pad chord. */
  setHealth(liveCount: number) {
    const clamped = clamp(Math.round(liveCount), 0, 3);
    if (clamped === this.liveCount) return;
    this.liveCount = clamped;
    if (this.running) this.retunePad();
  }

  /** Global intensity (0-1) — scales movement + accent energy. */
  setIntensity(value: number) {
    this.intensity = clamp(value, 0, 1);
  }

  push(signal: MusicSignal) {
    this.lastSignal = signal;
    if (!this.running) return;
    this.queue.push(signal);
    this.queue = this.queue.slice(-32);
  }

  async start() {
    this.ensureGraph();
    if (!this.context || !this.masterBus) return false;
    await this.context.resume();
    this.running = true;
    const now = this.context.currentTime;
    this.masterBus.gain.cancelScheduledValues(now);
    this.masterBus.gain.setValueAtTime(0.0001, now);
    this.masterBus.gain.setTargetAtTime((this.settings.master / 100) * 0.9, now, 0.6);
    this.retunePad();
    if (this.drainTimer === null) {
      this.drainTimer = window.setInterval(() => this.drainQueue(), 45);
    }
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
    window.setTimeout(() => this.clearPad(), 1600);
  }

  dispose() {
    if (this.drainTimer !== null) window.clearInterval(this.drainTimer);
    this.drainTimer = null;
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
    const padFilter = context.createBiquadFilter();

    const reverb = context.createConvolver();
    const reverbSend = context.createGain();

    const delayL = context.createDelay(1.5);
    const delayR = context.createDelay(1.5);
    const delaySend = context.createGain();
    const feedback = context.createGain();

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

    reverb.buffer = makeHallImpulse(context, 4.6, 2.6);
    reverbSend.gain.value = (this.settings.space / 100) * 0.9;

    delayL.delayTime.value = 0.38;
    delayR.delayTime.value = 0.53; // offset for stereo spread
    delaySend.gain.value = (this.settings.delay / 100) * 0.5;
    feedback.gain.value = 0.2 + (this.settings.delay / 100) * 0.42;

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

    // Sends (post-filter for pad, direct for accents via a tap).
    padFilter.connect(reverbSend);
    accentBus.connect(reverbSend);
    reverbSend.connect(reverb).connect(highShelf);

    padFilter.connect(delaySend);
    accentBus.connect(delaySend);
    delaySend.connect(delayL);
    delaySend.connect(delayR);
    delayL.connect(feedback);
    delayR.connect(feedback);
    feedback.connect(delayL);
    feedback.connect(delayR);
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
    this.padFilter = padFilter;
    this.filterLfo = filterLfo;
    this.filterLfoGain = filterLfoGain;
    this.reverbSend = reverbSend;
    this.delayL = delayL;
    this.delayR = delayR;
    this.delaySend = delaySend;
    this.feedback = feedback;
    this.limiter = limiter;
  }

  private retunePad() {
    if (!this.context || !this.padBus) return;
    const chord = padChordForHealth(this.liveCount, this.settings.scale, this.settings.key);
    const wanted = new Set(chord);
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
    this.onFrame({
      chord: chord.map(midiToName).join(" "),
      note: midiToName(chord[0]),
      source: this.lastSignal.source,
      energy: this.lastSignal.magnitude,
      voices: this.padVoices.length + this.activeAccents,
    });
  }

  private spawnPadVoice(midi: number): PadVoice {
    const context = this.context!;
    const now = context.currentTime;
    const gain = context.createGain();
    const freq = midiToFrequency(midi);
    const width = 4 + (this.settings.shimmer / 100) * 16;
    const detunes = ensembleDetune(3, width);
    const oscillators = detunes.map((cents) => {
      const osc = context.createOscillator();
      osc.type = this.settings.palette === "glass" ? "triangle" : "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = cents;
      osc.connect(gain);
      osc.start(now);
      return osc;
    });
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.setTargetAtTime(0.06, now, 1.4); // slow bowed swell
    gain.connect(this.padBus!);
    return { oscillators, gain, midi };
  }

  private fadeOutPadVoice(voice: PadVoice) {
    const context = this.context!;
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.8);
    voice.oscillators.forEach((osc) => {
      try {
        osc.stop(now + 3);
      } catch {
        // ignore
      }
    });
  }

  private clearPad() {
    this.padVoices.forEach((voice) => {
      try {
        voice.gain.disconnect();
        voice.oscillators.forEach((osc) => osc.stop());
      } catch {
        // ignore
      }
    });
    this.padVoices = [];
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
    const { midi, velocity, attack, release, pan, bright } = accentForSignal(
      signal,
      this.settings.scale,
      this.settings.key,
    );
    const freq = midiToFrequency(midi);
    const level = velocity * (0.5 + this.intensity * 0.6);

    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(clamp(700 + bright * 4200, 400, 6500), at);
    filter.Q.value = 0.8;
    panner.pan.value = pan;

    // Bowed-string timbre: two detuned saws + a soft sub, gentle attack.
    const oscA = context.createOscillator();
    const oscB = context.createOscillator();
    const sub = context.createOscillator();
    oscA.type = this.settings.palette === "glass" ? "triangle" : "sawtooth";
    oscB.type = oscA.type;
    sub.type = "sine";
    oscA.frequency.value = freq;
    oscB.frequency.value = freq;
    sub.frequency.value = freq / 2;
    oscA.detune.value = -6;
    oscB.detune.value = 6;
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

    this.onFrame({
      chord: this.padVoices.map((v) => midiToName(v.midi)).join(" "),
      note: midiToName(midi),
      source: signal.source,
      energy: signal.magnitude,
      voices: this.padVoices.length + this.activeAccents,
    });
  }
}
