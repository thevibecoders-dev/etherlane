"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  binauralPresets,
  defaultSynthSettings,
  EtherlaneBinaural,
  EtherlaneSynth,
  EtherlaneVoiceSpace,
  rhythmPresets,
  type BinauralMode,
  type KickPulse,
  type KeyName,
  type Palette,
  type RhythmMode,
  type ScaleName,
  type SynthFrame,
  type SynthSettings,
} from "./synth-engine";
import {
  EtherlaneNeuralVoice,
  neuralVoicePresets,
  type NeuralVoiceName,
} from "./neural-voice";
import { ImmersiveFlowScene } from "./immersive-flow";
import { APP_VERSION } from "./app-version";

type SignalSource =
  | "RIS"
  | "ATLAS"
  | "WIKIMEDIA"
  | "GITHUB"
  | "HACKERNEWS"
  | "BLOCKCHAIN"
  | "INFRASTRUCTURE"
  | "SYNTHETIC";
type SignalTone = "violet" | "cyan" | "amber" | "coral";
type SignalShape = "beam" | "ring" | "packet" | "spark";
type VisualizationMode = "flow" | "neural" | "matrix";
type HealthState = "connecting" | "live" | "offline";
type VoiceEngine = "piper" | "device";
type VoiceDensity = "dream" | "full";
type SynthPatch = "ether-bloom" | "glass-orbit" | "choir-void" | "deep-rest" | "signal-storm";
type KickLightColor = "violet" | "cyan" | "amber" | "coral" | "white";

type AudienceSnapshot = {
  visitors: number;
  listeners: number;
  version: string;
};

type SignalEvent = {
  id: string;
  source: SignalSource;
  kind: string;
  label: string;
  detail: string;
  tone: SignalTone;
  magnitude: number;
  spoken: string;
  timestamp: number;
};

type Particle = {
  lane: number;
  depth: number;
  speed: number;
  tone: SignalTone;
  size: number;
  drift: number;
  shape: SignalShape;
  phase: number;
};

type Shockwave = {
  lane: number;
  depth: number;
  life: number;
  tone: SignalTone;
  energy: number;
  shape: SignalShape;
};

type VisualPacket = {
  tone: SignalTone;
  code: string;
  progress: number;
  speed: number;
  lane: number;
  from: number;
  to: number;
  route: number[];
};

type SourceHealth = {
  ris: HealthState;
  atlas: HealthState;
  wikimedia: HealthState;
  github: HealthState;
  hackernews: HealthState;
  blockchain: HealthState;
  infrastructure: HealthState;
};

type InfrastructureSnapshot = {
  state: "operational" | "degraded" | "outage" | "unknown";
  risk: number;
  monitorCoverage: string;
  root: {
    state: "operational" | "degraded" | "outage" | "unknown";
    resolvedIdentities: number;
    resolversResponding: number;
    dnssecValidated: boolean;
    operationalInstances: number | null;
    description: string;
  };
  services: Array<{
    name: string;
    state: "operational" | "degraded" | "outage" | "unknown";
    description: string;
    incidents: number;
  }>;
};

const sourceKeys: Array<keyof SourceHealth> = [
  "ris",
  "atlas",
  "wikimedia",
  "github",
  "hackernews",
  "blockchain",
  "infrastructure",
];

const visualizations: Array<{ value: VisualizationMode; label: string; hint: string }> = [
  { value: "flow", label: "FLOW", hint: "Signal highway" },
  { value: "neural", label: "NEURAL", hint: "Rotating global route field" },
  { value: "matrix", label: "MATRIX", hint: "Packet code rain" },
];

const tones: Record<SignalTone, { rgb: string; hex: string }> = {
  violet: { rgb: "151, 105, 255", hex: "#9769ff" },
  cyan: { rgb: "87, 228, 255", hex: "#57e4ff" },
  amber: { rgb: "255, 190, 91", hex: "#ffbe5b" },
  coral: { rgb: "255, 100, 105", hex: "#ff6469" },
};

const syntheticSignals = [
  ["ROUTE ANNOUNCED", "AS64512 → 198.51.100.0/24", "violet", "Route announced. I P version four. Six hops."],
  ["PING RETURNED", "41.8 ms · Europe", "cyan", "Ping returned. Forty two milliseconds."],
  ["PATH SHIFT", "6 autonomous systems traversed", "amber", "Path shifted. Six autonomous systems."],
  ["ROUTE WITHDRAWN", "203.0.113.0/24 disappeared", "coral", "Route withdrawn. I P version four."],
  ["PAGE EDITED", "enwiki · +418 bytes", "cyan", "Public page edited. English Wikipedia. Four hundred bytes added."],
  ["PEER STATE", "rrc21 · connected", "violet", "Routing peer connected."],
] as const;

const risKinds: Record<string, { kind: string; label: string; tone: SignalTone }> = {
  KEEPALIVE: {
    kind: "SESSION PULSE",
    label: "Two public routers kept their session alive",
    tone: "violet",
  },
  OPEN: {
    kind: "BGP SESSION OPEN",
    label: "A public routing session began",
    tone: "cyan",
  },
  NOTIFICATION: {
    kind: "BGP NOTIFICATION",
    label: "A public routing peer sent a notification",
    tone: "coral",
  },
  RIS_PEER_STATE: {
    kind: "PEER STATE",
    label: "A route collector observed a peer state change",
    tone: "amber",
  },
};

const githubKinds: Record<string, { kind: string; tone: SignalTone; spoken: string }> = {
  PushEvent: { kind: "CODE PUSHED", tone: "cyan", spoken: "Code pushed to the public network." },
  PullRequestEvent: { kind: "CHANGE PROPOSED", tone: "violet", spoken: "A public change was proposed." },
  IssuesEvent: { kind: "ISSUE MUTATION", tone: "amber", spoken: "A public issue changed state." },
  CreateEvent: { kind: "REFERENCE CREATED", tone: "violet", spoken: "A public code reference was created." },
  DeleteEvent: { kind: "REFERENCE DELETED", tone: "coral", spoken: "A public code reference was deleted." },
  ReleaseEvent: { kind: "RELEASE PUBLISHED", tone: "amber", spoken: "A public software release appeared." },
  ForkEvent: { kind: "CODE FORKED", tone: "cyan", spoken: "A public code tree branched." },
  WatchEvent: { kind: "PROJECT STARRED", tone: "violet", spoken: "A public project received attention." },
};

const paletteOptions: Array<{ value: Palette; label: string; hint: string }> = [
  { value: "strings", label: "STRINGS", hint: "Warm bowed ensemble" },
  { value: "glass", label: "GLASS", hint: "Soft triangular sheen" },
  { value: "choir", label: "CHOIR", hint: "Breathy vocal air" },
];

const scaleOptions: Array<{ value: ScaleName; label: string }> = [
  { value: "aeolian", label: "AEOLIAN" },
  { value: "dorian", label: "DORIAN" },
  { value: "lydian", label: "LYDIAN" },
  { value: "minor-pentatonic", label: "MINOR PENTA" },
  { value: "major-pentatonic", label: "MAJOR PENTA" },
];

const keyOptions: Array<{ value: KeyName; label: string }> = [
  { value: "C", label: "C" },
  { value: "D", label: "D" },
  { value: "E", label: "E" },
  { value: "F", label: "F" },
  { value: "G", label: "G" },
  { value: "A", label: "A" },
];

const kickLightColors: Array<{ value: KickLightColor; label: string }> = [
  { value: "violet", label: "VIOLET" },
  { value: "cyan", label: "CYAN" },
  { value: "amber", label: "AMBER" },
  { value: "coral", label: "CORAL" },
  { value: "white", label: "WHITE" },
];

const synthPatches: Array<{
  value: SynthPatch;
  label: string;
  hint: string;
  settings: SynthSettings;
}> = [
  {
    value: "ether-bloom",
    label: "ETHER BLOOM",
    hint: "Warm, wide and slowly opening",
    settings: { ...defaultSynthSettings, palette: "strings", key: "D", scale: "aeolian", space: 72, delay: 32, drift: 38 },
  },
  {
    value: "glass-orbit",
    label: "GLASS ORBIT",
    hint: "Bright suspended constellations",
    settings: { ...defaultSynthSettings, palette: "glass", key: "A", scale: "lydian", warmth: 68, shimmer: 76, space: 78, delay: 46 },
  },
  {
    value: "choir-void",
    label: "CHOIR VOID",
    hint: "Breathy voices in a deep hall",
    settings: { ...defaultSynthSettings, palette: "choir", key: "D", scale: "dorian", warmth: 46, shimmer: 58, space: 88, delay: 38 },
  },
  {
    value: "deep-rest",
    label: "DEEP REST",
    hint: "Dark, slow and meditation friendly",
    settings: { ...defaultSynthSettings, palette: "choir", key: "C", scale: "major-pentatonic", warmth: 32, shimmer: 28, drift: 16, space: 92, delay: 24, master: 58 },
  },
  {
    value: "signal-storm",
    label: "SIGNAL STORM",
    hint: "Restless routes and fractured light",
    settings: { ...defaultSynthSettings, palette: "strings", key: "E", scale: "minor-pentatonic", warmth: 74, shimmer: 72, drift: 82, space: 66, delay: 62, master: 68 },
  },
];

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function digits(value: unknown) {
  return String(value ?? "unknown")
    .replace(/[^0-9]/g, "")
    .split("")
    .join(" ");
}

function spokenPrefix(prefix: string) {
  const length = prefix.split("/")[1] ?? "unknown";
  return `${prefix.includes(":") ? "I P version six" : "I P version four"}, slash ${length}`;
}

function wikiName(value: unknown) {
  const wiki = String(value ?? "a public wiki").toLowerCase();
  if (wiki === "enwiki") return "English Wikipedia";
  if (wiki === "dewiki") return "German Wikipedia";
  if (wiki === "nlwiki") return "Dutch Wikipedia";
  if (wiki.endsWith("wiki")) return `${wiki.slice(0, -4).toUpperCase()} Wikipedia`;
  return "a public Wikimedia project";
}

function shapeFor(kind: string): SignalShape {
  if (/PING|PULSE|KEEPALIVE/.test(kind)) return "ring";
  if (/PAGE|CATEGORY|LOG|LINK|CODE|ITEM|TRANSACTION|RELEASE/.test(kind)) return "packet";
  if (/WITHDRAWN|NOTIFICATION|STATE|DELETED|LOSS|OUTAGE|DEGRADED|ROOT/.test(kind)) return "spark";
  return "beam";
}

function packetCode(event: Pick<SignalEvent, "source" | "kind" | "magnitude">) {
  const source = event.source.slice(0, 3).padEnd(3, "0");
  const kind = event.kind.replace(/[^A-Z0-9]/g, "_").slice(0, 12);
  const magnitude = Math.round(event.magnitude).toString(16).toUpperCase().padStart(2, "0");
  const binary = (event.kind.length * 17 + Math.round(event.magnitude))
    .toString(2)
    .slice(-8)
    .padStart(8, "0");
  return `${source}:${kind} 0x${magnitude} ${binary}`;
}

function voiceQualityScore(voice: SpeechSynthesisVoice) {
  const name = voice.name.toLowerCase();
  let score = voice.localService ? 100 : 0;
  if (/^en[-_]/i.test(voice.lang)) score += 35;
  if (/natural|neural|enhanced|premium|studio/.test(name)) score += 70;
  if (/ava|emma|andrew|brian|aria|guy|jenny|sonia|ryan/.test(name)) score += 24;
  if (/compact|espeak|festival/.test(name)) score -= 45;
  return score;
}

function dreamPhraseFor(event: SignalEvent) {
  const explicit: Array<[RegExp, string]> = [
    [/OUTAGE|NOTIFICATION/, "signal fracture"],
    [/WITHDRAWN|DELETED|REMOVED/, "path fading"],
    [/ROOT/, "deep roots shifting"],
    [/PING|LATENCY/, "distant echo"],
    [/ROUTE|PATH|PEER|SESSION/, "new paths"],
    [/PAGE|KNOWLEDGE/, "knowledge blooming"],
    [/CODE|RELEASE|REFERENCE/, "code awakening"],
    [/THREAD|CONVERSATION|ITEM/, "voices gathering"],
    [/BLOCK|TRANSACTION|LEDGER/, "the ledger turns"],
    [/NOMINAL|OPERATIONAL/, "all is flowing"],
  ];
  const matched = explicit.find(([pattern]) => pattern.test(event.kind));
  const pools: Record<SignalSource, string[]> = {
    RIS: ["routes breathing", "a path opens", "distant crossings"],
    ATLAS: ["soft return", "across the distance", "echo received"],
    WIKIMEDIA: ["memory growing", "words become light", "knowledge drifting"],
    GITHUB: ["code in motion", "a branch unfolds", "new shapes"],
    HACKERNEWS: ["voices in the wire", "ideas gathering", "the network wonders"],
    BLOCKCHAIN: ["the ledger turns", "another block", "time recorded"],
    INFRASTRUCTURE: ["the core is listening", "deep network pulse", "roots holding"],
    SYNTHETIC: ["between signals", "soft static", "the ether dreams"],
  };
  const options = pools[event.source];
  const seed =
    event.kind.length * 31 +
    Math.round(event.magnitude) * 17 +
    Math.floor(event.timestamp / 1000);
  const beginnings = [
    "listen",
    "slowly",
    "beneath the noise",
    "inside the current",
    "across the ether",
    "somewhere in the flow",
    "between one pulse and the next",
  ];
  const endings = [
    "opening into distance",
    "drifting without edges",
    "returning as light",
    "moving through the dark",
    "becoming another path",
    "still changing",
    "and dissolving again",
  ];
  const core = matched?.[1] ?? options[Math.abs(seed) % options.length];
  return `${beginnings[Math.abs(seed >>> 2) % beginnings.length]}... ${core}... ${
    endings[Math.abs(seed >>> 5) % endings.length]
  }`;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const kickLightRef = useRef<HTMLDivElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const visualPacketsRef = useRef<VisualPacket[]>([]);
  const visualizationRef = useRef<VisualizationMode>("flow");
  const infrastructureRiskRef = useRef(0);
  const infrastructureSignatureRef = useRef("");
  const synthRef = useRef<EtherlaneSynth | null>(null);
  const binauralRef = useRef<EtherlaneBinaural | null>(null);
  const voiceSpaceRef = useRef<EtherlaneVoiceSpace | null>(null);
  const neuralVoiceRef = useRef<EtherlaneNeuralVoice | null>(null);
  const localVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const selectedVoiceRef = useRef("");
  const lastVoiceRef = useRef(0);
  const pausedRef = useRef(false);
  const audioEnabledRef = useRef(false);
  const audienceSessionRef = useRef("");
  const audienceListeningRef = useRef(false);
  const voiceEngineRef = useRef<VoiceEngine>("piper");
  const neuralVoiceNameRef = useRef<NeuralVoiceName>("hfc-female");
  const voiceDensityRef = useRef<VoiceDensity>("dream");
  const voiceBusyRef = useRef(false);
  const intensityRef = useRef(0.72);
  const voiceSpaceAmountRef = useRef(48);
  const kickLightEnabledRef = useRef(true);
  const sourceEmitRef = useRef({
    ris: 0,
    atlas: 0,
    wikimedia: 0,
    github: 0,
    hackernews: 0,
    blockchain: 0,
    infrastructure: 0,
  });

  const [events, setEvents] = useState<SignalEvent[]>([]);
  const [sourceHealth, setSourceHealth] = useState<SourceHealth>({
    ris: "connecting",
    atlas: "connecting",
    wikimedia: "connecting",
    github: "connecting",
    hackernews: "connecting",
    blockchain: "connecting",
    infrastructure: "connecting",
  });
  const [infrastructure, setInfrastructure] = useState<InfrastructureSnapshot>({
    state: "unknown",
    risk: 0,
    monitorCoverage: "0/5",
    root: {
      state: "unknown",
      resolvedIdentities: 0,
      resolversResponding: 0,
      dnssecValidated: false,
      operationalInstances: null,
      description: "Acquiring root status",
    },
    services: [
      { name: "Cloudflare", state: "unknown", description: "Acquiring status", incidents: 0 },
      { name: "GitHub", state: "unknown", description: "Acquiring status", incidents: 0 },
      { name: "Fastly", state: "unknown", description: "Acquiring status", incidents: 0 },
      { name: "Google Cloud", state: "unknown", description: "Acquiring status", incidents: 0 },
    ],
  });
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [localVoices, setLocalVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState("");
  const [voiceSpace, setVoiceSpace] = useState(48);
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngine>("piper");
  const [neuralVoiceName, setNeuralVoiceName] =
    useState<NeuralVoiceName>("hfc-female");
  const [voiceDensity, setVoiceDensity] = useState<VoiceDensity>("dream");
  const [neuralVoiceStatus, setNeuralVoiceStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [neuralVoiceProgress, setNeuralVoiceProgress] = useState(0);
  const [binauralEnabled, setBinauralEnabled] = useState(false);
  const [binauralMode, setBinauralMode] = useState<BinauralMode>("theta");
  const [rhythmMode, setRhythmMode] = useState<RhythmMode>("ambient");
  const [kickLightEnabled, setKickLightEnabled] = useState(true);
  const [kickLightColor, setKickLightColor] = useState<KickLightColor>("violet");
  const [selectedPatch, setSelectedPatch] = useState<SynthPatch | "custom">("ether-bloom");
  const [spokenPhrase, setSpokenPhrase] = useState("VOICE CHANNEL STANDBY");
  const [synthSettings, setSynthSettings] = useState<SynthSettings>(defaultSynthSettings);
  const [synthFrame, setSynthFrame] = useState<SynthFrame>({
    chord: "—",
    note: "—",
    source: "SYNTHETIC",
    energy: 0,
    voices: 0,
    rhythm: "ambient",
    bpm: 0,
    modulation: {
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
    },
  });
  const [paused, setPaused] = useState(false);
  const [intensity, setIntensity] = useState(72);
  const [signalCount, setSignalCount] = useState(0);
  const [selected, setSelected] = useState<SignalEvent | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showSynth, setShowSynth] = useState(false);
  const [visualization, setVisualization] = useState<VisualizationMode>("flow");
  const [audience, setAudience] = useState<AudienceSnapshot>({
    visitors: 1,
    listeners: 0,
    version: APP_VERSION,
  });

  const synchronizeAudience = useCallback(async () => {
    if (!audienceSessionRef.current) audienceSessionRef.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/audience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: audienceSessionRef.current,
          listening: audienceListeningRef.current,
        }),
        cache: "no-store",
      });
      if (!response.ok) return;
      const snapshot = (await response.json()) as AudienceSnapshot;
      setAudience(snapshot);
    } catch {
      // Audience telemetry is decorative and never interrupts the experience.
    }
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    visualizationRef.current = visualization;
  }, [visualization]);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    audienceListeningRef.current = audioEnabled || musicEnabled || binauralEnabled;
    void synchronizeAudience();
  }, [audioEnabled, binauralEnabled, musicEnabled, synchronizeAudience]);

  useEffect(() => {
    void synchronizeAudience();
    const heartbeat = window.setInterval(() => {
      void synchronizeAudience();
    }, 15_000);
    const refresh = () => {
      if (document.visibilityState === "visible") void synchronizeAudience();
    };
    const leave = () => {
      if (!audienceSessionRef.current) return;
      void fetch("/api/audience", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: audienceSessionRef.current }),
        keepalive: true,
      });
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pagehide", leave);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [synchronizeAudience]);

  useEffect(() => {
    voiceEngineRef.current = voiceEngine;
  }, [voiceEngine]);

  useEffect(() => {
    voiceDensityRef.current = voiceDensity;
  }, [voiceDensity]);

  useEffect(() => {
    intensityRef.current = intensity / 100;
    synthRef.current?.setIntensity(intensity / 100);
  }, [intensity]);

  useEffect(() => {
    voiceSpaceAmountRef.current = voiceSpace;
  }, [voiceSpace]);

  useEffect(() => {
    synthRef.current?.setSettings(synthSettings);
  }, [synthSettings]);

  useEffect(() => {
    kickLightEnabledRef.current = kickLightEnabled;
  }, [kickLightEnabled]);

  useEffect(() => {
    const live = sourceKeys.filter((source) => sourceHealth[source] === "live").length;
    synthRef.current?.setHealth(live);
  }, [sourceHealth]);

  useEffect(
    () => () => {
      synthRef.current?.dispose();
      binauralRef.current?.dispose();
      voiceSpaceRef.current?.dispose();
    },
    [],
  );

  useEffect(() => {
    const synchronizeVoices = () => {
      const voices = window.speechSynthesis?.getVoices() ?? [];
      const local = voices
        .filter((voice) => voice.localService)
        .sort((left, right) => voiceQualityScore(right) - voiceQualityScore(left));
      const selected =
        local.find((voice) => voice.voiceURI === selectedVoiceRef.current) ??
        local.find((voice) => /^en[-_]/i.test(voice.lang)) ??
        local[0] ??
        null;
      localVoiceRef.current = selected;
      selectedVoiceRef.current = selected?.voiceURI ?? "";
      setSelectedVoiceUri(selected?.voiceURI ?? "");
      setLocalVoices(local);
      setVoiceAvailable(Boolean(selected));
    };

    synchronizeVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", synchronizeVoices);
    return () => {
      window.speechSynthesis?.removeEventListener("voiceschanged", synchronizeVoices);
      window.speechSynthesis?.cancel();
    };
  }, []);

  const prepareNeuralVoice = useCallback(async () => {
    if (!neuralVoiceRef.current) {
      neuralVoiceRef.current = new EtherlaneNeuralVoice(neuralVoiceNameRef.current);
    }
    setNeuralVoiceStatus("loading");
    await neuralVoiceRef.current.prepare(({ loaded, total }) => {
      if (total > 0) setNeuralVoiceProgress(Math.round((loaded / total) * 100));
    });
    setNeuralVoiceProgress(100);
    setNeuralVoiceStatus("ready");
  }, []);

  const speakSignal = useCallback(async (event: SignalEvent) => {
    if (!audioEnabledRef.current || voiceBusyRef.current) return;
    if (
      voiceEngineRef.current === "device" &&
      (!localVoiceRef.current || !window.speechSynthesis)
    ) {
      return;
    }
    const nowMs = performance.now();
    const cadence =
      voiceDensityRef.current === "dream"
        ? 10400 - intensityRef.current * 2700 + (event.kind.length % 5) * 620
        : 2300 - intensityRef.current * 900;
    if (
      nowMs - lastVoiceRef.current < cadence ||
      (voiceEngineRef.current === "device" && window.speechSynthesis.speaking)
    ) {
      return;
    }
    lastVoiceRef.current = nowMs;
    const phrase = voiceDensityRef.current === "dream" ? dreamPhraseFor(event) : event.spoken;
    setSpokenPhrase(phrase.toUpperCase());

    if (voiceEngineRef.current === "piper") {
      voiceBusyRef.current = true;
      try {
        await prepareNeuralVoice();
        const blob = await neuralVoiceRef.current!.synthesize(phrase, ({ loaded, total }) => {
          if (total > 0) setNeuralVoiceProgress(Math.round((loaded / total) * 100));
        });
        if (!audioEnabledRef.current) return;
        if (!voiceSpaceRef.current) voiceSpaceRef.current = new EtherlaneVoiceSpace();
        await voiceSpaceRef.current.playBlob(
          blob,
          event.tone,
          event.magnitude,
          voiceSpaceAmountRef.current,
          neuralVoicePresets[neuralVoiceNameRef.current],
        );
      } catch {
        setNeuralVoiceStatus("error");
      } finally {
        voiceBusyRef.current = false;
      }
      return;
    }

    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.voice = localVoiceRef.current;
    utterance.lang = localVoiceRef.current?.lang ?? "en-US";
    utterance.rate =
      voiceDensityRef.current === "dream"
        ? 0.68 + clamp(event.magnitude / 100, 0, 1) * 0.12
        : 0.82 + clamp(event.magnitude / 100, 0, 1) * 0.22;
    utterance.pitch = 1;
    utterance.volume = 0.42 + intensityRef.current * 0.48;
    voiceSpaceRef.current?.playTexture(event.tone, event.magnitude, voiceSpaceAmountRef.current);
    window.speechSynthesis.speak(utterance);
  }, [prepareNeuralVoice]);

  const emitSignal = useCallback(
    (event: Omit<SignalEvent, "id" | "timestamp">) => {
      if (pausedRef.current) return;
      const complete: SignalEvent = {
        ...event,
        id: `${event.source}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: Date.now(),
      };

      setEvents((current) => [complete, ...current].slice(0, 18));
      setSignalCount((current) => current + 1);

      const compact = window.matchMedia("(max-width: 720px)").matches;
      const particleBurst = compact ? 1 + Math.round(event.magnitude / 45) : 2 + Math.round(event.magnitude / 22);
      const shape = shapeFor(event.kind);
      for (let index = 0; index < particleBurst; index += 1) {
        particlesRef.current.push({
          lane:
            shape === "packet"
              ? (index % 2 ? -1 : 1) * (0.18 + Math.random() * 0.65)
              : (Math.random() - 0.5) * 1.7,
          depth: Math.random() * 0.1,
          speed: 0.0026 + Math.random() * 0.004 + event.magnitude / 42000,
          tone: event.tone,
          size: 0.65 + Math.random() * 1.45,
          drift: (Math.random() - 0.5) * 0.001,
          shape,
          phase: Math.random() * Math.PI * 2,
        });
      }
      particlesRef.current = particlesRef.current.slice(compact ? -76 : -320);
      shockwavesRef.current.push({
        lane: (Math.random() - 0.5) * 0.78,
        depth: 0.05 + Math.random() * 0.18,
        life: 1,
        tone: event.tone,
        energy: event.magnitude,
        shape,
      });
      shockwavesRef.current = shockwavesRef.current.slice(compact ? -8 : -28);
      const nodeCount = compact ? 18 : 34;
      const packetCopies =
        event.source === "INFRASTRUCTURE" && event.magnitude >= 70 ? (compact ? 5 : 11) : 1;
      for (let copy = 0; copy < packetCopies; copy += 1) {
        const routeLength = 3 + Math.floor(Math.random() * (compact ? 2 : 4));
        const route: number[] = [];
        while (route.length < routeLength) {
          const next = Math.floor(Math.random() * nodeCount);
          if (!route.includes(next)) route.push(next);
        }
        visualPacketsRef.current.push({
          tone: event.source === "INFRASTRUCTURE" && event.magnitude >= 70 ? "coral" : event.tone,
          code: packetCode(complete),
          progress: copy * -0.055,
          speed: compact ? 0.012 : 0.008 + event.magnitude / 22000,
          lane: (Math.random() - 0.5) * 1.7,
          from: route[0],
          to: route.at(-1) ?? route[0],
          route,
        });
      }
      visualPacketsRef.current = visualPacketsRef.current.slice(compact ? -18 : -42);
      synthRef.current?.push(complete);
      void speakSignal(complete);
    },
    [speakSignal],
  );

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;

    const pollInfrastructure = async () => {
      try {
        const response = await fetch("/api/infrastructure", { cache: "no-store" });
        if (!response.ok) throw new Error("monitor unavailable");
        const snapshot = (await response.json()) as InfrastructureSnapshot;
        if (disposed) return;
        setInfrastructure(snapshot);
        infrastructureRiskRef.current = snapshot.risk;
        setSourceHealth((current) => ({ ...current, infrastructure: "live" }));

        const signature = [
          snapshot.state,
          snapshot.root.state,
          ...snapshot.services.map((service) => `${service.name}:${service.state}:${service.incidents}`),
        ].join("|");
        if (signature !== infrastructureSignatureRef.current) {
          infrastructureSignatureRef.current = signature;
          const affected = snapshot.services.filter(
            (service) => service.state === "outage" || service.state === "degraded",
          );
          const outage = snapshot.state === "outage";
          const rootShift = snapshot.root.state === "outage" || snapshot.root.state === "degraded";
          emitSignal({
            source: "INFRASTRUCTURE",
            kind: outage
              ? "CORE SERVICE OUTAGE"
              : rootShift
                ? "ROOT CONSENSUS SHIFT"
                : affected.length
                  ? "INFRASTRUCTURE DEGRADED"
                  : "CORE NODES NOMINAL",
            label: outage
              ? "A major internet service reports disruption"
              : rootShift
                ? "Public root-system observations diverged"
                : affected.length
                  ? "Important internet infrastructure reports degradation"
                  : "Root DNS and monitored core services report normal operation",
            detail: affected.length
              ? affected.map((service) => `${service.name}: ${service.description}`).join(" · ")
              : `${snapshot.root.resolvedIdentities}/13 roots · ${snapshot.monitorCoverage} monitors`,
            tone: outage ? "coral" : affected.length || rootShift ? "amber" : "cyan",
            magnitude: outage ? Math.max(82, snapshot.risk) : Math.max(24, snapshot.risk),
            spoken: outage
              ? `Core service outage. ${affected.map((service) => service.name).join(" and ")} reporting disruption.`
              : rootShift
                ? "Root system observation changed."
                : affected.length
                  ? `Infrastructure degraded. ${affected.map((service) => service.name).join(" and ")}.`
                  : "Core nodes nominal. Root system operational.",
          });
        }
      } catch {
        if (disposed) return;
        infrastructureRiskRef.current = 0;
        setInfrastructure((current) => ({ ...current, state: "unknown", risk: 0 }));
        setSourceHealth((current) => ({ ...current, infrastructure: "offline" }));
      }
      if (!disposed) timer = window.setTimeout(pollInfrastructure, 55_000);
    };

    void pollInfrastructure();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [emitSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let devicePixelRatio = 1;
    let compact = window.matchMedia("(max-width: 720px)").matches;
    let lastFrame = 0;
    const globeHubs = [
      { name: "SAN FRANCISCO", lat: 37.77, lon: -122.42 },
      { name: "NEW YORK", lat: 40.71, lon: -74.01 },
      { name: "TORONTO", lat: 43.65, lon: -79.38 },
      { name: "SAO PAULO", lat: -23.55, lon: -46.63 },
      { name: "LONDON", lat: 51.51, lon: -0.13 },
      { name: "AMSTERDAM", lat: 52.37, lon: 4.9 },
      { name: "FRANKFURT", lat: 50.11, lon: 8.68 },
      { name: "STOCKHOLM", lat: 59.33, lon: 18.07 },
      { name: "MADRID", lat: 40.42, lon: -3.7 },
      { name: "LAGOS", lat: 6.52, lon: 3.38 },
      { name: "CAPE TOWN", lat: -33.92, lon: 18.42 },
      { name: "CAIRO", lat: 30.04, lon: 31.24 },
      { name: "NAIROBI", lat: -1.29, lon: 36.82 },
      { name: "DUBAI", lat: 25.2, lon: 55.27 },
      { name: "MUMBAI", lat: 19.08, lon: 72.88 },
      { name: "SINGAPORE", lat: 1.35, lon: 103.82 },
      { name: "HONG KONG", lat: 22.32, lon: 114.17 },
      { name: "TOKYO", lat: 35.68, lon: 139.69 },
      { name: "SEOUL", lat: 37.57, lon: 126.98 },
      { name: "SYDNEY", lat: -33.87, lon: 151.21 },
    ] as const;
    const globeLinks = [
      [0, 1], [0, 17], [0, 19], [1, 2], [1, 3], [1, 4], [2, 4], [3, 8],
      [4, 5], [4, 7], [4, 11], [5, 6], [5, 15], [6, 8], [6, 13], [7, 18],
      [8, 9], [9, 10], [9, 11], [9, 12], [11, 13], [12, 14], [13, 14],
      [13, 15], [14, 15], [15, 16], [15, 19], [16, 17], [16, 18], [17, 18],
      [17, 19],
    ] as const;
    const continentPaths: Array<Array<[number, number]>> = [
      [[71, -165], [62, -145], [58, -127], [50, -124], [43, -117], [32, -115], [25, -105], [19, -98], [24, -82], [31, -81], [41, -70], [50, -60], [58, -66], [64, -78], [71, -105], [71, -165]],
      [[12, -81], [4, -77], [-7, -78], [-18, -70], [-31, -71], [-54, -68], [-50, -55], [-35, -52], [-22, -44], [-8, -35], [4, -51], [12, -64], [12, -81]],
      [[36, -10], [44, -9], [51, 1], [58, 8], [65, 25], [71, 45], [67, 75], [58, 95], [52, 120], [44, 141], [34, 135], [27, 120], [20, 108], [9, 105], [7, 80], [22, 69], [31, 55], [38, 42], [42, 28], [36, 20], [36, -10]],
      [[36, -10], [31, 10], [20, 15], [8, 10], [-5, 12], [-18, 20], [-35, 18], [-35, 32], [-20, 42], [-5, 51], [12, 44], [28, 33], [36, 20], [36, -10]],
      [[-11, 113], [-20, 115], [-35, 116], [-43, 146], [-28, 154], [-12, 143], [-11, 113]],
      [[60, -52], [72, -42], [80, -20], [71, -17], [60, -35], [60, -52]],
    ];

    for (let index = 0; index < (compact ? 24 : 74); index += 1) {
      particlesRef.current.push({
        lane: (Math.random() - 0.5) * 1.9,
        depth: Math.random(),
        speed: 0.0015 + Math.random() * 0.003,
        tone: (["violet", "cyan", "amber"] as SignalTone[])[index % 3],
        size: 0.5 + Math.random() * 1.2,
        drift: (Math.random() - 0.5) * 0.0006,
        shape: (["beam", "ring", "packet"] as SignalShape[])[index % 3],
        phase: Math.random() * Math.PI * 2,
      });
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      compact = window.matchMedia("(max-width: 720px)").matches;
      devicePixelRatio = compact ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = width * devicePixelRatio;
      canvas.height = height * devicePixelRatio;
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const project = (lane: number, depth: number) => {
      const time = Date.now() * 0.001;
      const horizonY = height * (0.405 + Math.sin(time * 0.17) * 0.006);
      const perspective = Math.pow(depth, 1.7);
      return {
        x: width / 2 + lane * perspective * width * 0.48,
        y: horizonY + perspective * height * 0.66,
        scale: 0.16 + perspective * 1.7,
      };
    };

    const drawNeural = (time: number) => {
      const risk = infrastructureRiskRef.current;
      const rotation = (time * (compact ? 0.055 : 0.072)) % (Math.PI * 2);
      const centerX = width * (compact ? 0.5 : 0.52);
      const centerY = height * (compact ? 0.48 : 0.51);
      const radius = Math.min(width * (compact ? 0.4 : 0.31), height * (compact ? 0.3 : 0.37));
      const tilt = -0.13;

      const projectGlobePoint = (lat: number, lon: number) => {
        const latitude = lat * Math.PI / 180;
        const longitude = lon * Math.PI / 180 + rotation;
        const cosLatitude = Math.cos(latitude);
        const sphereX = cosLatitude * Math.sin(longitude);
        const sphereY = -Math.sin(latitude);
        const sphereZ = cosLatitude * Math.cos(longitude);
        const tiltedY = sphereY * Math.cos(tilt) - sphereZ * Math.sin(tilt);
        const depth = sphereY * Math.sin(tilt) + sphereZ * Math.cos(tilt);
        return {
          x: centerX + sphereX * radius,
          y: centerY + tiltedY * radius,
          depth,
        };
      };

      const quadraticPoint = (
        start: { x: number; y: number },
        control: { x: number; y: number },
        end: { x: number; y: number },
        progress: number,
      ) => {
        const inverse = 1 - progress;
        return {
          x: inverse * inverse * start.x + 2 * inverse * progress * control.x + progress * progress * end.x,
          y: inverse * inverse * start.y + 2 * inverse * progress * control.y + progress * progress * end.y,
        };
      };

      const routeGeometry = (
        start: { x: number; y: number },
        end: { x: number; y: number },
        lift: number,
      ) => {
        const middleX = (start.x + end.x) / 2;
        const middleY = (start.y + end.y) / 2;
        const vectorX = middleX - centerX;
        const vectorY = middleY - centerY;
        const length = Math.max(1, Math.hypot(vectorX, vectorY));
        return {
          start,
          end,
          control: {
            x: middleX + vectorX / length * lift,
            y: middleY + vectorY / length * lift,
          },
        };
      };

      const drawSpherePath = (
        points: Array<[number, number]>,
        color: string,
        lineWidth: number,
      ) => {
        let drawing = false;
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.beginPath();
        for (const [lat, lon] of points) {
          const point = projectGlobePoint(lat, lon);
          if (point.depth < -0.12) {
            drawing = false;
            continue;
          }
          if (!drawing) {
            context.moveTo(point.x, point.y);
            drawing = true;
          } else {
            context.lineTo(point.x, point.y);
          }
        }
        context.stroke();
      };

      context.fillStyle = risk >= 65 ? "rgba(14,1,7,.34)" : "rgba(2,4,10,.36)";
      context.fillRect(0, 0, width, height);
      context.save();
      context.globalCompositeOperation = "screen";

      const fieldGlow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.48);
      fieldGlow.addColorStop(0, risk >= 70 ? "rgba(255,61,82,.18)" : "rgba(51,162,255,.2)");
      fieldGlow.addColorStop(0.54, "rgba(91,77,255,.065)");
      fieldGlow.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = fieldGlow;
      context.fillRect(centerX - radius * 1.55, centerY - radius * 1.55, radius * 3.1, radius * 3.1);

      const globeFill = context.createRadialGradient(
        centerX - radius * 0.28,
        centerY - radius * 0.32,
        radius * 0.05,
        centerX,
        centerY,
        radius,
      );
      globeFill.addColorStop(0, "rgba(87,228,255,.09)");
      globeFill.addColorStop(0.68, "rgba(65,80,210,.035)");
      globeFill.addColorStop(1, "rgba(2,4,14,.01)");
      context.fillStyle = globeFill;
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fill();

      const latitudeLines = compact ? [-60, -30, 0, 30, 60] : [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75];
      for (const latitude of latitudeLines) {
        const points = Array.from({ length: compact ? 37 : 73 }, (_, index) => [
          latitude,
          -180 + index * (compact ? 10 : 5),
        ] as [number, number]);
        drawSpherePath(points, risk >= 70 ? "rgba(255,100,105,.11)" : "rgba(87,228,255,.105)", 0.5);
      }
      const longitudeStep = compact ? 30 : 20;
      for (let longitude = -180; longitude < 180; longitude += longitudeStep) {
        const points = Array.from({ length: compact ? 19 : 37 }, (_, index) => [
          -90 + index * (compact ? 10 : 5),
          longitude,
        ] as [number, number]);
        drawSpherePath(points, "rgba(151,105,255,.09)", 0.5);
      }

      for (const continent of continentPaths) {
        drawSpherePath(
          continent,
          risk >= 70 ? "rgba(255,120,126,.52)" : "rgba(142,235,255,.48)",
          compact ? 0.8 : 1.05,
        );
      }

      context.strokeStyle = risk >= 70 ? "rgba(255,100,105,.52)" : "rgba(112,224,255,.46)";
      context.lineWidth = compact ? 0.8 : 1.15;
      context.shadowColor = risk >= 70 ? "#ff6469" : "#57e4ff";
      context.shadowBlur = compact ? 0 : 18;
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.stroke();
      context.shadowBlur = 0;

      const projectedHubs = globeHubs.map((hub) => ({ ...hub, ...projectGlobePoint(hub.lat, hub.lon) }));
      for (let linkIndex = 0; linkIndex < globeLinks.length; linkIndex += 1) {
        const [fromIndex, toIndex] = globeLinks[linkIndex];
        const start = projectedHubs[fromIndex];
        const end = projectedHubs[toIndex];
        if (start.depth < -0.08 || end.depth < -0.08) continue;
        const distance = Math.hypot(end.x - start.x, end.y - start.y);
        const route = routeGeometry(start, end, radius * 0.08 + distance * 0.18);
        const alpha = 0.1 + Math.min(start.depth, end.depth) * 0.17;
        context.strokeStyle = risk >= 70 && linkIndex % 3 !== 0
          ? `rgba(255,100,105,${alpha})`
          : `rgba(87,228,255,${alpha})`;
        context.lineWidth = compact ? 0.55 : 0.7;
        context.beginPath();
        context.moveTo(route.start.x, route.start.y);
        context.quadraticCurveTo(route.control.x, route.control.y, route.end.x, route.end.y);
        context.stroke();

        if (!compact || linkIndex % 2 === 0) {
          const transmission = (time * (0.09 + (linkIndex % 4) * 0.012) + linkIndex * 0.071) % 1;
          const pulse = quadraticPoint(route.start, route.control, route.end, transmission);
          context.fillStyle = linkIndex % 5 === 0 ? "rgba(255,204,112,.84)" : "rgba(141,241,255,.82)";
          context.beginPath();
          context.arc(pulse.x, pulse.y, compact ? 0.9 : 1.35, 0, Math.PI * 2);
          context.fill();
        }
      }

      projectedHubs.forEach((hub, index) => {
        if (hub.depth < -0.12) return;
        const pulse = 0.58 + Math.sin(time * 1.25 + index * 1.7) * 0.28;
        const radiusScale = compact ? 1.2 : 1.5 + Math.max(0, hub.depth) * 1.7;
        context.fillStyle = risk >= 70 && index % 3 !== 0
          ? `rgba(255,100,105,${pulse})`
          : index % 4 === 0
            ? `rgba(255,190,91,${pulse})`
            : `rgba(126,238,255,${pulse})`;
        context.beginPath();
        context.arc(hub.x, hub.y, radiusScale, 0, Math.PI * 2);
        context.fill();
      });

      for (const packet of visualPacketsRef.current) {
        if (!pausedRef.current) packet.progress += packet.speed * 0.56;
        if (packet.progress > 1.04) packet.progress = -0.06;
        if (packet.progress < 0) continue;
        const fromIndex = packet.from % globeHubs.length;
        let toIndex = packet.to % globeHubs.length;
        if (toIndex === fromIndex) toIndex = (toIndex + 7) % globeHubs.length;
        const start = projectedHubs[fromIndex];
        const end = projectedHubs[toIndex];
        if (start.depth < -0.08 || end.depth < -0.08) continue;
        const distance = Math.hypot(end.x - start.x, end.y - start.y);
        const route = routeGeometry(start, end, radius * 0.12 + distance * 0.22);
        const color = tones[packet.tone];
        context.strokeStyle = `rgba(${color.rgb},${packet.tone === "coral" ? 0.72 : 0.46})`;
        context.lineWidth = packet.tone === "coral" ? 1.45 : 0.9;
        context.beginPath();
        context.moveTo(route.start.x, route.start.y);
        context.quadraticCurveTo(route.control.x, route.control.y, route.end.x, route.end.y);
        context.stroke();

        for (let trail = 4; trail >= 0; trail -= 1) {
          const trailProgress = clamp(packet.progress - trail * 0.018, 0, 1);
          const pulse = quadraticPoint(route.start, route.control, route.end, trailProgress);
          context.fillStyle = `rgba(${color.rgb},${0.18 + (4 - trail) * 0.18})`;
          context.beginPath();
          context.arc(pulse.x, pulse.y, compact ? 1.2 : 1.25 + (4 - trail) * 0.42, 0, Math.PI * 2);
          context.fill();
        }
        if (!compact && visualPacketsRef.current.indexOf(packet) >= visualPacketsRef.current.length - 6) {
          const labelPoint = quadraticPoint(route.start, route.control, route.end, clamp(packet.progress, 0, 1));
          context.font = "8px monospace";
          context.fillStyle = `rgba(${color.rgb},.68)`;
          context.fillText(packet.code, labelPoint.x + 9, labelPoint.y - 7);
        }
      }

      context.restore();
    };

    const drawMatrix = (time: number) => {
      const risk = infrastructureRiskRef.current;
      context.fillStyle = risk >= 70 ? "rgba(18, 1, 5, 0.22)" : "rgba(2, 4, 7, 0.24)";
      context.fillRect(0, 0, width, height);
      context.save();
      context.font = `${compact ? 8 : 10}px monospace`;
      context.textBaseline = "middle";
      const columnCount = compact ? 9 : 18;
      for (let column = 0; column < columnCount; column += 1) {
        const x = ((column + 0.5) / columnCount) * width;
        const y = ((time * (18 + (column % 5) * 4) + column * 67) % (height + 80)) - 40;
        context.fillStyle =
          risk >= 70 && column % 2 === 0
            ? "rgba(255,100,105,.3)"
            : column % 3 === 0
              ? "rgba(151,105,255,.2)"
              : "rgba(87,228,255,.16)";
        context.fillText(`${(column * 73).toString(16).padStart(3, "0")} 01`, x, y);
      }
      for (const packet of visualPacketsRef.current) {
        if (!pausedRef.current) packet.progress += packet.speed * 0.62;
        const x = ((packet.from % columnCount) + 0.45) / columnCount * width;
        const y = packet.progress * (height + 90) - 30;
        const color = tones[packet.tone];
        context.fillStyle = `rgba(${color.rgb}, .92)`;
        context.fillText(packet.code, x, y);
        context.fillStyle = `rgba(${color.rgb}, .24)`;
        context.fillText("10110100 01101001", x, y - 15);
        context.fillText("00101101 11000010", x, y - 30);
      }
      visualPacketsRef.current = visualPacketsRef.current.filter((packet) => packet.progress <= 1.08);
      context.restore();
    };

    const draw = (frameTime = 0) => {
      animationFrame = requestAnimationFrame(draw);
      if (document.hidden) return;
      const frameInterval = compact ? 1000 / 24 : 1000 / 60;
      if (frameTime - lastFrame < frameInterval) return;
      lastFrame = frameTime;
      const time = Date.now() * 0.001;
      if (visualizationRef.current === "neural") {
        drawNeural(time);
        return;
      }
      if (visualizationRef.current === "matrix") {
        drawMatrix(time);
        return;
      }
      if (visualizationRef.current === "flow") {
        context.clearRect(0, 0, width, height);
        return;
      }
      context.clearRect(0, 0, width, height);
      const infrastructureRisk = infrastructureRiskRef.current;
      const horizonY = height * (0.405 + Math.sin(time * 0.17) * 0.006);

      const glow = context.createRadialGradient(
        width / 2,
        horizonY,
        0,
        width / 2,
        horizonY,
        width * 0.55,
      );
      glow.addColorStop(0, "rgba(124, 85, 255, .24)");
      glow.addColorStop(0.28, "rgba(56, 214, 255, .055)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      if (infrastructureRisk >= 45) {
        const distress = context.createRadialGradient(
          width * 0.5,
          horizonY,
          0,
          width * 0.5,
          horizonY,
          width * 0.72,
        );
        distress.addColorStop(0, `rgba(255, 24, 48, ${0.08 + infrastructureRisk / 720})`);
        distress.addColorStop(1, "rgba(0, 0, 0, 0)");
        context.fillStyle = distress;
        context.fillRect(0, 0, width, height);
      }

      context.save();
      context.globalCompositeOperation = "screen";

      const aurora = context.createLinearGradient(0, horizonY - height * 0.12, width, horizonY + height * 0.18);
      aurora.addColorStop(0, `rgba(87,228,255,${0.018 + Math.sin(time * 0.37) * 0.008})`);
      aurora.addColorStop(0.5, `rgba(151,105,255,${0.07 + Math.sin(time * 0.23) * 0.025})`);
      aurora.addColorStop(1, `rgba(255,100,105,${0.016 + Math.cos(time * 0.31) * 0.008})`);
      context.fillStyle = aurora;
      context.beginPath();
      context.moveTo(0, horizonY + Math.sin(time * 0.3) * 24);
      context.bezierCurveTo(
        width * 0.27,
        horizonY - 70 + Math.sin(time * 0.47) * 30,
        width * 0.68,
        horizonY + 82 + Math.cos(time * 0.33) * 38,
        width,
        horizonY - 12 + Math.sin(time * 0.29) * 22,
      );
      context.lineTo(width, horizonY + height * 0.25);
      context.lineTo(0, horizonY + height * 0.2);
      context.closePath();
      context.fill();

      for (let lane = -2; lane <= 2; lane += 1) {
        const upper = project(lane * 0.34, 0.015);
        const lower = project(lane * 0.34, 1.1);
        const gradient = context.createLinearGradient(upper.x, upper.y, lower.x, lower.y);
        gradient.addColorStop(0, "rgba(151,105,255,0)");
        gradient.addColorStop(0.35, "rgba(151,105,255,.16)");
        gradient.addColorStop(1, "rgba(87,228,255,.03)");
        context.strokeStyle = gradient;
        context.lineWidth = lane === 0 ? 1.1 : 0.7;
        context.beginPath();
        context.moveTo(upper.x, upper.y);
        context.lineTo(lower.x, lower.y);
        context.stroke();
      }

      const rungCount = compact ? 10 : 22;
      for (let rung = 0; rung < rungCount; rung += 1) {
        const phase = ((Date.now() * 0.00011 + rung / rungCount) % 1) ** 1.5;
        const left = project(-0.82, phase);
        const right = project(0.82, phase);
        context.strokeStyle = `rgba(119, 120, 255, ${phase * 0.15})`;
        context.lineWidth = 0.5;
        context.beginPath();
        context.moveTo(left.x, left.y);
        context.lineTo(right.x, right.y);
        context.stroke();
      }

      for (const particle of particlesRef.current) {
        if (!pausedRef.current) {
          particle.depth += particle.speed * (0.35 + intensityRef.current * 1.2);
          particle.lane += particle.drift + Math.sin(time * 0.8 + particle.phase) * 0.00018;
        }
        if (particle.depth > 1.08) {
          particle.depth = Math.random() * 0.035;
          particle.lane = (Math.random() - 0.5) * 1.7;
        }

        const point = project(particle.lane, particle.depth);
        const color = tones[particle.tone];
        const alpha = clamp(0.1 + particle.depth * 0.92, 0, 1);
        const trailLength = 5 + point.scale * 34;
        const radius = particle.size * point.scale;

        context.shadowColor = color.hex;
        context.shadowBlur = compact ? 0 : 8 + point.scale * 8;
        context.strokeStyle = `rgba(${color.rgb}, ${alpha * 0.48})`;
        context.lineWidth = Math.max(0.55, radius * 0.82);
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(point.x - particle.lane * 3, point.y - trailLength);
        context.stroke();

        context.fillStyle = `rgba(${color.rgb}, ${alpha})`;
        context.beginPath();
        if (particle.shape === "packet") {
          const side = Math.max(1.2, radius * 1.7);
          context.rect(point.x - side / 2, point.y - side / 2, side, side);
        } else if (particle.shape === "ring") {
          context.arc(point.x, point.y, Math.max(1.4, radius * 1.8), 0, Math.PI * 2);
          context.lineWidth = Math.max(0.6, radius * 0.45);
          context.strokeStyle = `rgba(${color.rgb}, ${alpha})`;
          context.stroke();
        } else if (particle.shape === "spark") {
          const side = Math.max(1.4, radius * 2.2);
          context.moveTo(point.x, point.y - side);
          context.lineTo(point.x + side * 0.65, point.y);
          context.lineTo(point.x, point.y + side);
          context.lineTo(point.x - side * 0.65, point.y);
          context.closePath();
        } else {
          context.arc(point.x, point.y, Math.max(0.7, radius), 0, Math.PI * 2);
        }
        context.fill();
      }

      for (const wave of shockwavesRef.current) {
        if (!pausedRef.current) {
          wave.life -= 0.008 + intensityRef.current * 0.006;
          wave.depth += 0.0014 + wave.energy / 85000;
        }
        const point = project(wave.lane, wave.depth);
        const color = tones[wave.tone];
        const radius = (1 - wave.life) * (24 + wave.energy * 0.72) * point.scale;
        context.strokeStyle = `rgba(${color.rgb}, ${clamp(wave.life * 0.64, 0, 0.64)})`;
        context.lineWidth = 0.6 + wave.life * 1.4;
        context.shadowColor = color.hex;
        context.shadowBlur = compact ? 0 : 18 * wave.life;
        context.beginPath();
        if (wave.shape === "packet") {
          context.rect(point.x - radius, point.y - radius * 0.42, radius * 2, radius * 0.84);
        } else {
          context.ellipse(point.x, point.y, radius * 1.5, radius * 0.48, 0, 0, Math.PI * 2);
        }
        context.stroke();
      }
      shockwavesRef.current = shockwavesRef.current.filter((wave) => wave.life > 0);

      context.restore();
      context.shadowBlur = 0;

      const vignette = context.createRadialGradient(
        width / 2,
        height * 0.52,
        width * 0.12,
        width / 2,
        height * 0.52,
        width * 0.82,
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,.78)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);

    };

    animationFrame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let ris: WebSocket | null = null;
    let atlas: WebSocket | null = null;
    let wikimedia: EventSource | null = null;
    let blockchain: WebSocket | null = null;
    let risRetry: number | undefined;
    let atlasRetry: number | undefined;
    let blockchainRetry: number | undefined;
    let githubTimer: number | undefined;
    let hackerNewsTimer: number | undefined;
    let githubEtag = "";
    let lastGithubEvent = "";

    const connectRis = () => {
      if (disposed) return;
      setSourceHealth((current) => ({ ...current, ris: "connecting" }));
      ris = new WebSocket("wss://ris-live.ripe.net/v1/ws/?client=etherlane");

      ris.onopen = () => {
        if (disposed || !ris) return;
        setSourceHealth((current) => ({ ...current, ris: "live" }));
        ris.send(
          JSON.stringify({
            type: "ris_subscribe",
            data: { socketOptions: { includeRaw: false } },
          }),
        );
      };

      ris.onmessage = (message) => {
        try {
          const parsed = JSON.parse(String(message.data));
          if (parsed.type !== "ris_message") return;
          const data = parsed.data;
          const cadence = data?.type === "KEEPALIVE" ? 1200 : 190;
          if (disposed || Date.now() - sourceEmitRef.current.ris < cadence) return;
          sourceEmitRef.current.ris = Date.now();

          if (data?.type !== "UPDATE") {
            const descriptor = risKinds[data?.type];
            if (!descriptor) return;
            const host = String(data.host ?? "a route collector");
            const state = String(data.state ?? data.new_state ?? "").replaceAll("_", " ").toLowerCase();
            emitSignal({
              source: "RIS",
              kind: descriptor.kind,
              label: descriptor.label,
              detail: `${host} · AS${data.peer_asn ?? "?"}${state ? ` · ${state}` : ""}`,
              tone: descriptor.tone,
              magnitude: data.type === "NOTIFICATION" ? 88 : data.type === "RIS_PEER_STATE" ? 66 : 28,
              spoken:
                data.type === "KEEPALIVE"
                  ? `Session pulse. A S ${digits(data.peer_asn)}.`
                  : `${descriptor.kind.toLowerCase()}. A S ${digits(data.peer_asn)}${state ? `. ${state}` : ""}.`,
            });
            return;
          }

          const announcements = Array.isArray(data.announcements)
            ? data.announcements.flatMap((item: { prefixes?: string[] }) => item.prefixes ?? [])
            : [];
          const withdrawals = Array.isArray(data.withdrawals) ? data.withdrawals : [];
          const isWithdrawal = withdrawals.length > 0 && announcements.length === 0;
          const isExchange = withdrawals.length > 0 && announcements.length > 0;
          const prefix = (isWithdrawal ? withdrawals[0] : announcements[0]) ?? "a public prefix";
          const pathLength = Array.isArray(data.path) ? data.path.length : 0;
          const kind = isExchange ? "ROUTE EXCHANGE" : isWithdrawal ? "ROUTE WITHDRAWN" : "ROUTE ANNOUNCED";
          emitSignal({
            source: "RIS",
            kind,
            label: isExchange
              ? "Routes entered and left the global table together"
              : isWithdrawal
                ? "A route left the global table"
                : "A route entered the global table",
            detail: `AS${data.peer_asn ?? "?"} · ${prefix}${pathLength ? ` · ${pathLength} hops` : ""}`,
            tone: isWithdrawal ? "coral" : isExchange || pathLength > 7 ? "amber" : "violet",
            magnitude: clamp(24 + pathLength * 7, 25, 100),
            spoken: `${kind.toLowerCase()}. A S ${digits(data.peer_asn)}. ${spokenPrefix(prefix)}${pathLength ? `. ${pathLength} hops` : ""}.`,
          });
        } catch {
          // Malformed upstream messages are ignored and never retained.
        }
      };

      ris.onerror = () => ris?.close();
      ris.onclose = () => {
        if (disposed) return;
        setSourceHealth((current) => ({ ...current, ris: "offline" }));
        risRetry = window.setTimeout(connectRis, 4500);
      };
    };

    const connectAtlas = () => {
      if (disposed) return;
      setSourceHealth((current) => ({ ...current, atlas: "connecting" }));
      atlas = new WebSocket("wss://atlas-stream.ripe.net/stream/?client=etherlane");

      atlas.onopen = () => {
        if (disposed || !atlas) return;
        setSourceHealth((current) => ({ ...current, atlas: "live" }));
        atlas.send(JSON.stringify(["atlas_subscribe", { streamType: "result", msm: 1001 }]));
      };

      atlas.onmessage = (message) => {
        if (disposed || Date.now() - sourceEmitRef.current.atlas < 420) return;
        try {
          const [type, data] = JSON.parse(String(message.data));
          if (type !== "atlas_result") return;
          const samples = Array.isArray(data.result)
            ? data.result
                .map((item: { rtt?: number }) => item.rtt)
                .filter((value: unknown): value is number => typeof value === "number")
            : [];
          const latency = samples.length
            ? samples.reduce((total: number, value: number) => total + value, 0) / samples.length
            : null;
          sourceEmitRef.current.atlas = Date.now();
          emitSignal({
            source: "ATLAS",
            kind:
              latency === null
                ? "PROBE RESPONSE"
                : latency > 220
                  ? "HIGH LATENCY"
                  : latency < 25
                    ? "FAST RETURN"
                    : "PING RETURNED",
            label: "A measurement crossed the network",
            detail: latency === null ? `Probe ${data.prb_id ?? "unknown"} responded` : `${latency.toFixed(1)} ms · probe ${data.prb_id ?? "?"}`,
            tone: latency !== null && latency > 220 ? "coral" : latency !== null && latency > 120 ? "amber" : "cyan",
            magnitude: clamp(latency ?? 44, 16, 100),
            spoken:
              latency === null
                ? `Probe ${digits(data.prb_id)} responded.`
                : `${latency > 220 ? "High latency" : latency < 25 ? "Fast return" : "Ping returned"}. ${Math.round(latency)} milliseconds. Probe ${digits(data.prb_id)}.`,
          });
        } catch {
          // Malformed upstream messages are ignored and never retained.
        }
      };

      atlas.onerror = () => atlas?.close();
      atlas.onclose = () => {
        if (disposed) return;
        setSourceHealth((current) => ({ ...current, atlas: "offline" }));
        atlasRetry = window.setTimeout(connectAtlas, 5500);
      };
    };

    const connectWikimedia = () => {
      if (disposed) return;
      setSourceHealth((current) => ({ ...current, wikimedia: "connecting" }));
      wikimedia = new EventSource("https://stream.wikimedia.org/v2/stream/recentchange");

      wikimedia.onopen = () => {
        if (disposed) return;
        setSourceHealth((current) => ({ ...current, wikimedia: "live" }));
      };

      wikimedia.onmessage = (message) => {
        if (disposed || Date.now() - sourceEmitRef.current.wikimedia < 680) return;
        try {
          const data = JSON.parse(String(message.data));
          if (data.bot === true) return;
          const type = String(data.type ?? "edit");
          const oldLength = Number(data.length?.old ?? 0);
          const newLength = Number(data.length?.new ?? oldLength);
          const delta = newLength - oldLength;
          const kind = {
            new: "PAGE CREATED",
            edit: "PAGE EDITED",
            log: "PUBLIC LOG",
            categorize: "CATEGORY SHIFT",
            external: "LINK CHANGED",
          }[type] ?? "PUBLIC CHANGE";
          const project = wikiName(data.wiki);
          sourceEmitRef.current.wikimedia = Date.now();
          emitSignal({
            source: "WIKIMEDIA",
            kind,
            label: "A public knowledge project changed",
            detail: `${String(data.wiki ?? data.server_name ?? "Wikimedia")} · ${delta >= 0 ? "+" : ""}${delta} bytes`,
            tone: type === "new" ? "violet" : delta < -1800 ? "coral" : Math.abs(delta) > 2400 ? "amber" : "cyan",
            magnitude: clamp(24 + Math.log10(Math.abs(delta) + 1) * 18, 24, 96),
            spoken: `${kind.toLowerCase()}. ${project}. ${Math.abs(delta) < 1 ? "Metadata changed" : `${Math.abs(delta)} bytes ${delta >= 0 ? "added" : "removed"}`}.`,
          });
        } catch {
          // Malformed upstream messages are ignored and never retained.
        }
      };

      wikimedia.onerror = () => {
        if (disposed) return;
        setSourceHealth((current) => ({ ...current, wikimedia: "offline" }));
      };
    };

    const pollGithub = async () => {
      if (disposed) return;
      setSourceHealth((current) => ({
        ...current,
        github: current.github === "live" ? "live" : "connecting",
      }));
      try {
        const response = await fetch("https://api.github.com/events?per_page=20", {
          headers: {
            Accept: "application/vnd.github+json",
            ...(githubEtag ? { "If-None-Match": githubEtag } : {}),
          },
        });
        if (response.status === 304) {
          setSourceHealth((current) => ({ ...current, github: "live" }));
        } else if (response.ok) {
          githubEtag = response.headers.get("etag") ?? githubEtag;
          const data = (await response.json()) as Array<{
            id?: string;
            type?: string;
            payload?: { size?: number; action?: string };
          }>;
          const event = data.find((candidate) => candidate.id && candidate.id !== lastGithubEvent);
          if (event) {
            lastGithubEvent = String(event.id);
            const descriptor = githubKinds[String(event.type)] ?? {
              kind: "PUBLIC CODE EVENT",
              tone: "cyan" as SignalTone,
              spoken: "A public code event crossed the network.",
            };
            const action = String(event.payload?.action ?? "").replaceAll("_", " ").toUpperCase();
            const size = Number(event.payload?.size ?? 1);
            sourceEmitRef.current.github = Date.now();
            emitSignal({
              source: "GITHUB",
              kind: descriptor.kind,
              label: "Open-source activity crossed the public event API",
              detail: `${String(event.type ?? "Event").replace("Event", "").toUpperCase()}${action ? ` · ${action}` : ""}`,
              tone: descriptor.tone,
              magnitude: clamp(28 + Math.log2(size + 1) * 12, 28, 92),
              spoken: descriptor.spoken,
            });
          }
          setSourceHealth((current) => ({ ...current, github: "live" }));
        } else {
          setSourceHealth((current) => ({ ...current, github: "offline" }));
        }
      } catch {
        setSourceHealth((current) => ({ ...current, github: "offline" }));
      }
      if (!disposed) githubTimer = window.setTimeout(pollGithub, 70_000);
    };

    const pollHackerNews = async () => {
      if (disposed) return;
      try {
        const response = await fetch("https://hacker-news.firebaseio.com/v0/updates.json");
        if (!response.ok) throw new Error("HN unavailable");
        const data = (await response.json()) as { items?: unknown[]; profiles?: unknown[] };
        const items = Array.isArray(data.items) ? data.items.length : 0;
        const profiles = Array.isArray(data.profiles) ? data.profiles.length : 0;
        const kind = items > 65 ? "THREAD BURST" : profiles > items ? "PROFILE SHIFT" : "ITEM MUTATION";
        sourceEmitRef.current.hackernews = Date.now();
        emitSignal({
          source: "HACKERNEWS",
          kind,
          label: "A public technology conversation changed",
          detail: `${items} item changes · ${profiles} profile changes`,
          tone: items > 65 ? "amber" : profiles > items ? "violet" : "cyan",
          magnitude: clamp(22 + items * 0.72 + profiles * 0.28, 24, 94),
          spoken: `${kind.toLowerCase()}. ${items} public items changed.`,
        });
        setSourceHealth((current) => ({ ...current, hackernews: "live" }));
      } catch {
        setSourceHealth((current) => ({ ...current, hackernews: "offline" }));
      }
      if (!disposed) hackerNewsTimer = window.setTimeout(pollHackerNews, 24_000);
    };

    const connectBlockchain = () => {
      if (disposed) return;
      setSourceHealth((current) => ({ ...current, blockchain: "connecting" }));
      blockchain = new WebSocket("wss://ws.blockchain.info/inv");
      blockchain.onopen = () => {
        if (disposed || !blockchain) return;
        setSourceHealth((current) => ({ ...current, blockchain: "live" }));
        blockchain.send(JSON.stringify({ op: "unconfirmed_sub" }));
        blockchain.send(JSON.stringify({ op: "blocks_sub" }));
      };
      blockchain.onmessage = (message) => {
        if (disposed) return;
        try {
          const data = JSON.parse(String(message.data));
          const isBlock = data?.op === "block";
          if (!isBlock && Date.now() - sourceEmitRef.current.blockchain < 900) return;
          sourceEmitRef.current.blockchain = Date.now();
          if (isBlock) {
            const transactions = Number(data.x?.nTx ?? data.x?.txIndexes?.length ?? 0);
            emitSignal({
              source: "BLOCKCHAIN",
              kind: "BLOCK PROPAGATED",
              label: "A new public ledger block crossed the network",
              detail: `${transactions} transactions · height ${data.x?.height ?? "unknown"}`,
              tone: "amber",
              magnitude: clamp(46 + Math.log10(transactions + 1) * 13, 46, 100),
              spoken: `Block propagated. ${transactions} public transactions.`,
            });
            return;
          }
          if (data?.op !== "utx") return;
          const size = Number(data.x?.size ?? 0);
          const inputs = Array.isArray(data.x?.inputs) ? data.x.inputs.length : 0;
          const outputs = Array.isArray(data.x?.out) ? data.x.out.length : 0;
          emitSignal({
            source: "BLOCKCHAIN",
            kind: size > 1800 ? "LARGE TRANSACTION" : "TRANSACTION RELAYED",
            label: "A public transaction propagated between nodes",
            detail: `${size} bytes · ${inputs} inputs · ${outputs} outputs`,
            tone: size > 1800 ? "coral" : "violet",
            magnitude: clamp(24 + Math.log10(size + 1) * 17, 24, 92),
            spoken: `Transaction relayed. ${size} bytes. ${inputs} inputs and ${outputs} outputs.`,
          });
        } catch {
          // Public payload details are discarded immediately after normalization.
        }
      };
      blockchain.onerror = () => blockchain?.close();
      blockchain.onclose = () => {
        if (disposed) return;
        setSourceHealth((current) => ({ ...current, blockchain: "offline" }));
        blockchainRetry = window.setTimeout(connectBlockchain, 7000);
      };
    };

    connectRis();
    connectAtlas();
    connectWikimedia();
    void pollGithub();
    void pollHackerNews();
    connectBlockchain();

    return () => {
      disposed = true;
      window.clearTimeout(risRetry);
      window.clearTimeout(atlasRetry);
      window.clearTimeout(blockchainRetry);
      window.clearTimeout(githubTimer);
      window.clearTimeout(hackerNewsTimer);
      ris?.close();
      atlas?.close();
      wikimedia?.close();
      blockchain?.close();
    };
  }, [emitSignal]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const allOffline =
        sourceKeys.every((source) => sourceHealth[source] !== "live");
      if (!allOffline) return;
      const [kind, detail, tone, spoken] =
        syntheticSignals[Math.floor(Math.random() * syntheticSignals.length)];
      emitSignal({
        source: "SYNTHETIC",
        kind,
        label: "Fallback signal for continuity",
        detail,
        tone,
        magnitude: 28 + Math.random() * 64,
        spoken,
      });
    }, 720);
    return () => window.clearInterval(interval);
  }, [emitSignal, sourceHealth]);

  const toggleAudio = async () => {
    const next = !audioEnabledRef.current;
    audioEnabledRef.current = next;
    setAudioEnabled(next);
    if (!next) {
      window.speechSynthesis?.cancel();
      setSpokenPhrase("VOICE CHANNEL STANDBY");
      return;
    }
    if (!voiceSpaceRef.current) voiceSpaceRef.current = new EtherlaneVoiceSpace();
    await voiceSpaceRef.current.prepare();
    if (voiceEngineRef.current === "piper") {
      voiceBusyRef.current = true;
      try {
        await prepareNeuralVoice();
        const blob = await neuralVoiceRef.current!.synthesize("Etherlane. Data voice online.");
        if (!audioEnabledRef.current) return;
        await voiceSpaceRef.current.playBlob(
          blob,
          "violet",
          58,
          voiceSpaceAmountRef.current,
          neuralVoicePresets[neuralVoiceNameRef.current],
        );
        setSpokenPhrase("NEURAL VOICE ONLINE");
      } catch {
        setNeuralVoiceStatus("error");
        audioEnabledRef.current = false;
        setAudioEnabled(false);
        setSpokenPhrase("NEURAL VOICE UNAVAILABLE");
      } finally {
        voiceBusyRef.current = false;
      }
      return;
    }
    if (localVoiceRef.current) {
      const utterance = new SpeechSynthesisUtterance("Etherlane. Data voice online.");
      utterance.voice = localVoiceRef.current;
      utterance.lang = localVoiceRef.current.lang;
      utterance.rate = 0.88;
      utterance.volume = 0.62;
      voiceSpaceRef.current.playTexture("violet", 58, voiceSpaceAmountRef.current);
      window.speechSynthesis.speak(utterance);
      setSpokenPhrase("DATA VOICE ONLINE");
    }
  };

  const chooseVoiceEngine = async (engine: VoiceEngine) => {
    voiceEngineRef.current = engine;
    setVoiceEngine(engine);
    window.speechSynthesis?.cancel();
    if (engine === "piper" && audioEnabledRef.current) {
      try {
        await prepareNeuralVoice();
      } catch {
        setNeuralVoiceStatus("error");
      }
    }
  };

  const chooseNeuralVoice = async (voice: NeuralVoiceName) => {
    if (voice === neuralVoiceNameRef.current || neuralVoiceStatus === "loading") return;
    neuralVoiceNameRef.current = voice;
    setNeuralVoiceName(voice);
    setNeuralVoiceProgress(0);
    setNeuralVoiceStatus("idle");
    if (!neuralVoiceRef.current) {
      neuralVoiceRef.current = new EtherlaneNeuralVoice(voice);
    } else {
      neuralVoiceRef.current.setVoice(voice);
    }
    if (audioEnabledRef.current) {
      voiceBusyRef.current = true;
      try {
        await prepareNeuralVoice();
        const blob = await neuralVoiceRef.current.synthesize(
          "A new voice enters the ether.",
        );
        if (!voiceSpaceRef.current) voiceSpaceRef.current = new EtherlaneVoiceSpace();
        await voiceSpaceRef.current.playBlob(
          blob,
          "violet",
          52,
          voiceSpaceAmountRef.current,
          neuralVoicePresets[voice],
        );
        setSpokenPhrase(`${neuralVoicePresets[voice].label} ONLINE`);
      } catch {
        setNeuralVoiceStatus("error");
      } finally {
        voiceBusyRef.current = false;
      }
    }
  };

  const chooseVoice = (voiceUri: string) => {
    const voice = localVoices.find((candidate) => candidate.voiceURI === voiceUri) ?? null;
    localVoiceRef.current = voice;
    selectedVoiceRef.current = voice?.voiceURI ?? "";
    setSelectedVoiceUri(voice?.voiceURI ?? "");
    setVoiceAvailable(Boolean(voice));
  };

  const pulseKickLight = useCallback((pulse: KickPulse) => {
    if (!kickLightEnabledRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const light = kickLightRef.current;
    if (!light) return;
    light.getAnimations().forEach((animation) => animation.cancel());
    light.animate(
      [
        { opacity: 0, transform: "scale(0.96)" },
        { opacity: String(0.16 + pulse.energy * 0.32), transform: "scale(1)" },
        { opacity: 0, transform: "scale(1.045)" },
      ],
      {
        duration: pulse.mode === "techno" ? 340 : pulse.mode === "edm" ? 300 : 230,
        easing: "cubic-bezier(0.16, 0.8, 0.3, 1)",
      },
    );
  }, []);

  const toggleMusic = async () => {
    if (!synthRef.current) {
      synthRef.current = new EtherlaneSynth(
        (frame) => setSynthFrame(frame),
        pulseKickLight,
      );
      synthRef.current.setSettings(synthSettings);
      synthRef.current.setIntensity(intensityRef.current);
      synthRef.current.setHealth(sourceKeys.filter((source) => sourceHealth[source] === "live").length);
      synthRef.current.setRhythmMode(rhythmMode);
    }
    if (musicEnabled) {
      synthRef.current.stop();
      setMusicEnabled(false);
      return;
    }
    const started = await synthRef.current.start();
    setMusicEnabled(started);
  };

  const chooseRhythmMode = (mode: RhythmMode) => {
    setRhythmMode(mode);
    synthRef.current?.setRhythmMode(mode);
  };

  const updateSynth = <Key extends keyof SynthSettings>(key: Key, value: SynthSettings[Key]) => {
    setSelectedPatch("custom");
    setSynthSettings((current) => ({ ...current, [key]: value }));
  };

  const applyPatch = (patch: (typeof synthPatches)[number]) => {
    setSelectedPatch(patch.value);
    setSynthSettings({ ...patch.settings });
  };

  const chooseBinauralMode = (mode: BinauralMode) => {
    setBinauralMode(mode);
    binauralRef.current?.setMode(mode);
  };

  const toggleBinaural = async () => {
    if (binauralEnabled) {
      binauralRef.current?.stop();
      setBinauralEnabled(false);
      return;
    }
    if (!binauralRef.current) binauralRef.current = new EtherlaneBinaural();
    const started = await binauralRef.current.start(binauralMode);
    setBinauralEnabled(started);
  };

  const connectionLabel = useMemo(() => {
    const liveCount = sourceKeys.filter((source) => sourceHealth[source] === "live").length;
    if (liveCount === 1) return "1 LIVE SOURCE";
    if (liveCount > 1) return `${liveCount} LIVE SOURCES`;
    return "SYNTHETIC FALLBACK";
  }, [sourceHealth]);

  const latest = events[0];
  const activeVoiceName =
    voiceEngine === "piper"
      ? neuralVoicePresets[neuralVoiceName].label
      : localVoices.find((voice) => voice.voiceURI === selectedVoiceUri)?.name ?? "BEST LOCAL VOICE";

  return (
    <main
      className={`etherlane-shell infra-${infrastructure.state} ${
        infrastructure.risk >= 72 ? "is-disrupted" : ""
      }`}
    >
      <ImmersiveFlowScene
        active={visualization === "flow"}
        paused={paused}
        intensity={intensity}
        infrastructureRisk={infrastructure.risk}
        signal={
          latest
            ? {
                id: latest.id,
                tone: latest.tone,
                magnitude: latest.magnitude,
                code: packetCode(latest),
              }
            : undefined
        }
      />
      <canvas
        ref={canvasRef}
        className={`signal-canvas ${visualization === "flow" ? "is-inactive" : "is-active"}`}
        aria-hidden="true"
      />
      <div
        ref={kickLightRef}
        className={`kick-light light-${kickLightColor} ${
          kickLightEnabled && rhythmMode !== "ambient" ? "is-armed" : ""
        }`}
        aria-hidden="true"
      />
      <div className="grain" aria-hidden="true" />
      <div className="scanline" aria-hidden="true" />

      <header className="topbar">
        <a className="wordmark" href="#experience" aria-label="Etherlane home">
          <span className="wordmark-glyph" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>ETHERLANE</span>
        </a>

        <div className="topbar-status" aria-live="polite">
          <span
            className={`live-dot ${
              sourceKeys.some((source) => sourceHealth[source] === "live")
                ? "is-live"
                : ""
            }`}
          />
          {connectionLabel}
        </div>

        <div className="topbar-actions">
          <button className="text-button synth-link" type="button" onClick={() => setShowSynth(true)}>
            SIGNAL SYNTH
          </button>
          <button className="text-button" type="button" onClick={() => setShowAbout(true)}>
            ABOUT
          </button>
        </div>
      </header>

      <section id="experience" className="experience" aria-label="Live internet signal experience">
        <div className="hero-copy">
          <p className="eyebrow">PUBLIC INTERNET OBSERVATORY / LIVE</p>
          <h1>
            STAND INSIDE
            <span>THE FLOW.</span>
          </h1>
          <p className="hero-intro">
            Routes shift. Measurements return. Code, knowledge, conversations and public ledger
            packets cross the network. The invisible internet becomes light, motion and sound.
          </p>
        </div>

        <div className="visualizer-switch" aria-label="Choose visualization">
          <span>VISUAL FIELD</span>
          <div>
            {visualizations.map((option) => (
              <button
                className={visualization === option.value ? "is-active" : ""}
                type="button"
                key={option.value}
                onClick={() => setVisualization(option.value)}
                aria-pressed={visualization === option.value}
                title={option.hint}
              >
                {option.label}
              </button>
            ))}
          </div>
          <small>{visualizations.find((option) => option.value === visualization)?.hint}</small>
        </div>

        <div className="horizon-lockup" aria-hidden="true">
          <span>LISTENING</span>
          <strong>{String(signalCount).padStart(6, "0")}</strong>
          <small>EPHEMERAL SIGNALS</small>
        </div>

        <div className="live-caption" aria-live="polite">
          <span className={`signal-pip tone-${latest?.tone ?? "violet"}`} />
          <div>
            <small>{latest ? `${latest.source} / ${latest.kind}` : "ACQUIRING SIGNALS"}</small>
            <strong>{latest?.detail ?? "Connecting to the public internet…"}</strong>
          </div>
        </div>

        <div
          className={`voice-transmission ${audioEnabled || musicEnabled ? "is-speaking" : ""}`}
          aria-live="polite"
        >
          <small>
            {musicEnabled
              ? `${rhythmPresets[rhythmMode].label} SYNTH / LIVE`
              : audioEnabled
                ? "NOW VOICING"
                : "AUDIO CHANNELS"}
          </small>
          <strong>
            {musicEnabled
              ? `${synthFrame.source} · ${synthFrame.note} · ${synthFrame.voices} VOICES`
              : spokenPhrase}
          </strong>
          <span aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => (
              <i key={index} />
            ))}
          </span>
        </div>
      </section>

      <aside className="stream-panel" aria-label="Ephemeral event stream">
        <div className="panel-heading">
          <div>
            <span>LIVE SIGNALS</span>
            <small>NEWEST FIRST</small>
          </div>
          <span className="retention-chip">0 B RETAINED</span>
        </div>

        <section
          className={`infrastructure-panel state-${infrastructure.state}`}
          aria-label="Core internet infrastructure status"
          aria-live="polite"
        >
          <div className="infrastructure-summary">
            <span>
              <i aria-hidden="true" />
              CORE NETWORK
            </span>
            <strong>
              {infrastructure.state === "outage"
                ? "DISRUPTION DETECTED"
                : infrastructure.state === "degraded"
                  ? "SIGNAL DEGRADATION"
                  : infrastructure.state === "operational"
                    ? "NODES NOMINAL"
                    : "MONITORS ACQUIRING"}
            </strong>
            <small>
              RISK {infrastructure.risk}% · {infrastructure.monitorCoverage} MONITORS
            </small>
          </div>

          <div className="infrastructure-nodes">
            <span className={`node-state state-${infrastructure.root.state}`}>
              ROOT DNS
              <b>
                {infrastructure.root.resolvedIdentities}/13
                {infrastructure.root.operationalInstances
                  ? ` · ${infrastructure.root.operationalInstances.toLocaleString()} INST`
                  : ""}
              </b>
            </span>
            {infrastructure.services.map((service) => (
              <span className={`node-state state-${service.state}`} key={service.name}>
                {service.name.toUpperCase()}
                <b>{service.state.toUpperCase()}</b>
              </span>
            ))}
          </div>

          <p>
            Official service status plus multi-resolver root observation. Unreachable monitors
            remain unknown and never become a false outage.
          </p>
        </section>

        <div className="event-list">
          {events.length === 0 ? (
            <div className="event-placeholder">
              <span />
              <p>Opening public data streams…</p>
            </div>
          ) : (
            events.slice(0, 8).map((event) => (
              <button
                className={`event-row tone-${event.tone}`}
                type="button"
                key={event.id}
                onClick={() => setSelected(event)}
              >
                <span className="event-marker" />
                <span className="event-copy">
                  <small>
                    {event.source} · {formatTime(event.timestamp)}
                  </small>
                  <strong>{event.kind}</strong>
                  <em>{event.detail}</em>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="control-deck" aria-label="Experience controls">
        <button
          type="button"
          className={`primary-control ${musicEnabled ? "is-active" : ""}`}
          onClick={toggleMusic}
          aria-pressed={musicEnabled}
        >
          <span className="sequence-icon" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => (
              <i className={musicEnabled && index < synthFrame.voices ? "is-current" : ""} key={index} />
            ))}
          </span>
          <span>
            <small>{rhythmMode === "ambient" ? "AMBIENT SYNTH" : `${rhythmMode.toUpperCase()} DATA RHYTHM`}</small>
            <strong>{musicEnabled ? synthFrame.chord : "ENTER SYNTH"}</strong>
          </span>
        </button>

        <button
          type="button"
          className={`secondary-control voice-control ${audioEnabled ? "is-active" : ""}`}
          onClick={toggleAudio}
          aria-pressed={audioEnabled}
          disabled={voiceEngine === "device" && !voiceAvailable}
        >
          <span className="sound-bars" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            <small>VOICE</small>
            <strong>
              {voiceEngine === "piper" && neuralVoiceStatus === "loading"
                ? `LOADING ${neuralVoiceProgress}%`
                : voiceEngine === "piper" && neuralVoiceStatus === "idle" && !audioEnabled
                  ? "NEURAL · 70MB"
                : voiceEngine === "device" && !voiceAvailable
                  ? "UNAVAILABLE"
                  : audioEnabled
                    ? voiceEngine === "piper"
                      ? "NEURAL"
                      : "SPEAKING"
                    : "OFF"}
            </strong>
          </span>
        </button>

        <button
          type="button"
          className="secondary-control"
          onClick={() => setPaused((current) => !current)}
          aria-pressed={paused}
        >
          <span className={paused ? "play-icon" : "pause-icon"} aria-hidden="true" />
          <span>
            <small>STREAM</small>
            <strong>{paused ? "RESUME" : "HOLD"}</strong>
          </span>
        </button>

        <label className="intensity-control">
          <span>
            <small>INTENSITY</small>
            <strong>{intensity}%</strong>
          </span>
          <input
            type="range"
            min="20"
            max="100"
            value={intensity}
            onChange={(event) => setIntensity(Number(event.target.value))}
            aria-label="Visual and sound intensity"
          />
        </label>
      </section>

      <footer className="footerbar">
        <div className="source-strip">
          <span className={`source-tag ${sourceHealth.ris === "live" ? "is-live" : ""}`}>
            <i /> RIPE RIS
          </span>
          <span className={`source-tag ${sourceHealth.atlas === "live" ? "is-live" : ""}`}>
            <i /> RIPE ATLAS
          </span>
          <span className={`source-tag ${sourceHealth.wikimedia === "live" ? "is-live" : ""}`}>
            <i /> WIKIMEDIA
          </span>
          <span className={`source-tag ${sourceHealth.github === "live" ? "is-live" : ""}`}>
            <i /> GITHUB
          </span>
          <span className={`source-tag ${sourceHealth.hackernews === "live" ? "is-live" : ""}`}>
            <i /> HN
          </span>
          <span className={`source-tag ${sourceHealth.blockchain === "live" ? "is-live" : ""}`}>
            <i /> BLOCKCHAIN
          </span>
          <span className={`source-tag ${sourceHealth.infrastructure === "live" ? "is-live" : ""}`}>
            <i /> CORE STATUS
          </span>
        </div>
        <p>
          PUBLIC ROUTING + MEASUREMENT DATA ONLY <span>·</span> NO PRIVATE TRAFFIC
          <span>·</span> ZERO RETENTION
        </p>
        <div
          className="audience-meter"
          aria-live="polite"
          title="Anonymous live totals only. No cookies, IP storage or persistent tracking."
        >
          <span>
            <strong>{audience.visitors}</strong>
            <small>VISITORS</small>
          </span>
          <span className={audience.listeners > 0 ? "has-listeners" : ""}>
            <i aria-hidden="true" />
            <strong>{audience.listeners}</strong>
            <small>LISTENERS</small>
          </span>
          <span>
            <small>V{audience.version}</small>
          </span>
        </div>
      </footer>

      {selected && (
        <div className="detail-overlay" role="dialog" aria-modal="true" aria-labelledby="signal-title">
          <button className="overlay-scrim" type="button" aria-label="Close signal details" onClick={() => setSelected(null)} />
          <article className={`detail-card tone-${selected.tone}`}>
            <button className="close-button" type="button" onClick={() => setSelected(null)} aria-label="Close">
              ×
            </button>
            <p>{selected.source} / {formatTime(selected.timestamp)}</p>
            <h2 id="signal-title">{selected.kind}</h2>
            <strong>{selected.label}</strong>
            <span>{selected.detail}</span>
            <dl>
              <div>
                <dt>SIGNAL ENERGY</dt>
                <dd>{Math.round(selected.magnitude)}%</dd>
              </div>
              <div>
                <dt>RETENTION</dt>
                <dd>0 BYTES</dd>
              </div>
              <div>
                <dt>STATE</dt>
                <dd>DISCARDED</dd>
              </div>
            </dl>
          </article>
        </div>
      )}

      {showSynth && (
        <div className="detail-overlay synth-overlay" role="dialog" aria-modal="true" aria-labelledby="synth-title">
          <button className="overlay-scrim" type="button" aria-label="Close signal synthesizer" onClick={() => setShowSynth(false)} />
          <article className="synth-card">
            <header className="synth-header">
              <div>
                <p>ETHERLANE INSTRUMENT / EL-01</p>
                <h2 id="synth-title">SIGNAL SYNTH</h2>
              </div>
              <div className="synth-readout" aria-live="polite">
                <span className={musicEnabled ? "is-live" : ""}>{musicEnabled ? "RUNNING" : "STANDBY"}</span>
                <strong>{synthFrame.note}</strong>
                <small>
                  {synthFrame.source} / {Math.round(synthFrame.energy)}% ENERGY /{" "}
                  {rhythmMode === "ambient" ? "FREE TIME" : `${rhythmPresets[rhythmMode].bpm} BPM`}
                </small>
              </div>
              <button className="close-button" type="button" onClick={() => setShowSynth(false)} aria-label="Close">
                ×
              </button>
            </header>

            <div className="voice-scope" aria-hidden="true">
              {Array.from({ length: 24 }, (_, index) => (
                <i className={musicEnabled && index < synthFrame.voices * 3 ? "is-lit" : ""} key={index} />
              ))}
            </div>

            <div className="synth-modules">
              <section className="synth-module patch-module">
                <div className="module-title">
                  <span>00</span>
                  <div>
                    <strong>PATCH BANK</strong>
                    <small>ATMOSPHERE PRESETS</small>
                  </div>
                </div>
                <div className="patch-grid" aria-label="Synthesizer patches">
                  {synthPatches.map((patch) => (
                    <button
                      className={selectedPatch === patch.value ? "is-selected" : ""}
                      type="button"
                      key={patch.value}
                      onClick={() => applyPatch(patch)}
                      aria-pressed={selectedPatch === patch.value}
                    >
                      <strong>{patch.label}</strong>
                      <small>{patch.hint}</small>
                    </button>
                  ))}
                </div>
                {selectedPatch === "custom" && <p className="custom-patch">CUSTOM PATCH / LIVE EDIT</p>}
              </section>

              <section className="synth-module oscillator-module">
                <div className="module-title">
                  <span>01</span>
                  <div>
                    <strong>VOICE</strong>
                    <small>ENSEMBLE PALETTE</small>
                  </div>
                </div>
                <div className="choice-grid" aria-label="Instrument palette">
                  {paletteOptions.map((option) => (
                    <button
                      className={synthSettings.palette === option.value ? "is-selected" : ""}
                      type="button"
                      key={option.value}
                      onClick={() => updateSynth("palette", option.value)}
                      aria-pressed={synthSettings.palette === option.value}
                    >
                      <i className={`palette-${option.value}`} aria-hidden="true" />
                      {option.label}
                    </button>
                  ))}
                </div>
                <p>A sustained detuned string ensemble. The live-source count sets the chord; signals add bowed voices.</p>
              </section>

              <section className="synth-module scale-module">
                <div className="module-title">
                  <span>02</span>
                  <div>
                    <strong>HARMONY</strong>
                    <small>QUANTIZER</small>
                  </div>
                </div>
                <div className="scale-choices" aria-label="Musical scale">
                  {scaleOptions.map((option) => (
                    <button
                      className={synthSettings.scale === option.value ? "is-selected" : ""}
                      type="button"
                      key={option.value}
                      onClick={() => updateSynth("scale", option.value)}
                      aria-pressed={synthSettings.scale === option.value}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="scale-choices key-choices" aria-label="Musical key">
                  {keyOptions.map((option) => (
                    <button
                      className={synthSettings.key === option.value ? "is-selected" : ""}
                      type="button"
                      key={option.value}
                      onClick={() => updateSynth("key", option.value)}
                      aria-pressed={synthSettings.key === option.value}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="synth-module filter-module">
                <div className="module-title">
                  <span>03</span>
                  <div>
                    <strong>TONE</strong>
                    <small>WARMTH / ENSEMBLE</small>
                  </div>
                </div>
                <label className="synth-slider">
                  <span>WARMTH <output>{synthSettings.warmth}%</output></span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={synthSettings.warmth}
                    onChange={(event) => updateSynth("warmth", Number(event.target.value))}
                  />
                </label>
                <label className="synth-slider">
                  <span>SHIMMER <output>{synthSettings.shimmer}%</output></span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={synthSettings.shimmer}
                    onChange={(event) => updateSynth("shimmer", Number(event.target.value))}
                  />
                </label>
              </section>

              <section className="synth-module clock-module">
                <div className="module-title">
                  <span>04</span>
                  <div>
                    <strong>MOTION</strong>
                    <small>DRIFT / OUTPUT</small>
                  </div>
                </div>
                <label className="synth-slider">
                  <span>DRIFT <output>{synthSettings.drift}%</output></span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={synthSettings.drift}
                    onChange={(event) => updateSynth("drift", Number(event.target.value))}
                  />
                </label>
                <label className="synth-slider">
                  <span>MASTER <output>{synthSettings.master}%</output></span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={synthSettings.master}
                    onChange={(event) => updateSynth("master", Number(event.target.value))}
                  />
                </label>
              </section>

              <section className="synth-module effects-module">
                <div className="module-title">
                  <span>05</span>
                  <div>
                    <strong>SPACE</strong>
                    <small>DELAY / REVERB</small>
                  </div>
                </div>
                <label className="synth-slider">
                  <span>DELAY <output>{synthSettings.delay}%</output></span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={synthSettings.delay}
                    onChange={(event) => updateSynth("delay", Number(event.target.value))}
                  />
                </label>
                <label className="synth-slider">
                  <span>REVERB <output>{synthSettings.space}%</output></span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={synthSettings.space}
                    onChange={(event) => updateSynth("space", Number(event.target.value))}
                  />
                </label>
              </section>

              <section className="synth-module voice-module">
                <div className="module-title">
                  <span>06</span>
                  <div>
                    <strong>VOICE PROCESSOR</strong>
                    <small>NEURAL TTS / TRUE SPACE</small>
                  </div>
                </div>
                <div className="scale-choices voice-engine-choices" aria-label="Voice engine">
                  <button
                    className={voiceEngine === "piper" ? "is-selected" : ""}
                    type="button"
                    onClick={() => void chooseVoiceEngine("piper")}
                    aria-pressed={voiceEngine === "piper"}
                  >
                    PIPER NEURAL
                  </button>
                  <button
                    className={voiceEngine === "device" ? "is-selected" : ""}
                    type="button"
                    onClick={() => void chooseVoiceEngine("device")}
                    aria-pressed={voiceEngine === "device"}
                  >
                    DEVICE VOICE
                  </button>
                </div>
                {voiceEngine === "piper" && (
                  <div className="neural-voice-grid" aria-label="Piper voice character">
                    {(Object.entries(neuralVoicePresets) as Array<
                      [NeuralVoiceName, (typeof neuralVoicePresets)[NeuralVoiceName]]
                    >).map(([voice, preset]) => (
                      <button
                        className={neuralVoiceName === voice ? "is-selected" : ""}
                        type="button"
                        key={voice}
                        disabled={neuralVoiceStatus === "loading"}
                        onClick={() => void chooseNeuralVoice(voice)}
                        aria-pressed={neuralVoiceName === voice}
                      >
                        <strong>{preset.label}</strong>
                        <small>{preset.character} · {preset.modelSize}</small>
                      </button>
                    ))}
                  </div>
                )}
                <div className="scale-choices voice-density-choices" aria-label="Spoken word density">
                  <button
                    className={voiceDensity === "dream" ? "is-selected" : ""}
                    type="button"
                    onClick={() => setVoiceDensity("dream")}
                    aria-pressed={voiceDensity === "dream"}
                  >
                    DREAM PHRASES
                  </button>
                  <button
                    className={voiceDensity === "full" ? "is-selected" : ""}
                    type="button"
                    onClick={() => setVoiceDensity("full")}
                    aria-pressed={voiceDensity === "full"}
                  >
                    FULL SIGNALS
                  </button>
                </div>
                {voiceEngine === "device" && (
                  <label className="voice-selector">
                    <span>VOICE <output>{voiceAvailable ? "LOCAL" : "UNAVAILABLE"}</output></span>
                    <select
                      value={selectedVoiceUri}
                      onChange={(event) => chooseVoice(event.target.value)}
                      disabled={localVoices.length === 0}
                    >
                      {localVoices.length === 0 ? (
                        <option value="">NO LOCAL VOICE FOUND</option>
                      ) : (
                        localVoices.map((voice) => (
                          <option value={voice.voiceURI} key={voice.voiceURI}>
                            {voice.name} · {voice.lang}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                )}
                <label className="synth-slider">
                  <span>VOICE REVERB <output>{voiceSpace}%</output></span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={voiceSpace}
                    onChange={(event) => setVoiceSpace(Number(event.target.value))}
                  />
                </label>
                <p>
                  {activeVoiceName}. Neural audio runs through a real 3.8 s convolution hall
                  with separate 310 ms left and 470 ms right delays.
                  {voiceEngine === "piper" && neuralVoiceStatus === "idle"
                    ? ` First use downloads the selected ${neuralVoicePresets[neuralVoiceName].modelSize} voice model to this device.`
                    : ""}
                  {voiceEngine === "piper" && neuralVoiceStatus === "loading"
                    ? ` Loading local model: ${neuralVoiceProgress}%.`
                    : ""}
                  {voiceEngine === "piper" && neuralVoiceStatus === "error"
                    ? " Neural voice could not load; try the device voice."
                    : ""}
                </p>
              </section>

              <section className="synth-module rhythm-module">
                <div className="module-title">
                  <span>07</span>
                  <div>
                    <strong>DATA RHYTHM</strong>
                    <small>PROCEDURAL DRUM MACHINE</small>
                  </div>
                </div>
                <div className="rhythm-grid" aria-label="Music and drum style">
                  {(Object.entries(rhythmPresets) as Array<
                    [RhythmMode, (typeof rhythmPresets)[RhythmMode]]
                  >).map(([mode, preset]) => (
                    <button
                      className={rhythmMode === mode ? "is-selected" : ""}
                      type="button"
                      key={mode}
                      onClick={() => chooseRhythmMode(mode)}
                      aria-pressed={rhythmMode === mode}
                    >
                      <strong>{preset.label}</strong>
                      <small>{preset.bpm ? `${preset.bpm} BPM` : "NO DRUMS"}</small>
                    </button>
                  ))}
                </div>
                <p className="rhythm-description">
                  {rhythmPresets[rhythmMode].description}. No fixed loop: every phrase inherits
                  new decisions from the live data stream.
                </p>
                <div className="data-modulation-grid" aria-label="Live data modulation matrix">
                  <span><small>VOICE</small><strong>{synthFrame.modulation.voice}</strong></span>
                  <span><small>GROUND</small><strong>{synthFrame.chord.split(" ")[0] || "LOCKED"}</strong></span>
                  <span><small>CUTOFF</small><strong>{Math.round(synthFrame.modulation.cutoff)} HZ</strong></span>
                  <span><small>ECHO</small><strong>{Math.round(synthFrame.modulation.delay * 100)}%</strong></span>
                  <span><small>HALL</small><strong>{Math.round(synthFrame.modulation.reverb * 100)}%</strong></span>
                  <span><small>DENSITY</small><strong>{Math.round(synthFrame.modulation.density * 100)}%</strong></span>
                </div>
                <div className="kick-light-controls">
                  <button
                    className={kickLightEnabled ? "is-active" : ""}
                    type="button"
                    onClick={() => setKickLightEnabled((enabled) => !enabled)}
                    aria-pressed={kickLightEnabled}
                  >
                    <i aria-hidden="true" />
                    KICK LIGHT {kickLightEnabled ? "ON" : "OFF"}
                  </button>
                  <div className="light-colors" aria-label="Kick light colour">
                    {kickLightColors.map((color) => (
                      <button
                        className={`light-${color.value} ${
                          kickLightColor === color.value ? "is-selected" : ""
                        }`}
                        type="button"
                        key={color.value}
                        title={color.label}
                        onClick={() => setKickLightColor(color.value)}
                        aria-label={`${color.label} kick light`}
                        aria-pressed={kickLightColor === color.value}
                      />
                    ))}
                  </div>
                </div>
              </section>

              <section className="synth-module binaural-module">
                <div className="module-title">
                  <span>08</span>
                  <div>
                    <strong>BINAURAL MEDITATION</strong>
                    <small>TRUE STEREO CARRIER PAIR</small>
                  </div>
                </div>
                <div className="binaural-intro">
                  <span aria-hidden="true">L</span>
                  <i aria-hidden="true" />
                  <strong>{binauralPresets[binauralMode].beatHz} HZ</strong>
                  <i aria-hidden="true" />
                  <span aria-hidden="true">R</span>
                </div>
                <div className="binaural-grid" aria-label="Binaural listening mode">
                  {(Object.entries(binauralPresets) as Array<
                    [BinauralMode, (typeof binauralPresets)[BinauralMode]]
                  >).map(([mode, preset]) => (
                    <button
                      className={binauralMode === mode ? "is-selected" : ""}
                      type="button"
                      key={mode}
                      onClick={() => chooseBinauralMode(mode)}
                      aria-pressed={binauralMode === mode}
                    >
                      <strong>{preset.label}</strong>
                      <small>{preset.beatHz} Hz · {preset.description}</small>
                    </button>
                  ))}
                </div>
                <div className="headphone-advice">
                  <strong>USE HEADPHONES</strong>
                  <span>
                    Required for left/right separation. Keep volume comfortable; stop if you feel
                    discomfort. This is an ambient meditation aid, not medical treatment.
                  </span>
                </div>
                <button
                  className={`binaural-power ${binauralEnabled ? "is-active" : ""}`}
                  type="button"
                  onClick={() => void toggleBinaural()}
                  aria-pressed={binauralEnabled}
                >
                  {binauralEnabled ? "STOP BINAURAL FIELD" : "START BINAURAL FIELD"}
                </button>
              </section>
            </div>

            <div className="signal-map">
              <div><i className="tone-violet" /><span>RIPE RIS</span><strong>BASS / ROUTE MOTIFS</strong></div>
              <div><i className="tone-cyan" /><span>RIPE ATLAS</span><strong>PULSE / HIGH VOICES</strong></div>
              <div><i className="tone-amber" /><span>WIKIMEDIA</span><strong>CHORDS / HARMONIC LIGHT</strong></div>
              <div><i className="tone-cyan" /><span>GITHUB</span><strong>CODE / BRIGHT MOTIFS</strong></div>
              <div><i className="tone-violet" /><span>HACKER NEWS</span><strong>THREAD / MID VOICES</strong></div>
              <div><i className="tone-amber" /><span>BLOCKCHAIN</span><strong>LEDGER / LOW PULSES</strong></div>
              <div><i className="tone-coral" /><span>CORE STATUS</span><strong>OUTAGE / DISTRESS VOICES</strong></div>
              <p>Events are quantized before playback. Raw messages never enter the audio graph and nothing is recorded.</p>
            </div>

            <button className={`synth-power ${musicEnabled ? "is-active" : ""}`} type="button" onClick={toggleMusic}>
              <i aria-hidden="true" />
              {musicEnabled ? "STOP GENERATIVE MUSIC" : "START GENERATIVE MUSIC"}
            </button>
          </article>
        </div>
      )}

      {showAbout && (
        <div className="detail-overlay" role="dialog" aria-modal="true" aria-labelledby="about-title">
          <button className="overlay-scrim" type="button" aria-label="Close about Etherlane" onClick={() => setShowAbout(false)} />
          <article className="about-card">
            <button className="close-button" type="button" onClick={() => setShowAbout(false)} aria-label="Close">
              ×
            </button>
            <p>ABOUT THE SIGNAL</p>
            <h2 id="about-title">THE INTERNET IS NOT SILENT.</h2>
            <div className="about-grid">
              <section>
                <span>01</span>
                <h3>WHAT YOU SEE</h3>
                <p>
                  Six public signal families and a live infrastructure-health channel become a
                  flowing highway, a moving neural network or matrix-like packet code. Every
                  message forms a fresh multi-hop path. Mobile uses a lighter 24-frame profile.
                </p>
              </section>
              <section>
                <span>02</span>
                <h3>WHAT YOU HEAR</h3>
                <p>
                  An evolving ambient pad moves gradually through the selected scale while routing,
                  latency, code, conversation, ledger and infrastructure events add spatial
                  voices. Piper neural speech can use full signal descriptions or sparse dream
                  phrases, passing through true convolution reverb. Optional binaural modes place
                  a different carrier in each ear for a headphone meditation field.
                </p>
              </section>
              <section>
                <span>03</span>
                <h3>WHAT WE KEEP</h3>
                <p>
                  Signal data follows a zero-retention policy: it exists briefly in memory,
                  becomes light and sound, then disappears. The optional reusable Piper voice model may
                  remain on this device, but spoken text and signal content do not. No database,
                  payload capture or private traffic.
                </p>
              </section>
            </div>
            <button className="enter-button" type="button" onClick={() => setShowAbout(false)}>
              RETURN TO THE FLOW
            </button>
          </article>
        </div>
      )}
    </main>
  );
}
