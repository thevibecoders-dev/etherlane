import { clamp, mapEventToSound, type ListeningMode, type SeaEvent } from "./listening-sea-model";

type AudioFrame = { level: number; eventEnergy: number };

function makeImpulse(context: AudioContext, seconds = 3.8, decay = 3.2) {
  const length = Math.floor(context.sampleRate * seconds);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const envelope = (1 - index / length) ** decay;
      data[index] = (Math.random() * 2 - 1) * envelope * (channel ? 0.94 : 1);
    }
  }
  return impulse;
}

function makeNoise(context: AudioContext, seconds = 1.2) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let previous = 0;
  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1;
    previous = previous * 0.93 + white * 0.07;
    data[index] = previous;
  }
  return buffer;
}

export class ListeningSeaAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private eventBus: GainNode | null = null;
  private wetBus: GainNode | null = null;
  private delaySend: GainNode | null = null;
  private delayL: DelayNode | null = null;
  private delayR: DelayNode | null = null;
  private feedbackL: GainNode | null = null;
  private feedbackR: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private noise: AudioBuffer | null = null;
  private droneGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private running = false;
  private mode: ListeningMode = "drift";
  private lastEventAt = 0;
  private eventEnergy = 0;

  async start() {
    if (this.running && this.context) {
      await this.context.resume();
      return;
    }
    const context = new AudioContext({ latencyHint: "interactive" });
    this.context = context;
    this.noise = makeNoise(context);

    const master = context.createGain();
    master.gain.value = 0.72;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -19;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.34;
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    master.connect(compressor).connect(analyser).connect(context.destination);

    const eventBus = context.createGain();
    eventBus.gain.value = 0.74;
    eventBus.connect(master);

    const convolver = context.createConvolver();
    convolver.buffer = makeImpulse(context);
    const wetBus = context.createGain();
    wetBus.gain.value = 0.32;
    convolver.connect(wetBus).connect(master);
    eventBus.connect(convolver);

    const delaySend = context.createGain();
    delaySend.gain.value = 0.21;
    const splitter = context.createChannelSplitter(2);
    const merger = context.createChannelMerger(2);
    const delayL = context.createDelay(0.8);
    const delayR = context.createDelay(0.8);
    const feedbackL = context.createGain();
    const feedbackR = context.createGain();
    delayL.delayTime.value = 0.18;
    delayR.delayTime.value = 0.27;
    feedbackL.gain.value = 0.28;
    feedbackR.gain.value = 0.23;
    eventBus.connect(delaySend).connect(splitter);
    splitter.connect(delayL, 0);
    splitter.connect(delayR, 1);
    delayL.connect(feedbackL).connect(delayL);
    delayR.connect(feedbackR).connect(delayR);
    delayL.connect(merger, 0, 0);
    delayR.connect(merger, 0, 1);
    merger.connect(wetBus);

    this.master = master;
    this.eventBus = eventBus;
    this.wetBus = wetBus;
    this.delaySend = delaySend;
    this.delayL = delayL;
    this.delayR = delayR;
    this.feedbackL = feedbackL;
    this.feedbackR = feedbackR;
    this.analyser = analyser;
    this.createDrone(context, master);
    this.running = true;
    await context.resume();
  }

  private createDrone(context: AudioContext, destination: AudioNode) {
    const now = context.currentTime;
    const droneGain = context.createGain();
    const droneFilter = context.createBiquadFilter();
    droneGain.gain.setValueAtTime(0.0001, now);
    droneGain.gain.exponentialRampToValueAtTime(0.17, now + 5.5);
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 680;
    droneFilter.Q.value = 0.48;
    droneGain.connect(droneFilter).connect(destination);
    this.droneGain = droneGain;
    this.droneFilter = droneFilter;

    [36.708, 73.416, 110.0].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const voiceGain = context.createGain();
      oscillator.type = index === 0 ? "sine" : index === 1 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index === 1 ? -3 : index === 2 ? 2 : 0;
      voiceGain.gain.value = [0.58, 0.24, 0.12][index];
      oscillator.connect(voiceGain).connect(droneGain);
      oscillator.start();
      this.oscillators.push(oscillator);
    });

    const breath = context.createOscillator();
    const breathDepth = context.createGain();
    breath.frequency.value = 0.041;
    breathDepth.gain.value = 110;
    breath.connect(breathDepth).connect(droneFilter.frequency);
    breath.start();
    this.oscillators.push(breath);
  }

  setMode(mode: ListeningMode) {
    this.mode = mode;
    if (!this.context || !this.eventBus || !this.wetBus) return;
    const now = this.context.currentTime;
    this.eventBus.gain.setTargetAtTime(mode === "drift" ? 0.62 : mode === "observe" ? 0.78 : 0.74, now, 0.5);
    this.wetBus.gain.setTargetAtTime(mode === "drift" ? 0.4 : mode === "observe" ? 0.28 : 0.34, now, 0.7);
  }

  setInfrastructureRisk(risk: number) {
    if (!this.context || !this.droneFilter || !this.droneGain) return;
    const now = this.context.currentTime;
    this.droneFilter.frequency.setTargetAtTime(720 - clamp(risk, 0, 100) * 4.1, now, 2.4);
    this.droneGain.gain.setTargetAtTime(0.17 + clamp(risk, 0, 100) * 0.00035, now, 3);
  }

  play(event: SeaEvent) {
    if (!this.context || !this.eventBus || !this.running) return;
    const now = this.context.currentTime;
    if (this.mode === "drift" && event.severity === "nominal" && now - this.lastEventAt < 1.15) return;
    if (this.mode !== "focus" && now - this.lastEventAt < 0.12) return;
    this.lastEventAt = now;
    const map = mapEventToSound(event);
    this.eventEnergy = clamp(this.eventEnergy + map.velocity * 0.75, 0, 1);

    if (this.delayL && this.delayR && this.feedbackL && this.feedbackR && this.delaySend) {
      this.delayL.delayTime.setTargetAtTime(map.delay, now, 0.08);
      this.delayR.delayTime.setTargetAtTime(clamp(map.delay * 1.43, 0.07, 0.46), now, 0.08);
      this.feedbackL.gain.setTargetAtTime(map.feedback, now, 0.12);
      this.feedbackR.gain.setTargetAtTime(map.feedback * 0.78, now, 0.12);
      this.delaySend.gain.setTargetAtTime(map.wet * 0.46, now, 0.1);
    }

    if (event.source === "MEASUREMENT") this.playDroplet(event, map);
    else if (event.source === "INFRASTRUCTURE") this.playSwell(event, map);
    else if (event.source === "KNOWLEDGE" || event.source === "PUBLICATION") this.playGlass(event, map);
    else this.playFelt(event, map);
  }

  private routeVoice(output: AudioNode, map: ReturnType<typeof mapEventToSound>) {
    if (!this.context || !this.eventBus) return;
    const filter = this.context.createBiquadFilter();
    const panner = this.context.createStereoPanner();
    filter.type = "lowpass";
    filter.frequency.value = map.cutoff;
    filter.Q.value = 0.45 + map.roughness * 2.2;
    panner.pan.value = map.pan;
    output.connect(filter).connect(panner).connect(this.eventBus);
  }

  private playFelt(event: SeaEvent, map: ReturnType<typeof mapEventToSound>) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const voice = this.context.createGain();
    voice.gain.setValueAtTime(0.0001, now);
    voice.gain.exponentialRampToValueAtTime(map.velocity * 0.25, now + 0.025);
    voice.gain.exponentialRampToValueAtTime(0.0001, now + map.duration);
    [1, 2, 3.01].forEach((ratio, index) => {
      const oscillator = this.context!.createOscillator();
      const harmonic = this.context!.createGain();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.value = map.frequency * ratio;
      harmonic.gain.value = [0.82, 0.13, 0.035][index] * (1 - map.roughness * 0.28);
      oscillator.connect(harmonic).connect(voice);
      oscillator.start(now);
      oscillator.stop(now + map.duration + 0.08);
    });
    this.routeVoice(voice, map);
    if (/WITHDRAW|NOTIFICATION/.test(event.kind)) this.addBreath(now, map.duration * 0.65, map.velocity * 0.06, voice);
  }

  private playDroplet(_event: SeaEvent, map: ReturnType<typeof mapEventToSound>) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(map.frequency * 2.8, now);
    oscillator.frequency.exponentialRampToValueAtTime(map.frequency * 1.45, now + 0.17);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(map.velocity * 0.23, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
    oscillator.connect(gain);
    this.routeVoice(gain, { ...map, cutoff: Math.max(2400, map.cutoff), duration: 0.72 });
    oscillator.start(now);
    oscillator.stop(now + 0.8);
  }

  private playGlass(_event: SeaEvent, map: ReturnType<typeof mapEventToSound>) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const voice = this.context.createGain();
    voice.gain.setValueAtTime(0.0001, now);
    voice.gain.exponentialRampToValueAtTime(map.velocity * 0.12, now + 0.06);
    voice.gain.exponentialRampToValueAtTime(0.0001, now + map.duration * 1.35);
    [1, 2.41, 3.76].forEach((ratio, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = map.frequency * ratio;
      gain.gain.value = [0.72, 0.18, 0.08][index];
      oscillator.connect(gain).connect(voice);
      oscillator.start(now);
      oscillator.stop(now + map.duration * 1.4);
    });
    this.routeVoice(voice, { ...map, cutoff: Math.max(3100, map.cutoff), wet: Math.max(0.48, map.wet) });
  }

  private playSwell(event: SeaEvent, map: ReturnType<typeof mapEventToSound>) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = event.severity === "outage" ? 45 : 55;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(map.velocity * 0.26, now + 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + map.duration + 1.8);
    oscillator.connect(gain);
    this.routeVoice(gain, { ...map, pan: 0, cutoff: 480, wet: 0.6 });
    this.addBreath(now, map.duration + 1.4, map.velocity * 0.12, gain);
    oscillator.start(now);
    oscillator.stop(now + map.duration + 2);
  }

  private addBreath(now: number, duration: number, level: number, output: AudioNode) {
    if (!this.context || !this.noise) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    source.loop = duration > this.noise.duration;
    filter.type = "bandpass";
    filter.frequency.value = 780;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), now + Math.min(0.45, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(output);
    source.start(now);
    source.stop(now + duration + 0.05);
  }

  frame(): AudioFrame {
    this.eventEnergy *= 0.94;
    if (!this.analyser) return { level: 0, eventEnergy: this.eventEnergy };
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    const level = data.reduce((sum, value) => sum + value, 0) / data.length / 255;
    return { level, eventEnergy: this.eventEnergy };
  }

  async stop() {
    if (!this.context) return;
    this.oscillators.forEach((oscillator) => {
      try { oscillator.stop(); } catch { /* already stopped */ }
    });
    await this.context.close();
    this.context = null;
    this.running = false;
  }
}
