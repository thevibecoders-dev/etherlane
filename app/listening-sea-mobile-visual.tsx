"use client";

import { useEffect, useRef } from "react";
import { mesh as topologyMesh } from "topojson-client";
import type { Topology } from "topojson-specification";
import landTopology from "world-atlas/land-110m.json";
import { eventColor, hashText } from "./listening-sea-model";
import type { ListeningSeaVisualProps } from "./listening-sea-visual-loader";

type Point = { x: number; y: number };
type Packet = { lane: number; phase: number; speed: number; size: number; code: string };
type Trace = { id: string; source: Point; target: Point; born: number; color: string; strength: number };

const topology = landTopology as unknown as Topology;
const landLines = topologyMesh(topology, topology.objects.land as never).coordinates;
const packetCodes = ["01", "A7", "↗", "DNS", "BGP", "64", "FF", "RTT"];

function seeded(seed: number, salt = 0) {
  const value = Math.sin(seed * 91.731 + salt * 37.119) * 43758.5453;
  return value - Math.floor(value);
}

function project(latitude: number, longitude: number, width: number, height: number): Point {
  const depth = Math.max(0, Math.min(1, (82 - latitude) / 164));
  const eased = Math.pow(depth, 1.34);
  const halfWidth = width * (0.12 + eased * 0.62);
  return {
    x: width * 0.5 + (longitude / 180) * halfWidth,
    y: height * (0.34 + eased * 0.43),
  };
}

function eventPoint(value: number | undefined, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

export function ListeningSeaMobileVisual({
  active,
  paused,
  mode,
  event,
  focusSource,
  infrastructureRisk,
  audioLevel,
}: ListeningSeaVisualProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ active, paused, mode, focusSource, infrastructureRisk, audioLevel });
  const tracesRef = useRef<Trace[]>([]);

  useEffect(() => {
    stateRef.current = { active, paused, mode, focusSource, infrastructureRisk, audioLevel };
  }, [active, paused, mode, focusSource, infrastructureRisk, audioLevel]);

  useEffect(() => {
    if (!event || (focusSource !== "ALL" && focusSource !== event.source)) return;
    const seed = hashText(event.id);
    tracesRef.current = [
      ...tracesRef.current.slice(-7),
      {
        id: event.id,
        source: {
          x: eventPoint(event.longitude, seeded(seed, 2) * 300 - 150),
          y: eventPoint(event.latitude, seeded(seed, 4) * 120 - 60),
        },
        target: {
          x: eventPoint(event.destinationLongitude, seeded(seed, 7) * 300 - 150),
          y: eventPoint(event.destinationLatitude, seeded(seed, 9) * 120 - 60),
        },
        born: performance.now(),
        color: eventColor(event),
        strength: Math.max(0.25, event.magnitude / 100),
      },
    ];
  }, [event, focusSource]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const packets: Packet[] = Array.from({ length: 34 }, (_, index) => ({
      lane: index % 9,
      phase: seeded(index, 3),
      speed: 0.025 + seeded(index, 5) * 0.055,
      size: 0.7 + seeded(index, 8) * 1.25,
      code: packetCodes[index % packetCodes.length],
    }));
    let width = 0;
    let height = 0;
    let ratio = 1;
    let animationFrame = 0;
    let lastFrame = 0;
    let mapLayer: HTMLCanvasElement | null = null;

    const buildMap = () => {
      mapLayer = document.createElement("canvas");
      mapLayer.width = Math.round(width * ratio);
      mapLayer.height = Math.round(height * ratio);
      const map = mapLayer.getContext("2d");
      if (!map) return;
      map.scale(ratio, ratio);
      map.strokeStyle = "rgba(62, 187, 255, 0.34)";
      map.lineWidth = 0.58;
      map.shadowColor = "rgba(37, 121, 255, 0.38)";
      map.shadowBlur = 3;
      map.beginPath();
      for (const line of landLines) {
        for (let index = 0; index < line.length; index += 1) {
          const point = project(line[index][1], line[index][0], width, height);
          if (index === 0) map.moveTo(point.x, point.y);
          else map.lineTo(point.x, point.y);
        }
      }
      map.stroke();
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      ratio = Math.min(window.devicePixelRatio || 1, 1.35);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      buildMap();
    };

    const lanePoint = (lane: number, progress: number, time: number): Point => {
      const horizon = { x: width * (0.38 + lane * 0.03), y: height * 0.36 };
      const destination = { x: width * (-0.22 + lane * 0.18), y: height * 0.93 };
      const eased = progress * progress;
      return {
        x: horizon.x + (destination.x - horizon.x) * eased + Math.sin(time * 0.00018 + lane) * 4 * progress,
        y: horizon.y + (destination.y - horizon.y) * eased,
      };
    };

    const draw = (time: number) => {
      animationFrame = requestAnimationFrame(draw);
      const state = stateRef.current;
      if (time - lastFrame < (reduced.matches ? 100 : 33)) return;
      lastFrame = time;

      const background = context.createLinearGradient(0, 0, 0, height);
      background.addColorStop(0, "#01040c");
      background.addColorStop(0.46, "#020b1c");
      background.addColorStop(1, state.infrastructureRisk > 45 ? "#13030d" : "#01040d");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      const glow = context.createRadialGradient(width * 0.5, height * 0.39, 0, width * 0.5, height * 0.39, width * 0.66);
      glow.addColorStop(0, `rgba(42, 128, 255, ${0.16 + state.audioLevel * 0.1})`);
      glow.addColorStop(0.36, "rgba(55, 44, 190, 0.075)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = glow;
      context.fillRect(0, height * 0.16, width, height * 0.72);

      const density = state.mode === "drift" ? 0.58 : state.mode === "observe" ? 1 : 0.76;
      context.save();
      context.lineCap = "round";
      for (let lane = 0; lane < 9; lane += 1) {
        if (lane / 9 > density) continue;
        context.beginPath();
        for (let step = 0; step <= 24; step += 1) {
          const point = lanePoint(lane, step / 24, time);
          if (step === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        }
        context.strokeStyle = lane % 3 === 0 ? "rgba(83, 104, 255, 0.27)" : "rgba(40, 160, 255, 0.2)";
        context.lineWidth = lane % 4 === 0 ? 0.9 : 0.52;
        context.setLineDash([1, 8 + lane]);
        context.lineDashOffset = -(time * 0.015 + lane * 7);
        context.stroke();
      }
      context.restore();

      if (mapLayer) {
        context.save();
        context.globalAlpha = 0.62 + Math.sin(time * 0.0007) * 0.07;
        context.drawImage(mapLayer, 0, 0, width, height);
        context.restore();
      }

      if (state.active && !state.paused) {
        for (const packet of packets) {
          const progress = (packet.phase + time * 0.0001 * packet.speed * 60) % 1;
          const point = lanePoint(packet.lane, progress, time);
          const alpha = Math.min(0.82, 0.16 + progress * 0.72) * density;
          context.fillStyle = packet.lane % 3 === 0 ? `rgba(145, 116, 255, ${alpha})` : `rgba(104, 229, 255, ${alpha})`;
          context.shadowColor = context.fillStyle;
          context.shadowBlur = 5;
          const packetWidth = 1.2 + progress * 4.2 * packet.size;
          context.fillRect(point.x - packetWidth / 2, point.y, packetWidth, 0.7 + progress * 1.4);
          if (progress > 0.72 && packet.lane % 3 === 0) {
            context.shadowBlur = 0;
            context.font = "5px ui-monospace, monospace";
            context.fillText(packet.code, point.x + 4, point.y + 2);
          }
        }
      }
      context.shadowBlur = 0;

      tracesRef.current = tracesRef.current.filter((trace) => time - trace.born < 9000);
      for (const trace of tracesRef.current) {
        const age = Math.max(0, (time - trace.born) / 9000);
        const source = project(trace.source.y, trace.source.x, width, height);
        const target = project(trace.target.y, trace.target.x, width, height);
        const controlY = Math.min(source.y, target.y) - height * (0.08 + trace.strength * 0.09);
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.bezierCurveTo(source.x, controlY, target.x, controlY, target.x, target.y);
        context.strokeStyle = trace.color;
        context.globalAlpha = (1 - age) * 0.68;
        context.lineWidth = 0.7 + trace.strength * 0.55;
        context.stroke();
        const pulse = Math.min(1, age * 3.2);
        const one = 1 - pulse;
        const px = one * one * source.x + 2 * one * pulse * source.x + pulse * pulse * target.x;
        const py = one * one * source.y + 2 * one * pulse * controlY + pulse * pulse * target.y;
        context.fillStyle = "#e8fbff";
        context.shadowColor = trace.color;
        context.shadowBlur = 9;
        context.beginPath();
        context.arc(px, py, 1.5 + trace.strength, 0, Math.PI * 2);
        context.fill();
        const ring = 4 + age * 28;
        context.globalAlpha = (1 - age) * 0.34;
        context.strokeStyle = trace.color;
        context.lineWidth = 0.7;
        context.beginPath();
        context.ellipse(target.x, target.y, ring, ring * 0.35, 0, 0, Math.PI * 2);
        context.stroke();
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;

      if (state.infrastructureRisk > 25) {
        const danger = context.createRadialGradient(width * 0.5, height * 0.62, 0, width * 0.5, height * 0.62, width * 0.8);
        danger.addColorStop(0, `rgba(255, 26, 72, ${state.infrastructureRisk / 780})`);
        danger.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = danger;
        context.fillRect(0, height * 0.2, width, height * 0.75);
      }
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    animationFrame = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  return <canvas ref={canvasRef} className="listening-sea-canvas mobile-flow-canvas" aria-hidden="true" />;
}
