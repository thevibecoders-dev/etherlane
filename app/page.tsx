"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { APP_VERSION } from "./app-version";
import { ListeningSeaAudio } from "./listening-sea-audio";
import {
  SOURCE_COLORS,
  SOURCE_LABELS,
  clamp,
  eventColor,
  eventExplanation,
  hashText,
  mapEventToSound,
  type ListeningMode,
  type SeaEvent,
  type SeaSeverity,
  type SeaSource,
} from "./listening-sea-model";
import { SignalOracleVisual } from "./signal-oracle-visual";
import "./oracle.css";

type Health = "connecting" | "live" | "quiet" | "offline";
type SourceHealth = Record<Exclude<SeaSource, "SYNTHETIC">, Health>;

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

type PulseSnapshot = {
  generatedAt: string;
  outage?: {
    available: boolean;
    active: number;
    severity: "nominal" | "degraded" | "outage";
    label: string;
  };
  publications?: Array<{
    id: string;
    source: string;
    publishedAt: string | null;
    ageMinutes: number | null;
  }>;
};

type AudienceSnapshot = { visitors: number; listeners: number; version: string };

const EMPTY_INFRASTRUCTURE: InfrastructureSnapshot = {
  state: "unknown",
  risk: 0,
  monitorCoverage: "0/5",
  root: {
    state: "unknown",
    resolvedIdentities: 0,
    resolversResponding: 0,
    dnssecValidated: false,
    operationalInstances: null,
    description: "Connecting to public monitors",
  },
  services: [],
};

const DEFAULT_HEALTH: SourceHealth = {
  ROUTING: "connecting",
  MEASUREMENT: "connecting",
  KNOWLEDGE: "connecting",
  PUBLICATION: "connecting",
  INFRASTRUCTURE: "connecting",
};

const ORACLE_LAYERS: Array<{ source: SeaSource | "ALL"; name: string; meaning: string; color: string }> = [
  { source: "ALL", name: "ETHER", meaning: "all signals", color: "#d8e8ff" },
  { source: "MEASUREMENT", name: "PULSE", meaning: "latency + reach", color: SOURCE_COLORS.MEASUREMENT },
  { source: "KNOWLEDGE", name: "THOUGHT", meaning: "public knowledge", color: SOURCE_COLORS.KNOWLEDGE },
  { source: "PUBLICATION", name: "VOICE", meaning: "public feeds", color: SOURCE_COLORS.PUBLICATION },
  { source: "ROUTING", name: "MACHINE", meaning: "global routing", color: SOURCE_COLORS.ROUTING },
  { source: "INFRASTRUCTURE", name: "MEMORY", meaning: "network health", color: SOURCE_COLORS.INFRASTRUCTURE },
];

const WIKI_REGIONS: Record<string, [number, number]> = {
  enwiki: [51.5, -0.1],
  dewiki: [50.1, 8.7],
  nlwiki: [52.4, 4.9],
  frwiki: [48.9, 2.35],
  eswiki: [40.4, -3.7],
  jawiki: [35.7, 139.7],
  zhwiki: [22.3, 114.2],
  ptwiki: [-23.55, -46.6],
};

function coordinate(seedValue: string, salt: number): [number, number] {
  const seed = hashText(`${seedValue}:${salt}`);
  return [((seed % 12000) / 100) - 60, (((seed >>> 8) % 32000) / 100) - 160];
}

function severityForRisk(risk: number): SeaSeverity {
  return risk >= 72 ? "outage" : risk >= 28 ? "degraded" : risk > 0 ? "notice" : "nominal";
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatClock(timestamp: number) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function sourceStatus(health: SourceHealth) {
  const live = Object.values(health).filter((state) => state === "live").length;
  return { live, total: Object.keys(health).length };
}

export default function EtherlaneListeningSea() {
  const [entered, setEntered] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<ListeningMode>("drift");
  const [focusSource, setFocusSource] = useState<SeaSource | "ALL">("ALL");
  const [tunedSource, setTunedSource] = useState<SeaSource | "ALL">("ALL");
  const [events, setEvents] = useState<SeaEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SeaEvent | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [holding, setHolding] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [alignment, setAlignment] = useState<string | null>(null);
  const [sourceHealth, setSourceHealth] = useState<SourceHealth>(DEFAULT_HEALTH);
  const [infrastructure, setInfrastructure] = useState<InfrastructureSnapshot>(EMPTY_INFRASTRUCTURE);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audience, setAudience] = useState<AudienceSnapshot>({ visitors: 0, listeners: 0, version: APP_VERSION });
  const [sessionStartedAt, setSessionStartedAt] = useState(0);
  const [sessionMinutes, setSessionMinutes] = useState(0);

  const audioRef = useRef<ListeningSeaAudio | null>(null);
  const soundRef = useRef(false);
  const modeRef = useRef<ListeningMode>(mode);
  const focusRef = useRef<SeaSource | "ALL">("ALL");
  const pausedRef = useRef(false);
  const latestRealEventAt = useRef(0);
  const sourceEmitAt = useRef<Record<string, number>>({});
  const audienceSession = useRef("");
  const seenPublications = useRef(new Set<string>());
  const infrastructureSignature = useRef("");
  const alignmentSignature = useRef("");
  const alignmentTimerRef = useRef(0);
  const lastPointerUpdate = useRef(0);

  const status = useMemo(() => sourceStatus(sourceHealth), [sourceHealth]);
  const latestEvent = events[0];

  useEffect(() => { soundRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => {
    modeRef.current = mode;
    audioRef.current?.setMode(mode);
  }, [mode]);
  useEffect(() => { focusRef.current = focusSource; }, [focusSource]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => {
    if (!entered) return;
    let lastUpdate = 0;
    const orient = (orientationEvent: DeviceOrientationEvent) => {
      const now = performance.now();
      if (now - lastUpdate < 110) return;
      lastUpdate = now;
      const x = clamp((orientationEvent.gamma ?? 0) / 42, -1, 1);
      const y = clamp((orientationEvent.beta ?? 38) / 75 - 0.5, -1, 1);
      setTilt({ x, y });
    };
    window.addEventListener("deviceorientation", orient, { passive: true });
    return () => window.removeEventListener("deviceorientation", orient);
  }, [entered]);

  useEffect(() => {
    const recent = events.filter((candidate) => candidate.live && Date.now() - candidate.timestamp < 4200);
    const distinct = [...new Set(recent.map((candidate) => candidate.source))].filter((source) => source !== "SYNTHETIC");
    if (distinct.length < 3) return;
    const signature = distinct.sort().join(":");
    if (alignmentSignature.current === signature) return;
    alignmentSignature.current = signature;
    const names = distinct.slice(0, 3).map((source) => ORACLE_LAYERS.find((layer) => layer.source === source)?.name ?? source);
    setAlignment(names.join(" + "));
    window.clearTimeout(alignmentTimerRef.current);
    alignmentTimerRef.current = window.setTimeout(() => setAlignment(null), 5600);
  }, [events]);

  const emit = useCallback((event: Omit<SeaEvent, "id" | "timestamp"> & { id?: string; timestamp?: number }) => {
    const normalized: SeaEvent = {
      ...event,
      id: event.id ?? makeId(event.source.toLowerCase()),
      timestamp: event.timestamp ?? Date.now(),
    };
    if (normalized.live) latestRealEventAt.current = Date.now();
    setEvents((current) => [normalized, ...current.filter((candidate) => candidate.id !== normalized.id)].slice(0, 16));
    if (
      soundRef.current &&
      !pausedRef.current &&
      (modeRef.current !== "focus" || focusRef.current === "ALL" || focusRef.current === normalized.source)
    ) {
      audioRef.current?.play(normalized);
    }
  }, []);

  const enter = async () => {
    if (!audioRef.current) audioRef.current = new ListeningSeaAudio();
    await audioRef.current.start();
    audioRef.current.setMode(mode);
    setSoundEnabled(true);
    setEntered(true);
    setSessionStartedAt(Date.now());
  };

  const toggleSound = async () => {
    if (soundRef.current) {
      await audioRef.current?.stop();
      audioRef.current = null;
      setSoundEnabled(false);
      return;
    }
    audioRef.current = new ListeningSeaAudio();
    await audioRef.current.start();
    audioRef.current.setMode(modeRef.current);
    audioRef.current.setInfrastructureRisk(infrastructure.risk);
    setSoundEnabled(true);
  };

  useEffect(() => {
    let frame = 0;
    let lastPaint = 0;
    const draw = (time: number) => {
      if (time - lastPaint > 70) {
        setAudioLevel(audioRef.current?.frame().level ?? 0);
        lastPaint = time;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let disposed = false;
    let ris: WebSocket | null = null;
    let atlas: WebSocket | null = null;
    let wiki: EventSource | null = null;
    let risRetry = 0;
    let atlasRetry = 0;

    const connectRis = () => {
      if (disposed) return;
      setSourceHealth((current) => ({ ...current, ROUTING: "connecting" }));
      ris = new WebSocket("wss://ris-live.ripe.net/v1/ws/?client=etherlane-listening-sea");
      ris.onopen = () => {
        if (disposed || !ris) return;
        setSourceHealth((current) => ({ ...current, ROUTING: "live" }));
        ris.send(JSON.stringify({ type: "ris_subscribe", data: { socketOptions: { includeRaw: false } } }));
      };
      ris.onmessage = (message) => {
        try {
          const parsed = JSON.parse(String(message.data));
          if (parsed.type !== "ris_message" || parsed.data?.type !== "UPDATE") return;
          if (Date.now() - (sourceEmitAt.current.ROUTING ?? 0) < 480) return;
          const data = parsed.data;
          const announcements = Array.isArray(data.announcements)
            ? data.announcements.flatMap((entry: { prefixes?: string[] }) => entry.prefixes ?? [])
            : [];
          const withdrawals = Array.isArray(data.withdrawals) ? data.withdrawals : [];
          if (!announcements.length && !withdrawals.length) return;
          sourceEmitAt.current.ROUTING = Date.now();
          const withdrawn = withdrawals.length > 0 && announcements.length === 0;
          const exchanged = withdrawals.length > 0 && announcements.length > 0;
          const prefix = String((withdrawn ? withdrawals[0] : announcements[0]) ?? "public prefix");
          const hops = Array.isArray(data.path) ? data.path.length : undefined;
          const origin = coordinate(String(data.peer_asn ?? prefix), 1);
          const destination = coordinate(prefix, 2);
          emit({
            source: "ROUTING",
            kind: exchanged ? "ROUTE EXCHANGE" : withdrawn ? "ROUTE WITHDRAWAL" : "ROUTE ANNOUNCEMENT",
            title: withdrawn ? "A route left the global table" : exchanged ? "Routes entered and left together" : "A route entered the global table",
            detail: `AS${data.peer_asn ?? "?"} · ${prefix}${hops ? ` · ${hops} AS hops` : ""}`,
            magnitude: clamp(24 + (hops ?? 4) * 7 + (withdrawn ? 16 : 0), 24, 100),
            confidence: 96,
            severity: withdrawn ? "notice" : "nominal",
            live: true,
            latitude: origin[0],
            longitude: origin[1],
            destinationLatitude: destination[0],
            destinationLongitude: destination[1],
            hops,
          });
        } catch { /* malformed public update: discard */ }
      };
      ris.onerror = () => ris?.close();
      ris.onclose = () => {
        if (disposed) return;
        setSourceHealth((current) => ({ ...current, ROUTING: "offline" }));
        risRetry = window.setTimeout(connectRis, 5000);
      };
    };

    const connectAtlas = () => {
      if (disposed) return;
      setSourceHealth((current) => ({ ...current, MEASUREMENT: "connecting" }));
      atlas = new WebSocket("wss://atlas-stream.ripe.net/stream/?client=etherlane-listening-sea");
      atlas.onopen = () => {
        if (disposed || !atlas) return;
        setSourceHealth((current) => ({ ...current, MEASUREMENT: "live" }));
        atlas.send(JSON.stringify(["atlas_subscribe", { streamType: "result", msm: 1001 }]));
      };
      atlas.onmessage = (message) => {
        try {
          const [type, data] = JSON.parse(String(message.data));
          if (type !== "atlas_result" || Date.now() - (sourceEmitAt.current.MEASUREMENT ?? 0) < 620) return;
          const readings = Array.isArray(data.result)
            ? data.result.map((sample: { rtt?: number }) => sample.rtt).filter((value: unknown): value is number => typeof value === "number")
            : [];
          const rtt = readings.length ? readings.reduce((sum: number, value: number) => sum + value, 0) / readings.length : null;
          sourceEmitAt.current.MEASUREMENT = Date.now();
          const origin = coordinate(String(data.prb_id ?? "probe"), 3);
          const destination = coordinate(String(data.msm_id ?? "measurement"), 4);
          emit({
            source: "MEASUREMENT",
            kind: rtt === null ? "PROBE RESPONSE" : rtt > 220 ? "HIGH LATENCY" : rtt < 25 ? "FAST RETURN" : "PING RETURN",
            title: "A measurement crossed the network",
            detail: rtt === null ? `Probe ${data.prb_id ?? "?"} responded` : `${rtt.toFixed(1)} ms · public probe ${data.prb_id ?? "?"}`,
            magnitude: clamp(rtt ?? 42, 18, 100),
            confidence: readings.length ? 94 : 72,
            severity: rtt !== null && rtt > 220 ? "degraded" : rtt !== null && rtt > 120 ? "notice" : "nominal",
            live: true,
            latitude: origin[0],
            longitude: origin[1],
            destinationLatitude: destination[0],
            destinationLongitude: destination[1],
            rtt: rtt ?? undefined,
          });
        } catch { /* malformed public result: discard */ }
      };
      atlas.onerror = () => atlas?.close();
      atlas.onclose = () => {
        if (disposed) return;
        setSourceHealth((current) => ({ ...current, MEASUREMENT: "offline" }));
        atlasRetry = window.setTimeout(connectAtlas, 6200);
      };
    };

    const connectWiki = () => {
      setSourceHealth((current) => ({ ...current, KNOWLEDGE: "connecting" }));
      wiki = new EventSource("https://stream.wikimedia.org/v2/stream/recentchange");
      wiki.onopen = () => setSourceHealth((current) => ({ ...current, KNOWLEDGE: "live" }));
      wiki.onmessage = (message) => {
        try {
          if (Date.now() - (sourceEmitAt.current.KNOWLEDGE ?? 0) < 900) return;
          const data = JSON.parse(String(message.data));
          if (data.bot === true) return;
          sourceEmitAt.current.KNOWLEDGE = Date.now();
          const oldLength = Number(data.length?.old ?? 0);
          const newLength = Number(data.length?.new ?? oldLength);
          const delta = newLength - oldLength;
          const project = String(data.wiki ?? "wikimedia");
          const origin = WIKI_REGIONS[project] ?? coordinate(project, 5);
          const kind = data.type === "new" ? "PAGE CREATED" : data.type === "log" ? "PUBLIC LOG" : "KNOWLEDGE EDIT";
          emit({
            source: "KNOWLEDGE",
            kind,
            title: "Public knowledge changed",
            detail: `${project} · ${delta >= 0 ? "+" : ""}${delta} bytes`,
            magnitude: clamp(20 + Math.log10(Math.abs(delta) + 1) * 19, 20, 92),
            confidence: 99,
            severity: delta < -4000 ? "notice" : "nominal",
            live: true,
            latitude: origin[0],
            longitude: origin[1],
            destinationLatitude: 52.37,
            destinationLongitude: 4.9,
            persistence: data.type === "new" ? 1.8 : 0.9,
          });
        } catch { /* malformed public change: discard */ }
      };
      wiki.onerror = () => setSourceHealth((current) => ({ ...current, KNOWLEDGE: "offline" }));
    };

    connectRis();
    connectAtlas();
    connectWiki();
    return () => {
      disposed = true;
      window.clearTimeout(risRetry);
      window.clearTimeout(atlasRetry);
      ris?.close();
      atlas?.close();
      wiki?.close();
    };
  }, [emit]);

  useEffect(() => {
    let disposed = false;
    let timer = 0;
    const poll = async () => {
      try {
        const response = await fetch("/api/infrastructure", { cache: "no-store" });
        if (!response.ok) throw new Error("monitor unavailable");
        const snapshot = (await response.json()) as InfrastructureSnapshot;
        if (disposed) return;
        setInfrastructure(snapshot);
        setSourceHealth((current) => ({ ...current, INFRASTRUCTURE: "live" }));
        audioRef.current?.setInfrastructureRisk(snapshot.risk);
        const signature = `${snapshot.state}:${snapshot.risk}:${snapshot.services.map((service) => `${service.name}:${service.state}`).join("|")}`;
        if (signature !== infrastructureSignature.current) {
          infrastructureSignature.current = signature;
          emit({
            source: "INFRASTRUCTURE",
            kind: snapshot.state === "outage" ? "CORE OUTAGE" : snapshot.state === "degraded" ? "CORE DEGRADATION" : "CORE NOMINAL",
            title: snapshot.state === "operational" ? "The monitored Internet core is holding" : "Important infrastructure changed state",
            detail: `Risk ${snapshot.risk}% · ${snapshot.monitorCoverage} monitors · root ${snapshot.root.state}`,
            magnitude: Math.max(18, snapshot.risk),
            confidence: snapshot.state === "unknown" ? 35 : 90,
            severity: severityForRisk(snapshot.risk),
            live: true,
            latitude: 52.37,
            longitude: 4.9,
            destinationLatitude: 1.35,
            destinationLongitude: 103.82,
            persistence: snapshot.risk >= 72 ? 5.4 : snapshot.risk >= 28 ? 3.2 : 1.1,
          });
        }
      } catch {
        if (!disposed) setSourceHealth((current) => ({ ...current, INFRASTRUCTURE: "offline" }));
      }
      if (!disposed) timer = window.setTimeout(poll, 45_000);
    };
    void poll();
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [emit]);

  useEffect(() => {
    let disposed = false;
    let timer = 0;
    const poll = async () => {
      try {
        const response = await fetch("/api/pulse", { cache: "no-store" });
        if (!response.ok) throw new Error("pulse unavailable");
        const snapshot = (await response.json()) as PulseSnapshot;
        if (disposed) return;
        setSourceHealth((current) => ({ ...current, PUBLICATION: "live" }));
        const publication = snapshot.publications?.find((item) => !seenPublications.current.has(item.id));
        if (publication) {
          seenPublications.current.add(publication.id);
          emit({
            id: `publication-${publication.id}`,
            source: "PUBLICATION",
            kind: "PUBLIC FEED UPDATE",
            title: "A publication entered a public syndication feed",
            detail: `${publication.source}${publication.ageMinutes === null ? "" : ` · ${publication.ageMinutes} minutes old`}`,
            magnitude: clamp(34 + (publication.ageMinutes === null ? 0 : Math.max(0, 60 - publication.ageMinutes) * 0.35), 30, 70),
            confidence: 86,
            severity: "nominal",
            live: true,
            latitude: 51.5,
            longitude: -0.1,
            destinationLatitude: 37.77,
            destinationLongitude: -122.42,
            persistence: 1.6,
          });
        }
        if (snapshot.outage?.available && snapshot.outage.active > 0) {
          emit({
            id: `ioda-${snapshot.generatedAt.slice(0, 16)}-${snapshot.outage.active}`,
            source: "INFRASTRUCTURE",
            kind: "IODA OUTAGE OBSERVATION",
            title: snapshot.outage.label,
            detail: `${snapshot.outage.active} active near-real-time outage signal${snapshot.outage.active === 1 ? "" : "s"}`,
            magnitude: snapshot.outage.severity === "outage" ? 94 : 62,
            confidence: 84,
            severity: snapshot.outage.severity,
            live: true,
            latitude: 33.75,
            longitude: -84.39,
            destinationLatitude: 0,
            destinationLongitude: 0,
            persistence: snapshot.outage.severity === "outage" ? 5.5 : 3,
          });
        }
      } catch {
        if (!disposed) setSourceHealth((current) => ({ ...current, PUBLICATION: "offline" }));
      }
      if (!disposed) timer = window.setTimeout(poll, 90_000);
    };
    void poll();
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [emit]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (Date.now() - latestRealEventAt.current < 9000) return;
      emit({
        source: "SYNTHETIC",
        kind: "QUIET FALLBACK",
        title: "The public streams are quiet or reconnecting",
        detail: "Clearly labelled fallback · not a live Internet observation",
        magnitude: 18,
        confidence: 100,
        severity: "nominal",
        live: false,
        latitude: 0,
        longitude: 0,
        destinationLatitude: 0,
        destinationLongitude: 24,
        persistence: 2.4,
      });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [emit]);

  useEffect(() => {
    if (!entered) return;
    if (!audienceSession.current) audienceSession.current = crypto.randomUUID();
    let disposed = false;
    let timer = 0;
    const heartbeat = async () => {
      try {
        const response = await fetch("/api/audience", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: audienceSession.current, listening: soundRef.current }),
        });
        if (response.ok && !disposed) setAudience((await response.json()) as AudienceSnapshot);
      } catch { /* audience is optional and ephemeral */ }
      if (!disposed) timer = window.setTimeout(heartbeat, 20_000);
    };
    void heartbeat();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      if (audienceSession.current) {
        void fetch("/api/audience", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: audienceSession.current }),
          keepalive: true,
        });
      }
    };
  }, [entered, soundEnabled]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedEvent(null);
        setShowAbout(false);
      }
      if (event.code === "Space" && entered && !selectedEvent && !showAbout) {
        event.preventDefault();
        setPaused((current) => !current);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [entered, selectedEvent, showAbout]);

  useEffect(() => {
    if (!sessionStartedAt) return;
    const update = () => setSessionMinutes(Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 60_000)));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [sessionStartedAt]);

  useEffect(() => () => {
    window.clearTimeout(alignmentTimerRef.current);
    void audioRef.current?.stop();
  }, []);

  const toggleListening = () => {
    if (holding) {
      setHolding(false);
      setFocusSource("ALL");
      setMode("drift");
      return;
    }
    setHolding(true);
    setFocusSource(tunedSource);
    setMode("focus");
  };

  const chooseLayer = (source: SeaSource | "ALL") => {
    setTunedSource(source);
    if (holding) setFocusSource(source);
  };

  const moveOracle = (pointerEvent: ReactPointerEvent<HTMLElement>) => {
    const now = performance.now();
    if (now - lastPointerUpdate.current < 40) return;
    lastPointerUpdate.current = now;
    const bounds = pointerEvent.currentTarget.getBoundingClientRect();
    setTilt({
      x: clamp(((pointerEvent.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5) * 2, -1, 1),
      y: clamp(((pointerEvent.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5) * 2, -1, 1),
    });
  };

  const mapping = selectedEvent ? mapEventToSound(selectedEvent) : null;
  const liveMapping = latestEvent ? mapEventToSound(latestEvent) : null;
  const tunedLayer = ORACLE_LAYERS.find((layer) => layer.source === tunedSource) ?? ORACLE_LAYERS[0];

  return (
    <main
      className={`oracle-shell ${entered ? "is-entered" : "is-gated"} ${infrastructure.risk >= 72 ? "is-alert" : ""}`}
      style={{ "--oracle-color": tunedLayer.color } as CSSProperties}
    >
      <SignalOracleVisual
        active={entered}
        paused={paused}
        holding={holding}
        layer={tunedSource}
        event={latestEvent}
        infrastructureRisk={infrastructure.risk}
        audioLevel={audioLevel}
        tilt={tilt}
        alignment={Boolean(alignment)}
      />
      <div className="oracle-grain" aria-hidden="true" />

      {!entered && (
        <section className="oracle-gate" aria-labelledby="entry-title">
          <div className="oracle-gate-inner">
            <div className="oracle-sigil" aria-hidden="true" />
            <p className="oracle-eyebrow">A SIGNAL INSTRUMENT FOR THE PUBLIC INTERNET</p>
            <h1 id="entry-title">ETHERLANE</h1>
            <h2>Tune into the living Internet.</h2>
            <p className="oracle-gate-copy">
              Choose a layer of the public Internet, press Listen, and watch its live observations
              become resonance, light and space. Every sound has an explainable source.
            </p>
            <button className="oracle-enter" type="button" onClick={() => void enter()}>Open the Signal Oracle</button>
            <div className="oracle-gate-notes">
              <span>Headphones recommended</span><span>Touch + mouse</span><span>Zero retention</span>
            </div>
            <p className="oracle-truth">A translation of public measurements — never intercepted private traffic.</p>
          </div>
        </section>
      )}

      {entered && (
        <>
          <header className="oracle-header">
            <button className="oracle-brand" type="button" onClick={() => setShowAbout(true)} aria-label="About Etherlane">
              <strong>ETHERLANE</strong><small>THE SIGNAL ORACLE</small>
            </button>
            <div className="oracle-live" aria-live="polite">
              <i className={status.live > 0 ? "is-live" : ""} />
              <span>{status.live > 0 ? `${status.live}/${status.total} OBSERVATORIES LIVE` : "RECONNECTING"}</span>
            </div>
            <div className="oracle-actions">
              <button type="button" onClick={() => void toggleSound()} aria-pressed={soundEnabled} aria-label={soundEnabled ? "Mute sound" : "Enable sound"}>
                <span className={`sound-glyph ${soundEnabled ? "is-on" : ""}`}><i /><i /><i /></span>
              </button>
              <button type="button" onClick={() => setPaused((current) => !current)} aria-pressed={paused} aria-label={paused ? "Resume" : "Pause"}>
                <span className={paused ? "play-glyph" : "pause-glyph"} />
              </button>
              <button type="button" onClick={() => setShowAbout(true)} aria-label="Open information"><span className="info-glyph">i</span></button>
            </div>
          </header>

          <div className="oracle-workspace" onPointerMove={moveOracle}>
          <aside className="oracle-feed" aria-label="Recent public signals">
            <div className="oracle-panel-heading"><span>LIVE SIGNALS</span><strong>{events.filter((item) => item.live).length}</strong></div>
            <div className="oracle-feed-list">
              {events.slice(0, 6).map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedEvent(item)}>
                  <i style={{ background: eventColor(item) }} />
                  <span><strong>{item.kind}</strong><small>{item.title}</small></span>
                  <time>{formatClock(item.timestamp)}</time>
                </button>
              ))}
              {!events.length && <p>Waiting for public observations…</p>}
            </div>
            <p className="oracle-panel-note">Select any signal to see exactly how it becomes sound.</p>
          </aside>

          <section className="oracle-stage">

          <div className="oracle-signal" aria-live="polite">
            <p className="oracle-signal-label">RECEIVING NOW</p>
            {latestEvent ? (
              <button type="button" onClick={() => setSelectedEvent(latestEvent)}>
                <strong>{latestEvent.kind}</strong>
                <span>{latestEvent.title}</span>
                <small>{latestEvent.live ? SOURCE_LABELS[latestEvent.source] : "LABELLED FALLBACK"} · {formatClock(latestEvent.timestamp)}</small>
              </button>
            ) : (
              <div className="oracle-waiting">Opening the public observatories</div>
            )}
          </div>

          {alignment && (
            <div className="oracle-alignment" aria-live="polite">
              <strong>SIGNAL ALIGNMENT</strong><span>{alignment} briefly share one resonance</span>
            </div>
          )}

          <button
            className={`oracle-resonator ${holding ? "is-holding" : ""}`}
            type="button"
            onClick={toggleListening}
            aria-label={holding ? `Release ${tunedLayer.name} and hear all signals` : `Listen only to ${tunedLayer.name}`}
            aria-pressed={holding}
          >
            <span>{holding ? `RELEASE ${tunedLayer.name}` : `LISTEN TO ${tunedLayer.name}`}</span>
          </button>

          <div className="oracle-tuner">
            <p className="oracle-tuner-status"><span>TUNED TO</span><strong>{tunedLayer.name}</strong><span>{tunedLayer.meaning}</span></p>
            <nav className="oracle-layers" aria-label="Signal layer">
              {ORACLE_LAYERS.map((layer) => (
                <button
                  key={layer.source}
                  type="button"
                  className={tunedSource === layer.source ? "is-active" : ""}
                  onClick={() => chooseLayer(layer.source)}
                  aria-pressed={tunedSource === layer.source}
                >
                  <i style={{ color: layer.color }} />{layer.name}
                </button>
              ))}
            </nav>
            <p className="oracle-hint">1. CHOOSE A LAYER · 2. PRESS LISTEN · SELECT AN EVENT TO UNDERSTAND IT</p>
          </div>
          </section>

          <aside className="oracle-science" aria-label="Current sonification mapping">
            <div className="oracle-panel-heading"><span>HOW IT SOUNDS</span><strong>{tunedLayer.name}</strong></div>
            <p className="oracle-layer-description">
              {tunedLayer.name === "ETHER" ? "All public observatories share the resonator." : `${tunedLayer.name} isolates ${tunedLayer.meaning}.`}
            </p>
            {latestEvent && liveMapping ? (
              <>
                <div className="oracle-science-event"><i style={{ background: eventColor(latestEvent) }} /><span>{latestEvent.kind}</span></div>
                <dl className="oracle-mapping-list">
                  <div><dt>Pitch</dt><dd>{liveMapping.frequency.toFixed(1)} Hz</dd><small>stable D minor field</small></div>
                  <div><dt>Velocity</dt><dd>{Math.round(liveMapping.velocity * 100)}%</dd><small>event magnitude</small></div>
                  <div><dt>Filter</dt><dd>{Math.round(liveMapping.cutoff)} Hz</dd><small>{latestEvent.confidence}% confidence</small></div>
                  <div><dt>Reflection</dt><dd>{Math.round(liveMapping.delay * 1000)} ms</dd><small>measured latency</small></div>
                  <div><dt>Space</dt><dd>{Math.round(liveMapping.wet * 100)}%</dd><small>geographic distance</small></div>
                  <div><dt>Length</dt><dd>{liveMapping.duration.toFixed(1)} s</dd><small>event persistence</small></div>
                </dl>
                <button className="oracle-explain" type="button" onClick={() => setSelectedEvent(latestEvent)}>Explain this signal</button>
              </>
            ) : <p className="oracle-panel-note">The mapping appears when the first observation arrives.</p>}
            <div className="oracle-core-health"><span>CORE RISK</span><strong>{infrastructure.risk}%</strong><small>{infrastructure.monitorCoverage} monitors</small></div>
          </aside>
          </div>

          <footer className="oracle-footer">
            <span>LIVE EVENTS <strong>{events.filter((event) => event.live).length}</strong></span>
            <span>LISTENERS <strong>{audience.listeners}</strong></span>
            <span>SESSION <strong>{sessionMinutes}m</strong></span>
            <span className="retention">ZERO RETENTION · MEMORY ONLY</span>
            <span>V{audience.version}</span>
          </footer>
        </>
      )}

      {selectedEvent && mapping && (
        <div className="sea-overlay" role="dialog" aria-modal="true" aria-labelledby="event-title">
          <button className="overlay-dismiss" type="button" onClick={() => setSelectedEvent(null)} aria-label="Close event inspector" />
          <article className="event-inspector">
            <button className="close-inspector" type="button" onClick={() => setSelectedEvent(null)} aria-label="Close">×</button>
            <p className="inspector-source"><i style={{ background: eventColor(selectedEvent) }} />{SOURCE_LABELS[selectedEvent.source]} · {selectedEvent.live ? "LIVE OBSERVATION" : "SYNTHETIC FALLBACK"}</p>
            <h2 id="event-title">{selectedEvent.kind}</h2>
            <p className="inspector-title">{selectedEvent.title}</p>
            <p className="inspector-detail">{selectedEvent.detail}</p>
            <div className="mapping-grid">
              <div><span>PITCH</span><strong>{mapping.frequency.toFixed(1)} Hz</strong><small>stable D minor field</small></div>
              <div><span>VELOCITY</span><strong>{Math.round(mapping.velocity * 100)}%</strong><small>log event magnitude</small></div>
              <div><span>LENGTH</span><strong>{mapping.duration.toFixed(1)} s</strong><small>event persistence</small></div>
              <div><span>FILTER</span><strong>{Math.round(mapping.cutoff)} Hz</strong><small>observation confidence</small></div>
              <div><span>REFLECTION</span><strong>{Math.round(mapping.delay * 1000)} ms</strong><small>measured or bounded RTT</small></div>
              <div><span>SPACE</span><strong>{Math.round(mapping.wet * 100)}%</strong><small>geographic distance</small></div>
            </div>
            <p className="mapping-explanation">{eventExplanation(selectedEvent, mapping)}</p>
            <div className="event-meta"><span>{formatClock(selectedEvent.timestamp)}</span><span>{selectedEvent.confidence}% CONFIDENCE</span><span>NOT STORED</span></div>
          </article>
        </div>
      )}

      {showAbout && (
        <div className="sea-overlay" role="dialog" aria-modal="true" aria-labelledby="about-title">
          <button className="overlay-dismiss" type="button" onClick={() => setShowAbout(false)} aria-label="Close information" />
          <article className="about-panel">
            <button className="close-inspector" type="button" onClick={() => setShowAbout(false)} aria-label="Close">×</button>
            <p className="eyebrow">THE SIGNAL ORACLE</p>
            <h2 id="about-title">How does it listen?</h2>
            <p>
              Etherlane turns this device into an instrument for public Internet observations. Choose a layer and press Listen to isolate it; select any event to inspect its translation. No private traffic is intercepted.
            </p>
            <div className="about-sections">
              <section><span>THE RESONATOR</span><p>A fixed low D field remains stable. Magnitude shapes movement, confidence opens the filter, latency becomes reflection and distance becomes space.</p></section>
              <section><span>THE LAYERS</span><p>Pulse is reachability, Thought is public knowledge, Voice is syndication, Machine is routing and Memory is infrastructure health.</p></section>
              <section><span>ALIGNMENTS</span><p>When several independent public sources change together, the membrane briefly combines their light and resonance into a rare alignment.</p></section>
              <section><span>ZERO RETENTION</span><p>Raw events exist only in memory long enough to be translated. No packet payloads, browsing history, profiles, cookies or event database.</p></section>
            </div>
            <div className="about-status">
              <span>ROOT SYSTEM <strong>{infrastructure.root.state}</strong></span>
              <span>MONITOR COVERAGE <strong>{infrastructure.monitorCoverage}</strong></span>
              <span>RISK <strong>{infrastructure.risk}%</strong></span>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
