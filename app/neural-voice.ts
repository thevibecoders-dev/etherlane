export type NeuralVoiceProgress = {
  loaded: number;
  total: number;
};

export type NeuralVoiceName = "hfc-female" | "hfc-male" | "cori" | "ryan";

export const neuralVoicePresets: Record<
  NeuralVoiceName,
  {
    label: string;
    character: string;
    voiceId: string;
    rate: number;
    depth: number;
    modelSize: string;
  }
> = {
  "hfc-female": {
    label: "HFC AURORA",
    character: "Warm, luminous feminine",
    voiceId: "en_US-hfc_female-medium",
    rate: 0.91,
    depth: 0.72,
    modelSize: "~63 MB",
  },
  "hfc-male": {
    label: "HFC NOCTURNE",
    character: "Deep, intimate masculine",
    voiceId: "en_US-hfc_male-medium",
    rate: 0.87,
    depth: 0.84,
    modelSize: "~63 MB",
  },
  cori: {
    label: "CORI HALO",
    character: "Clear, floating British",
    voiceId: "en_GB-cori-high",
    rate: 0.9,
    depth: 0.68,
    modelSize: "~114 MB",
  },
  ryan: {
    label: "RYAN DEEPFIELD",
    character: "Cinematic, grounded masculine",
    voiceId: "en_US-ryan-high",
    rate: 0.86,
    depth: 0.88,
    modelSize: "~114 MB",
  },
};

/**
 * Lazy, browser-only Piper voice.
 *
 * One selected model is active at a time. Switching voices releases Etherlane's
 * reference to the previous ONNX session and loads the selected model on demand.
 * Models may remain in Piper's device cache; spoken signal phrases remain
 * ephemeral and are never persisted by Etherlane.
 */
export class EtherlaneNeuralVoice {
  private session: import("@realtimex/piper-tts-web").TtsSession | null = null;
  private initializing: Promise<void> | null = null;
  private generation = 0;
  private voice: NeuralVoiceName;

  constructor(voice: NeuralVoiceName = "hfc-female") {
    this.voice = voice;
  }

  setVoice(voice: NeuralVoiceName) {
    if (voice === this.voice) return;
    this.voice = voice;
    this.generation += 1;
    this.session = null;
    this.initializing = null;
  }

  get preset() {
    return neuralVoicePresets[this.voice];
  }

  async prepare(onProgress?: (progress: NeuralVoiceProgress) => void) {
    if (this.session?.ready && this.session.voiceId === this.preset.voiceId) return;
    if (this.initializing) return this.initializing;
    const generation = this.generation;
    const voiceId = this.preset.voiceId;

    this.initializing = (async () => {
      const { TtsSession } = await import("@realtimex/piper-tts-web");
      if (TtsSession._instance?.voiceId !== voiceId) TtsSession._instance = null;
      const session = await TtsSession.create({
        voiceId,
        allowLocalModels: true,
        fallbackStrategy: "cdn",
        progress: ({ loaded, total }) => onProgress?.({ loaded, total }),
      });
      if (generation === this.generation && voiceId === this.preset.voiceId) {
        this.session = session;
      }
    })();

    try {
      await this.initializing;
    } finally {
      if (generation === this.generation) this.initializing = null;
    }
  }

  async synthesize(
    text: string,
    onProgress?: (progress: NeuralVoiceProgress) => void,
  ): Promise<Blob> {
    await this.prepare(onProgress);
    if (!this.session) throw new Error("Neural voice unavailable");
    return this.session.predict(text);
  }
}
