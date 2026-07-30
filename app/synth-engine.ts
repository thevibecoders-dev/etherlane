export type SynthSource = "RIS" | "ATLAS" | "WIKIMEDIA" | "SYNTHETIC";
export type SynthTone = "violet" | "cyan" | "amber" | "coral";
export type ScaleName = "minor-pentatonic" | "dorian" | "lydian" | "whole-tone";

export type MusicSignal = {
  source: SynthSource;
  kind: string;
  magnitude: number;
  tone: SynthTone;
  timestamp: number;
};

export type SynthSettings = {
  tempo: number;
  density: number;
  cutoff: number;
  resonance: number;
  delay: number;
  space: number;
  waveform: OscillatorType;
  scale: ScaleName;
};

export type SynthFrame = {
  step: number;
  note: string;
  source: SynthSource;
  energy: number;
};

export const defaultSynthSettings: SynthSettings = {
  tempo: 92,
  density: 62,
  cutoff: 2800,
  resonance: 5.5,
  delay: 32,
  space: 38,
  waveform: "sawtooth",
  scale: "minor-pentatonic",
};

const scales: Record<ScaleName, number[]> = {
  "minor-pentatonic": [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  "whole-tone": [0, 2, 4, 6, 8, 10],
};

const noteNames = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function midiToFrequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}

function midiToName(note: number) {
  return `${noteNames[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}

function makeImpulse(context: AudioContext, seconds = 2.8) {
  const length = Math.floor(context.sampleRate * seconds);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    let seed = 1193 + channel * 811;
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 16807) % 2147483647;
      const noise = (seed / 2147483647) * 2 - 1;
      data[index] = noise * (1 - index / length) ** 3.1;
    }
  }
  return impulse;
}

export class EtherlaneSynth {
  private context: AudioContext | null = null;
  private input: GainNode | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private delay: DelayNode | null = null;
  private delaySend: GainNode | null = null;
  private feedback: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private scheduler: number | null = null;
  private nextStepAt = 0;
  private step = 0;
  private running = false;
  private queue: MusicSignal[] = [];
  private lastSignal: MusicSignal = {
    source: "SYNTHETIC",
    kind: "AMBIENT CLOCK",
    magnitude: 42,
    tone: "violet",
    timestamp: 0,
  };
  private settings: SynthSettings = { ...defaultSynthSettings };

  constructor(private readonly onFrame: (frame: SynthFrame) => void) {}

  setSettings(next: SynthSettings) {
    this.settings = { ...next };
    if (!this.context || !this.filter || !this.delaySend || !this.reverbSend || !this.feedback) return;
    const now = this.context.currentTime;
    this.filter.frequency.setTargetAtTime(next.cutoff, now, 0.08);
    this.filter.Q.setTargetAtTime(next.resonance, now, 0.08);
    this.delaySend.gain.setTargetAtTime(next.delay / 100, now, 0.08);
    this.feedback.gain.setTargetAtTime(0.18 + (next.delay / 100) * 0.48, now, 0.08);
    this.reverbSend.gain.setTargetAtTime(next.space / 100, now, 0.08);
  }

  push(signal: MusicSignal) {
    this.lastSignal = signal;
    if (!this.running) return;
    this.queue.push(signal);
    this.queue = this.queue.slice(-48);
  }

  async start() {
    this.ensureGraph();
    if (!this.context || !this.master) return false;
    await this.context.resume();
    this.running = true;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(0.58, this.context.currentTime, 0.04);
    this.nextStepAt = this.context.currentTime + 0.05;
    if (this.scheduler === null) {
      this.scheduler = window.setInterval(() => this.scheduleAhead(), 24);
    }
    return true;
  }

  stop() {
    this.running = false;
    this.queue = [];
    if (this.context && this.master) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.035);
    }
  }

  dispose() {
    if (this.scheduler !== null) window.clearInterval(this.scheduler);
    this.scheduler = null;
    this.running = false;
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
    const filter = context.createBiquadFilter();
    const dry = context.createGain();
    const delay = context.createDelay(1.5);
    const delaySend = context.createGain();
    const feedback = context.createGain();
    const reverb = context.createConvolver();
    const reverbSend = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const master = context.createGain();

    filter.type = "lowpass";
    filter.frequency.value = this.settings.cutoff;
    filter.Q.value = this.settings.resonance;
    dry.gain.value = 0.82;
    delay.delayTime.value = 0.31;
    delaySend.gain.value = this.settings.delay / 100;
    feedback.gain.value = 0.18 + (this.settings.delay / 100) * 0.48;
    reverb.buffer = makeImpulse(context);
    reverbSend.gain.value = this.settings.space / 100;
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.24;
    master.gain.value = 0.0001;

    input.connect(filter);
    filter.connect(dry).connect(compressor);
    filter.connect(delaySend).connect(delay).connect(compressor);
    delay.connect(feedback).connect(delay);
    filter.connect(reverbSend).connect(reverb).connect(compressor);
    compressor.connect(master).connect(context.destination);

    this.context = context;
    this.input = input;
    this.master = master;
    this.filter = filter;
    this.delay = delay;
    this.delaySend = delaySend;
    this.feedback = feedback;
    this.reverbSend = reverbSend;
  }

  private scheduleAhead() {
    if (!this.running || !this.context) return;
    const secondsPerStep = 60 / this.settings.tempo / 4;
    while (this.nextStepAt < this.context.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextStepAt);
      this.step = (this.step + 1) % 16;
      this.nextStepAt += secondsPerStep;
    }
  }

  private scheduleStep(step: number, at: number) {
    const signal = this.queue.shift() ?? this.lastSignal;
    const seed = hashText(`${signal.source}:${signal.kind}:${Math.round(signal.magnitude)}:${step}`);
    const densityThreshold = clamp(this.settings.density, 20, 100);
    const isAnchor = step === 0 || step === 4 || step === 8 || step === 12;
    if (!isAnchor && seed % 100 > densityThreshold) {
      this.onFrame({ step, note: "REST", source: signal.source, energy: signal.magnitude });
      return;
    }

    const scale = scales[this.settings.scale];
    const sourceOffset = {
      RIS: -12,
      ATLAS: 12,
      WIKIMEDIA: 19,
      SYNTHETIC: 0,
    }[signal.source];
    const root = 45 + sourceOffset;
    const degree = scale[seed % scale.length];
    const octave = Math.floor((seed / scale.length) % 2) * 12;
    const midi = root + degree + octave;
    const velocity = clamp(0.18 + signal.magnitude / 150, 0.2, 0.82);

    if (signal.source === "WIKIMEDIA" && (step % 4 === 0 || /CREATED/.test(signal.kind))) {
      const chord = [midi, midi + scale[Math.min(2, scale.length - 1)], midi + 12];
      chord.forEach((note, index) => this.triggerVoice(note, at + index * 0.018, velocity * 0.46, signal, 1.1));
    } else if (signal.source === "RIS") {
      this.triggerVoice(midi, at, velocity, signal, /WITHDRAWN|NOTIFICATION/.test(signal.kind) ? 0.78 : 1.8);
      if (step % 8 === 0) this.triggerSubPulse(midi - 12, at, velocity * 0.72);
    } else if (signal.source === "ATLAS") {
      this.triggerVoice(midi, at, velocity * 0.78, signal, 0.22);
    } else {
      this.triggerVoice(midi, at, velocity * 0.54, signal, 1.6);
    }

    if ((step === 0 || step === 8) && this.settings.density > 45) {
      this.triggerNoise(at, signal.magnitude / 100);
    }

    this.onFrame({ step, note: midiToName(midi), source: signal.source, energy: signal.magnitude });
  }

  private triggerVoice(
    midi: number,
    at: number,
    velocity: number,
    signal: MusicSignal,
    release: number,
  ) {
    if (!this.context || !this.input) return;
    const oscillator = this.context.createOscillator();
    const companion = this.context.createOscillator();
    const envelope = this.context.createGain();
    const voiceFilter = this.context.createBiquadFilter();
    const pan = this.context.createStereoPanner();
    const frequency = midiToFrequency(midi);
    const brightness = clamp(
      this.settings.cutoff * (0.46 + signal.magnitude / 145),
      220,
      9200,
    );

    oscillator.type = this.settings.waveform;
    oscillator.frequency.setValueAtTime(frequency, at);
    companion.type = signal.source === "ATLAS" ? "sine" : "triangle";
    companion.frequency.setValueAtTime(frequency * (signal.source === "RIS" ? 0.5 : 1.005), at);
    oscillator.detune.value = signal.tone === "coral" ? -8 : 4;
    companion.detune.value = signal.tone === "amber" ? 9 : -4;
    voiceFilter.type = "lowpass";
    voiceFilter.frequency.setValueAtTime(brightness, at);
    voiceFilter.Q.value = 1.4 + this.settings.resonance * 0.52;
    if (/WITHDRAWN|NOTIFICATION|HIGH LATENCY/.test(signal.kind)) {
      voiceFilter.frequency.exponentialRampToValueAtTime(Math.max(180, brightness * 0.24), at + release);
    }
    pan.pan.value = { RIS: -0.36, ATLAS: 0.34, WIKIMEDIA: 0.1, SYNTHETIC: -0.08 }[
      signal.source
    ];

    const attack = signal.source === "WIKIMEDIA" ? 0.08 : signal.source === "ATLAS" ? 0.005 : 0.025;
    const peak = velocity * 0.16;
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), at + attack);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.42), at + attack + 0.12);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + release);

    oscillator.connect(voiceFilter);
    companion.connect(voiceFilter);
    voiceFilter.connect(pan).connect(envelope).connect(this.input);
    oscillator.start(at);
    companion.start(at);
    oscillator.stop(at + release + 0.05);
    companion.stop(at + release + 0.05);
  }

  private triggerSubPulse(midi: number, at: number, velocity: number) {
    if (!this.context || !this.input) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), at);
    oscillator.frequency.exponentialRampToValueAtTime(midiToFrequency(midi - 5), at + 0.22);
    envelope.gain.setValueAtTime(Math.max(0.001, velocity * 0.12), at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
    oscillator.connect(envelope).connect(this.input);
    oscillator.start(at);
    oscillator.stop(at + 0.3);
  }

  private triggerNoise(at: number, energy: number) {
    if (!this.context || !this.input) return;
    const buffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * 0.09), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 733;
    for (let index = 0; index < data.length; index += 1) {
      seed = (seed * 48271) % 2147483647;
      data[index] = ((seed / 2147483647) * 2 - 1) * (1 - index / data.length);
    }
    const source = this.context.createBufferSource();
    const highpass = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    source.buffer = buffer;
    highpass.type = "highpass";
    highpass.frequency.value = 2800;
    envelope.gain.setValueAtTime(0.025 + energy * 0.035, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
    source.connect(highpass).connect(envelope).connect(this.input);
    source.start(at);
  }
}
