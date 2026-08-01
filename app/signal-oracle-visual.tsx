"use client";

import { useEffect, useRef } from "react";
import { SOURCE_COLORS, eventColor, hashText, type SeaEvent, type SeaSource } from "./listening-sea-model";

type SignalOracleVisualProps = {
  active: boolean;
  paused: boolean;
  holding: boolean;
  layer: SeaSource | "ALL";
  event?: SeaEvent;
  infrastructureRisk: number;
  audioLevel: number;
  tilt: { x: number; y: number };
  alignment: boolean;
};

type Spark = { angle: number; radius: number; speed: number; size: number; phase: number };

function seeded(seed: number, salt = 0) {
  const value = Math.sin(seed * 79.17 + salt * 31.91) * 43758.5453;
  return value - Math.floor(value);
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function SignalOracleVisual(props: SignalOracleVisualProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(props);
  const eventBornRef = useRef(0);
  const eventSeedRef = useRef(1);

  useEffect(() => { stateRef.current = props; }, [props]);
  useEffect(() => {
    if (!props.event) return;
    eventBornRef.current = performance.now();
    eventSeedRef.current = hashText(props.event.id);
  }, [props.event]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sparks: Spark[] = Array.from({ length: 54 }, (_, index) => ({
      angle: seeded(index, 2) * Math.PI * 2,
      radius: 0.54 + seeded(index, 4) * 0.7,
      speed: 0.08 + seeded(index, 6) * 0.2,
      size: 0.35 + seeded(index, 8) * 1.1,
      phase: seeded(index, 10) * Math.PI * 2,
    }));
    let width = 1;
    let height = 1;
    let ratio = 1;
    let frame = 0;
    let lastPaint = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      ratio = Math.min(window.devicePixelRatio || 1, 1.45);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      if (time - lastPaint < (reduced.matches ? 90 : 32)) return;
      lastPaint = time;
      const state = stateRef.current;
      const event = state.event;
      const eventAge = Math.min(1, (time - eventBornRef.current) / 5200);
      const eventEnergy = event ? event.magnitude / 100 : 0.12;
      const layerColor = state.layer === "ALL" ? "#d8e8ff" : SOURCE_COLORS[state.layer];
      const color = hexToRgb(state.holding ? layerColor : event ? eventColor(event) : layerColor);
      const cx = width * (0.5 + state.tilt.x * 0.045);
      const cy = height * (0.5 + state.tilt.y * 0.025);
      const baseRadius = Math.min(width, height) * (width < 760 ? 0.285 : 0.23);

      const background = context.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.78);
      background.addColorStop(0, state.alignment ? "#111237" : "#071021");
      background.addColorStop(0.38, "#030814");
      background.addColorStop(1, state.infrastructureRisk > 65 ? "#110209" : "#010207");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      context.save();
      context.globalCompositeOperation = "lighter";
      for (let ring = 0; ring < 5; ring += 1) {
        const radius = baseRadius * (0.82 + ring * 0.17 + Math.sin(time * 0.00032 + ring) * 0.012);
        context.beginPath();
        context.ellipse(cx, cy, radius, radius * (0.86 + ring * 0.018), state.tilt.x * 0.08, 0, Math.PI * 2);
        context.strokeStyle = `rgba(${color.r},${color.g},${color.b},${0.12 - ring * 0.016})`;
        context.lineWidth = ring === 0 ? 0.9 : 0.45;
        context.stroke();
      }

      const membrane = context.createRadialGradient(cx - baseRadius * 0.18, cy - baseRadius * 0.22, 0, cx, cy, baseRadius * 1.12);
      membrane.addColorStop(0, `rgba(${color.r + Math.round((255 - color.r) * 0.22)},${color.g + Math.round((255 - color.g) * 0.22)},255,${0.17 + state.audioLevel * 0.1})`);
      membrane.addColorStop(0.38, `rgba(${color.r},${color.g},${color.b},0.075)`);
      membrane.addColorStop(1, "rgba(4,8,20,0)");
      context.fillStyle = membrane;
      context.beginPath();
      const points = 96;
      for (let index = 0; index <= points; index += 1) {
        const angle = (index / points) * Math.PI * 2;
        const harmonic = Math.sin(angle * 3 + time * 0.00038) * 0.026 + Math.sin(angle * 7 - time * 0.00021) * 0.012;
        const eventWave = Math.sin(angle * (3 + (eventSeedRef.current % 5)) + time * 0.0012) * eventEnergy * (1 - eventAge) * 0.065;
        const hold = state.holding ? Math.sin(angle * 5 + time * 0.0016) * 0.025 : 0;
        const radius = baseRadius * (1 + harmonic + eventWave + hold + state.audioLevel * 0.018);
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius * 0.88;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.closePath();
      context.fill();
      context.strokeStyle = `rgba(${color.r},${color.g},${color.b},${state.holding ? 0.7 : 0.42})`;
      context.shadowColor = `rgb(${color.r},${color.g},${color.b})`;
      context.shadowBlur = state.alignment ? 22 : state.holding ? 14 : 7;
      context.lineWidth = state.holding ? 1.35 : 0.75;
      context.stroke();

      context.shadowBlur = 0;
      const seed = eventSeedRef.current;
      for (let strand = 0; strand < 11; strand += 1) {
        const startAngle = seeded(seed, strand) * Math.PI * 2;
        const endAngle = startAngle + (seeded(seed, strand + 20) - 0.5) * 2.4;
        const startRadius = baseRadius * (0.12 + seeded(seed, strand + 40) * 0.54);
        const endRadius = baseRadius * (0.34 + seeded(seed, strand + 60) * 0.58);
        context.beginPath();
        context.moveTo(cx + Math.cos(startAngle) * startRadius, cy + Math.sin(startAngle) * startRadius * 0.88);
        context.quadraticCurveTo(
          cx + Math.sin(time * 0.0002 + strand) * baseRadius * 0.18,
          cy + Math.cos(time * 0.00017 + strand) * baseRadius * 0.16,
          cx + Math.cos(endAngle) * endRadius,
          cy + Math.sin(endAngle) * endRadius * 0.88,
        );
        context.strokeStyle = `rgba(${color.r},${color.g},${color.b},${0.06 + (1 - eventAge) * 0.11})`;
        context.lineWidth = 0.45;
        context.stroke();
      }

      for (const spark of sparks) {
        const angle = spark.angle + time * 0.0001 * spark.speed * (state.holding ? 1.8 : 1);
        const pulse = 0.86 + Math.sin(time * 0.0011 + spark.phase) * 0.14;
        const radius = baseRadius * spark.radius * pulse;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius * 0.88;
        const alpha = state.active && !state.paused ? 0.2 + (spark.radius - 0.5) * 0.26 : 0.1;
        context.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha})`;
        context.fillRect(x, y, spark.size, spark.size);
      }

      if (event && eventAge < 1) {
        const wave = eventAge * baseRadius * 1.4;
        context.beginPath();
        context.ellipse(cx, cy, baseRadius * 0.16 + wave, (baseRadius * 0.16 + wave) * 0.88, 0, 0, Math.PI * 2);
        context.strokeStyle = `rgba(${color.r},${color.g},${color.b},${(1 - eventAge) * 0.44})`;
        context.lineWidth = 0.8;
        context.stroke();
      }

      if (state.alignment) {
        for (let beam = 0; beam < 3; beam += 1) {
          const angle = time * 0.00009 + beam * (Math.PI * 2 / 3);
          const gradient = context.createLinearGradient(cx, cy, cx + Math.cos(angle) * baseRadius * 1.75, cy + Math.sin(angle) * baseRadius * 1.75);
          gradient.addColorStop(0, "rgba(255,255,255,0.22)");
          gradient.addColorStop(1, "rgba(108,105,255,0)");
          context.strokeStyle = gradient;
          context.lineWidth = 0.8;
          context.beginPath();
          context.moveTo(cx, cy);
          context.lineTo(cx + Math.cos(angle) * baseRadius * 1.75, cy + Math.sin(angle) * baseRadius * 1.75);
          context.stroke();
        }
      }
      context.restore();

      const vignette = context.createRadialGradient(cx, cy, baseRadius * 0.8, cx, cy, Math.max(width, height) * 0.72);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.76)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    frame = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvasRef} className="oracle-canvas" aria-hidden="true" />;
}
