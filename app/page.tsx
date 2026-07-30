"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SignalSource = "RIS" | "ATLAS" | "SYNTHETIC";
type SignalTone = "violet" | "cyan" | "amber" | "coral";

type SignalEvent = {
  id: string;
  source: SignalSource;
  kind: string;
  label: string;
  detail: string;
  tone: SignalTone;
  magnitude: number;
  timestamp: number;
};

type Particle = {
  lane: number;
  depth: number;
  speed: number;
  tone: SignalTone;
  size: number;
  drift: number;
};

type SourceHealth = {
  ris: "connecting" | "live" | "offline";
  atlas: "connecting" | "live" | "offline";
};

const tones: Record<SignalTone, { rgb: string; hex: string }> = {
  violet: { rgb: "151, 105, 255", hex: "#9769ff" },
  cyan: { rgb: "87, 228, 255", hex: "#57e4ff" },
  amber: { rgb: "255, 190, 91", hex: "#ffbe5b" },
  coral: { rgb: "255, 100, 105", hex: "#ff6469" },
};

const syntheticSignals = [
  ["ROUTE ANNOUNCED", "AS64512 → 198.51.100.0/24", "violet"],
  ["PING RETURNED", "41.8 ms · Europe", "cyan"],
  ["PATH SHIFT", "6 autonomous systems traversed", "amber"],
  ["ROUTE WITHDRAWN", "203.0.113.0/24 disappeared", "coral"],
  ["PROBE ONLINE", "Measurement node rejoined", "cyan"],
  ["KEEPALIVE", "Routing session sustained", "violet"],
] as const;

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

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const audioRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const lastNoteRef = useRef(0);
  const pausedRef = useRef(false);
  const audioEnabledRef = useRef(false);
  const intensityRef = useRef(0.72);
  const sourceEmitRef = useRef({ ris: 0, atlas: 0 });

  const [events, setEvents] = useState<SignalEvent[]>([]);
  const [sourceHealth, setSourceHealth] = useState<SourceHealth>({
    ris: "connecting",
    atlas: "connecting",
  });
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [intensity, setIntensity] = useState(72);
  const [signalCount, setSignalCount] = useState(0);
  const [selected, setSelected] = useState<SignalEvent | null>(null);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    intensityRef.current = intensity / 100;
  }, [intensity]);

  const playNote = useCallback((event: SignalEvent) => {
    if (!audioEnabledRef.current || !audioRef.current || !masterGainRef.current) return;
    const nowMs = performance.now();
    if (nowMs - lastNoteRef.current < 95) return;
    lastNoteRef.current = nowMs;

    const context = audioRef.current;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const pan = context.createStereoPanner();

    const base = {
      "ROUTE ANNOUNCED": 164.81,
      "ROUTE WITHDRAWN": 110,
      "PING RETURNED": 261.63,
      "PATH SHIFT": 196,
      KEEPALIVE: 329.63,
      "PROBE ONLINE": 392,
    }[event.kind] ?? 220;

    oscillator.type =
      event.tone === "coral" ? "sawtooth" : event.tone === "cyan" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(base * (0.98 + Math.random() * 0.04), now);
    if (event.tone === "coral") {
      oscillator.frequency.exponentialRampToValueAtTime(base * 0.56, now + 0.32);
    }

    filter.type = "lowpass";
    filter.frequency.value = 1100 + event.magnitude * 24;
    pan.pan.value = clamp((event.magnitude % 20) / 10 - 1, -0.8, 0.8);

    const peak = 0.016 + intensityRef.current * 0.024;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);

    oscillator.connect(filter).connect(pan).connect(gain).connect(masterGainRef.current);
    oscillator.start(now);
    oscillator.stop(now + 0.36);
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
      for (let index = 0; index < particleBurst; index += 1) {
        particlesRef.current.push({
          lane: (Math.random() - 0.5) * 1.7,
          depth: Math.random() * 0.1,
          speed: 0.0026 + Math.random() * 0.004 + event.magnitude / 42000,
          tone: event.tone,
          size: 0.65 + Math.random() * 1.45,
          drift: (Math.random() - 0.5) * 0.001,
        });
      }
      particlesRef.current = particlesRef.current.slice(-260);
      playNote(complete);
    },
    [playNote],
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
      const horizonY = height * 0.41;
      const perspective = Math.pow(depth, 1.7);
      return {
        x: width / 2 + lane * perspective * width * 0.48,
        y: horizonY + perspective * height * 0.66,
        scale: 0.16 + perspective * 1.7,
      };
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      const horizonY = height * 0.41;

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
        const phase = ((Date.now() * 0.00008 + rung / 22) % 1) ** 1.5;
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
          particle.lane += particle.drift;
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
        context.arc(point.x, point.y, Math.max(0.7, radius), 0, Math.PI * 2);
        context.fill();
      }

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
            data: { type: "UPDATE", socketOptions: { includeRaw: false } },
          }),
        );
      };

      ris.onmessage = (message) => {
        if (disposed || Date.now() - sourceEmitRef.current.ris < 170) return;
        try {
          const parsed = JSON.parse(String(message.data));
          if (parsed.type !== "ris_message" || parsed.data?.type !== "UPDATE") return;
          const data = parsed.data;
          const announcements = Array.isArray(data.announcements)
            ? data.announcements.flatMap((item: { prefixes?: string[] }) => item.prefixes ?? [])
            : [];
          const withdrawals = Array.isArray(data.withdrawals) ? data.withdrawals : [];
          const isWithdrawal = withdrawals.length > 0 && announcements.length === 0;
          const prefix = (isWithdrawal ? withdrawals[0] : announcements[0]) ?? "a public prefix";
          const pathLength = Array.isArray(data.path) ? data.path.length : 0;
          sourceEmitRef.current.ris = Date.now();
          emitSignal({
            source: "RIS",
            kind: isWithdrawal ? "ROUTE WITHDRAWN" : "ROUTE ANNOUNCED",
            label: isWithdrawal ? "A route left the global table" : "A route entered the global table",
            detail: `AS${data.peer_asn ?? "?"} · ${prefix}${pathLength ? ` · ${pathLength} hops` : ""}`,
            tone: isWithdrawal ? "coral" : pathLength > 7 ? "amber" : "violet",
            magnitude: clamp(24 + pathLength * 7, 25, 100),
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
            kind: "PING RETURNED",
            label: "A measurement crossed the network",
            detail: latency === null ? `Probe ${data.prb_id ?? "unknown"} responded` : `${latency.toFixed(1)} ms · probe ${data.prb_id ?? "?"}`,
            tone: latency !== null && latency > 150 ? "amber" : "cyan",
            magnitude: clamp(latency ?? 44, 16, 100),
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

    connectRis();
    connectAtlas();

    return () => {
      disposed = true;
      window.clearTimeout(risRetry);
      window.clearTimeout(atlasRetry);
      ris?.close();
      atlas?.close();
    };
  }, [emitSignal]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const bothOffline = sourceHealth.ris !== "live" && sourceHealth.atlas !== "live";
      if (!bothOffline) return;
      const [kind, detail, tone] =
        syntheticSignals[Math.floor(Math.random() * syntheticSignals.length)];
      emitSignal({
        source: "SYNTHETIC",
        kind,
        label: "Fallback signal for continuity",
        detail,
        tone,
        magnitude: 28 + Math.random() * 64,
      });
    }, 720);
    return () => window.clearInterval(interval);
  }, [emitSignal, sourceHealth]);

  useEffect(
    () => () => {
      audioRef.current?.close();
    },
    [],
  );

  const toggleAudio = async () => {
    if (!audioRef.current) {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      master.gain.value = 0.72;
      master.connect(compressor).connect(context.destination);
      audioRef.current = context;
      masterGainRef.current = master;
    }
    if (audioRef.current.state === "suspended") await audioRef.current.resume();
    setAudioEnabled((current) => !current);
  };

  const connectionLabel = useMemo(() => {
    const liveCount = Number(sourceHealth.ris === "live") + Number(sourceHealth.atlas === "live");
    if (liveCount === 2) return "2 LIVE SOURCES";
    if (liveCount === 1) return "1 LIVE SOURCE";
    return "SYNTHETIC FALLBACK";
  }, [sourceHealth]);

  const latest = events[0];

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
          <span className={`live-dot ${sourceHealth.ris === "live" || sourceHealth.atlas === "live" ? "is-live" : ""}`} />
          {connectionLabel}
        </div>

        <button className="text-button" type="button" onClick={() => setShowAbout(true)}>
          ABOUT THE SIGNAL
        </button>
      </header>

      <section id="experience" className="experience" aria-label="Live internet signal experience">
        <div className="hero-copy">
          <p className="eyebrow">PUBLIC INTERNET OBSERVATORY / LIVE</p>
          <h1>
            STAND INSIDE
            <span>THE FLOW.</span>
          </h1>
          <p className="hero-intro">
            Global routes shift. Measurements return. The invisible infrastructure of the
            internet becomes light, movement and sound.
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
          className={`primary-control ${audioEnabled ? "is-active" : ""}`}
          onClick={toggleAudio}
          aria-pressed={audioEnabled}
        >
          <span className="sound-bars" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            <small>SOUND</small>
            <strong>{audioEnabled ? "ON" : "ENTER AUDIO"}</strong>
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
                  Real public routing updates from RIPE RIS and global measurement results
                  from RIPE Atlas, translated into an ephemeral visual language.
                </p>
              </section>
              <section>
                <span>02</span>
                <h3>WHAT YOU HEAR</h3>
                <p>
                  Pitch, rhythm and space are generated from event type, route depth and
                  latency. Audio begins only when you choose to enter it.
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
