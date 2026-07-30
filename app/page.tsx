"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  defaultSynthSettings,
  EtherlaneSynth,
  EtherlaneVoiceSpace,
  type KeyName,
  type Palette,
  type ScaleName,
  type SynthFrame,
  type SynthSettings,
} from "./synth-engine";

type SignalSource = "RIS" | "ATLAS" | "WIKIMEDIA" | "SYNTHETIC";
type SignalTone = "violet" | "cyan" | "amber" | "coral";
type SignalShape = "beam" | "ring" | "packet" | "spark";

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

type SourceHealth = {
  ris: "connecting" | "live" | "offline";
  atlas: "connecting" | "live" | "offline";
  wikimedia: "connecting" | "live" | "offline";
};

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
  if (/PAGE|CATEGORY|LOG|LINK/.test(kind)) return "packet";
  if (/WITHDRAWN|NOTIFICATION|STATE/.test(kind)) return "spark";
  return "beam";
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

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const synthRef = useRef<EtherlaneSynth | null>(null);
  const voiceSpaceRef = useRef<EtherlaneVoiceSpace | null>(null);
  const localVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const selectedVoiceRef = useRef("");
  const lastVoiceRef = useRef(0);
  const pausedRef = useRef(false);
  const audioEnabledRef = useRef(false);
  const intensityRef = useRef(0.72);
  const voiceSpaceAmountRef = useRef(48);
  const sourceEmitRef = useRef({ ris: 0, atlas: 0, wikimedia: 0 });

  const [events, setEvents] = useState<SignalEvent[]>([]);
  const [sourceHealth, setSourceHealth] = useState<SourceHealth>({
    ris: "connecting",
    atlas: "connecting",
    wikimedia: "connecting",
  });
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [localVoices, setLocalVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState("");
  const [voiceSpace, setVoiceSpace] = useState(48);
  const [spokenPhrase, setSpokenPhrase] = useState("VOICE CHANNEL STANDBY");
  const [synthSettings, setSynthSettings] = useState<SynthSettings>(defaultSynthSettings);
  const [synthFrame, setSynthFrame] = useState<SynthFrame>({
    chord: "—",
    note: "—",
    source: "SYNTHETIC",
    energy: 0,
    voices: 0,
  });
  const [paused, setPaused] = useState(false);
  const [intensity, setIntensity] = useState(72);
  const [signalCount, setSignalCount] = useState(0);
  const [selected, setSelected] = useState<SignalEvent | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showSynth, setShowSynth] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

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
    const live =
      Number(sourceHealth.ris === "live") +
      Number(sourceHealth.atlas === "live") +
      Number(sourceHealth.wikimedia === "live");
    synthRef.current?.setHealth(live);
  }, [sourceHealth]);

  useEffect(
    () => () => {
      synthRef.current?.dispose();
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

  const speakSignal = useCallback((event: SignalEvent) => {
    if (!audioEnabledRef.current || !localVoiceRef.current || !window.speechSynthesis) return;
    const nowMs = performance.now();
    const cadence = 2300 - intensityRef.current * 900;
    if (nowMs - lastVoiceRef.current < cadence || window.speechSynthesis.speaking) return;
    lastVoiceRef.current = nowMs;

    const utterance = new SpeechSynthesisUtterance(event.spoken);
    utterance.voice = localVoiceRef.current;
    utterance.lang = localVoiceRef.current.lang;
    utterance.rate = 0.82 + clamp(event.magnitude / 100, 0, 1) * 0.26;
    utterance.pitch =
      event.tone === "coral" ? 0.86 : event.tone === "cyan" ? 1.06 : event.tone === "amber" ? 0.94 : 1;
    utterance.volume = 0.42 + intensityRef.current * 0.48;
    setSpokenPhrase(event.spoken.toUpperCase());
    voiceSpaceRef.current?.play(event.tone, event.magnitude, voiceSpaceAmountRef.current);
    window.speechSynthesis.speak(utterance);
  }, []);

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

      const particleBurst = 2 + Math.round(event.magnitude / 22);
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
      particlesRef.current = particlesRef.current.slice(-320);
      shockwavesRef.current.push({
        lane: (Math.random() - 0.5) * 0.78,
        depth: 0.05 + Math.random() * 0.18,
        life: 1,
        tone: event.tone,
        energy: event.magnitude,
        shape,
      });
      shockwavesRef.current = shockwavesRef.current.slice(-28);
      synthRef.current?.push(complete);
      speakSignal(complete);
    },
    [speakSignal],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let devicePixelRatio = 1;

    for (let index = 0; index < 74; index += 1) {
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
      devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
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

    const draw = () => {
      context.clearRect(0, 0, width, height);
      const time = Date.now() * 0.001;
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

      for (let rung = 0; rung < 22; rung += 1) {
        const phase = ((Date.now() * 0.00011 + rung / 22) % 1) ** 1.5;
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
        context.shadowBlur = 8 + point.scale * 8;
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
        context.shadowBlur = 18 * wave.life;
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

      animationFrame = requestAnimationFrame(draw);
    };

    draw();
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
    let risRetry: number | undefined;
    let atlasRetry: number | undefined;

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

    connectRis();
    connectAtlas();
    connectWikimedia();

    return () => {
      disposed = true;
      window.clearTimeout(risRetry);
      window.clearTimeout(atlasRetry);
      ris?.close();
      atlas?.close();
      wikimedia?.close();
    };
  }, [emitSignal]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const allOffline =
        sourceHealth.ris !== "live" &&
        sourceHealth.atlas !== "live" &&
        sourceHealth.wikimedia !== "live";
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
    if (localVoiceRef.current) {
      const utterance = new SpeechSynthesisUtterance("Etherlane. Data voice online.");
      utterance.voice = localVoiceRef.current;
      utterance.lang = localVoiceRef.current.lang;
      utterance.rate = 0.88;
      utterance.volume = 0.62;
      voiceSpaceRef.current.play("violet", 58, voiceSpaceAmountRef.current);
      window.speechSynthesis.speak(utterance);
      setSpokenPhrase("DATA VOICE ONLINE");
    }
  };

  const chooseVoice = (voiceUri: string) => {
    const voice = localVoices.find((candidate) => candidate.voiceURI === voiceUri) ?? null;
    localVoiceRef.current = voice;
    selectedVoiceRef.current = voice?.voiceURI ?? "";
    setSelectedVoiceUri(voice?.voiceURI ?? "");
    setVoiceAvailable(Boolean(voice));
  };

  const toggleMusic = async () => {
    if (!synthRef.current) {
      synthRef.current = new EtherlaneSynth((frame) => setSynthFrame(frame));
      synthRef.current.setSettings(synthSettings);
      synthRef.current.setIntensity(intensityRef.current);
      synthRef.current.setHealth(
        Number(sourceHealth.ris === "live") +
          Number(sourceHealth.atlas === "live") +
          Number(sourceHealth.wikimedia === "live"),
      );
    }
    if (musicEnabled) {
      synthRef.current.stop();
      setMusicEnabled(false);
      return;
    }
    const started = await synthRef.current.start();
    setMusicEnabled(started);
  };

  const updateSynth = <Key extends keyof SynthSettings>(key: Key, value: SynthSettings[Key]) => {
    setSynthSettings((current) => ({ ...current, [key]: value }));
  };

  const connectionLabel = useMemo(() => {
    const liveCount =
      Number(sourceHealth.ris === "live") +
      Number(sourceHealth.atlas === "live") +
      Number(sourceHealth.wikimedia === "live");
    if (liveCount === 3) return "3 LIVE SOURCES";
    if (liveCount === 1) return "1 LIVE SOURCE";
    if (liveCount === 2) return "2 LIVE SOURCES";
    return "SYNTHETIC FALLBACK";
  }, [sourceHealth]);

  const latest = events[0];
  const activeVoiceName =
    localVoices.find((voice) => voice.voiceURI === selectedVoiceUri)?.name ?? "BEST LOCAL VOICE";

  return (
    <main className="etherlane-shell">
      <canvas ref={canvasRef} className="signal-canvas" aria-hidden="true" />
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
              sourceHealth.ris === "live" ||
              sourceHealth.atlas === "live" ||
              sourceHealth.wikimedia === "live"
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
            Global routes shift. Measurements return. Public knowledge changes. The invisible
            internet becomes light, motion, a mutating data voice and generative music.
          </p>
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
          <small>{musicEnabled ? "AMBIENT SYNTH / LIVE" : audioEnabled ? "NOW VOICING" : "AUDIO CHANNELS"}</small>
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
            <small>AMBIENT SYNTH</small>
            <strong>{musicEnabled ? synthFrame.chord : "ENTER SYNTH"}</strong>
          </span>
        </button>

        <button
          type="button"
          className={`secondary-control voice-control ${audioEnabled ? "is-active" : ""}`}
          onClick={toggleAudio}
          aria-pressed={audioEnabled}
          disabled={!voiceAvailable}
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
              {!voiceAvailable ? "UNAVAILABLE" : audioEnabled ? "SPEAKING" : "OFF"}
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
        </div>
        <p>
          PUBLIC ROUTING + MEASUREMENT DATA ONLY <span>·</span> NO PRIVATE TRAFFIC
          <span>·</span> ZERO RETENTION
        </p>
        <span className="coordinates">52.37° N / 4.90° E</span>
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
                <small>{synthFrame.source} / {Math.round(synthFrame.energy)}% ENERGY</small>
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
                    <small>LOCAL TTS / SPACE TAIL</small>
                  </div>
                </div>
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
                <label className="synth-slider">
                  <span>VOICE SPACE <output>{voiceSpace}%</output></span>
                  <input
                    type="range"
                    min="0"
                    max="82"
                    value={voiceSpace}
                    onChange={(event) => setVoiceSpace(Number(event.target.value))}
                  />
                </label>
                <p>{activeVoiceName}. Processed locally; speech text never leaves this device.</p>
              </section>
            </div>

            <div className="signal-map">
              <div><i className="tone-violet" /><span>RIPE RIS</span><strong>BASS / ROUTE MOTIFS</strong></div>
              <div><i className="tone-cyan" /><span>RIPE ATLAS</span><strong>PULSE / HIGH VOICES</strong></div>
              <div><i className="tone-amber" /><span>WIKIMEDIA</span><strong>CHORDS / HARMONIC LIGHT</strong></div>
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
                  Public routing updates, global measurements and Wikimedia changes, translated
                  into beams, pulses, packets, auroras and event-driven shockwaves.
                </p>
              </section>
              <section>
                <span>02</span>
                <h3>WHAT YOU HEAR</h3>
                <p>
                  A polyphonic signal synth turns routing into bass motifs, latency into pulses and
                  public changes into harmony. The best local voice speaks normalized strings with a
                  synchronized convolution space tail, without sending text to a TTS service.
                </p>
              </section>
              <section>
                <span>03</span>
                <h3>WHAT WE KEEP</h3>
                <p>
                  Nothing. Signals exist briefly in memory, become light and sound, then
                  disappear. No database, no payload capture, no private traffic.
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
