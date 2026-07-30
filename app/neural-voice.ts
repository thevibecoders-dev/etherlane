export type NeuralVoiceProgress = {
  loaded: number;
  total: number;
};

/**
 * Lazy, browser-only Piper voice.
 *
 * The neural model and phonemizer are loaded only after the listener explicitly
 * enables the voice channel. Piper keeps the reusable model on the listener's
 * device; signal phrases are passed through memory and are never persisted by
 * Etherlane.
 */
export class EtherlaneNeuralVoice {
  private session: import("@realtimex/piper-tts-web").TtsSession | null = null;
  private initializing: Promise<void> | null = null;
  private readonly voiceId = "en_US-hfc_female-medium";

  async prepare(onProgress?: (progress: NeuralVoiceProgress) => void) {
    if (this.session?.ready) return;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      const { TtsSession } = await import("@realtimex/piper-tts-web");
      this.session = await TtsSession.create({
        voiceId: this.voiceId,
        allowLocalModels: true,
        fallbackStrategy: "cdn",
        progress: ({ loaded, total }) => onProgress?.({ loaded, total }),
      });
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
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
