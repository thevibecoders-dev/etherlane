"use client";

import { useEffect, useRef } from "react";
import * as pc from "playcanvas";
import { mesh as topologyMesh } from "topojson-client";
import type { Topology } from "topojson-specification";
import landTopology from "world-atlas/land-110m.json";
import type { ImmersiveSignal, ImmersiveTone } from "./immersive-flow";

type NeuralGlobeProps = {
  active: boolean;
  paused: boolean;
  intensity: number;
  infrastructureRisk: number;
  signal?: ImmersiveSignal;
};

type Hub = {
  name: string;
  lat: number;
  lon: number;
  weight: number;
};

type RouteTrace = {
  entity: pc.Entity;
  mesh: pc.Mesh;
  material: pc.StandardMaterial;
  pulse: pc.Entity;
  from: number;
  to: number;
  progress: number;
  speed: number;
  delay: number;
  phase: number;
  tone: ImmersiveTone;
};

const COLORS: Record<ImmersiveTone, pc.Color> = {
  violet: new pc.Color(0.4, 0.12, 1),
  cyan: new pc.Color(0.02, 0.72, 1),
  amber: new pc.Color(1, 0.48, 0.08),
  coral: new pc.Color(1, 0.045, 0.11),
};

const HUBS: Hub[] = [
  { name: "San Francisco", lat: 37.77, lon: -122.42, weight: 1 },
  { name: "Seattle", lat: 47.61, lon: -122.33, weight: 0.66 },
  { name: "New York", lat: 40.71, lon: -74.01, weight: 1 },
  { name: "Toronto", lat: 43.65, lon: -79.38, weight: 0.72 },
  { name: "São Paulo", lat: -23.55, lon: -46.63, weight: 0.86 },
  { name: "Buenos Aires", lat: -34.6, lon: -58.38, weight: 0.58 },
  { name: "London", lat: 51.51, lon: -0.13, weight: 1 },
  { name: "Amsterdam", lat: 52.37, lon: 4.9, weight: 1 },
  { name: "Frankfurt", lat: 50.11, lon: 8.68, weight: 0.94 },
  { name: "Stockholm", lat: 59.33, lon: 18.07, weight: 0.64 },
  { name: "Madrid", lat: 40.42, lon: -3.7, weight: 0.62 },
  { name: "Lagos", lat: 6.52, lon: 3.38, weight: 0.72 },
  { name: "Cape Town", lat: -33.92, lon: 18.42, weight: 0.58 },
  { name: "Cairo", lat: 30.04, lon: 31.24, weight: 0.68 },
  { name: "Nairobi", lat: -1.29, lon: 36.82, weight: 0.61 },
  { name: "Dubai", lat: 25.2, lon: 55.27, weight: 0.8 },
  { name: "Mumbai", lat: 19.08, lon: 72.88, weight: 0.84 },
  { name: "Singapore", lat: 1.35, lon: 103.82, weight: 1 },
  { name: "Hong Kong", lat: 22.32, lon: 114.17, weight: 0.92 },
  { name: "Tokyo", lat: 35.68, lon: 139.69, weight: 1 },
  { name: "Seoul", lat: 37.57, lon: 126.98, weight: 0.84 },
  { name: "Sydney", lat: -33.87, lon: 151.21, weight: 0.86 },
  { name: "Johannesburg", lat: -26.2, lon: 28.04, weight: 0.58 },
  { name: "Bengaluru", lat: 12.97, lon: 77.59, weight: 0.78 },
  { name: "Osaka", lat: 34.69, lon: 135.5, weight: 0.62 },
  { name: "Melbourne", lat: -37.81, lon: 144.96, weight: 0.62 },
];

function seeded(index: number, salt = 0) {
  const value = Math.sin(index * 73.739 + salt * 31.117) * 43758.5453;
  return value - Math.floor(value);
}

function createMaterial(
  color: pc.Color,
  opacity: number,
  intensity: number,
  additive = true,
) {
  const material = new pc.StandardMaterial();
  material.diffuse = color.clone().mulScalar(0.06);
  material.emissive = color.clone();
  material.emissiveIntensity = intensity;
  material.useLighting = false;
  material.useFog = false;
  material.opacity = opacity;
  material.blendType = additive ? pc.BLEND_ADDITIVE : pc.BLEND_NORMAL;
  material.depthWrite = false;
  material.update();
  return material;
}

function createLineEntity(
  app: pc.Application,
  parent: pc.Entity,
  name: string,
  positions: number[],
  material: pc.Material,
  primitive = pc.PRIMITIVE_LINES,
) {
  const mesh = new pc.Mesh(app.graphicsDevice);
  mesh.setPositions(positions);
  mesh.update(primitive);
  const entity = new pc.Entity(name);
  const meshInstance = new pc.MeshInstance(mesh, material, entity);
  meshInstance.cull = false;
  entity.addComponent("render", { meshInstances: [meshInstance] });
  parent.addChild(entity);
  return { entity, mesh };
}

function spherePoint(lat: number, lon: number, radius: number) {
  const latitude = (lat * Math.PI) / 180;
  // Greenwich faces the camera first, keeping Europe and Africa immediately legible.
  const longitude = ((lon + 90) * Math.PI) / 180;
  const cosLatitude = Math.cos(latitude);
  return new pc.Vec3(
    radius * cosLatitude * Math.cos(longitude),
    radius * Math.sin(latitude),
    radius * cosLatitude * Math.sin(longitude),
  );
}

function arcPoint(start: pc.Vec3, end: pc.Vec3, progress: number, radius: number) {
  const startNormal = start.clone().normalize();
  const endNormal = end.clone().normalize();
  const dot = Math.max(-0.9999, Math.min(0.9999, startNormal.dot(endNormal)));
  const angle = Math.acos(dot);
  const sinAngle = Math.max(0.0001, Math.sin(angle));
  const left = Math.sin((1 - progress) * angle) / sinAngle;
  const right = Math.sin(progress * angle) / sinAngle;
  const height = Math.sin(progress * Math.PI) * (0.65 + angle * 1.45);
  return startNormal
    .mulScalar(left)
    .add(endNormal.mulScalar(right))
    .normalize()
    .mulScalar(radius + height);
}

function routePositions(
  start: pc.Vec3,
  end: pc.Vec3,
  progress: number,
  radius: number,
  segments = 38,
) {
  const positions: number[] = [];
  const visibleSegments = Math.max(2, Math.ceil(segments * Math.max(0.03, progress)));
  for (let index = 0; index <= visibleSegments; index += 1) {
    const routeProgress = (index / visibleSegments) * progress;
    const point = arcPoint(start, end, routeProgress, radius);
    positions.push(point.x, point.y, point.z);
  }
  return positions;
}

function pickRoute(trace: RouteTrace, seed: number) {
  trace.from = Math.floor(seeded(seed, 3) * HUBS.length);
  trace.to = Math.floor(seeded(seed, 7) * HUBS.length);
  if (trace.to === trace.from) trace.to = (trace.to + 7) % HUBS.length;
  trace.progress = 0;
  trace.delay = seeded(seed, 9) * 2.2;
  trace.speed = 0.09 + seeded(seed, 11) * 0.16;
  trace.phase = seeded(seed, 14) * Math.PI * 2;
}

export function NeuralGlobeScene({
  active,
  paused,
  intensity,
  infrastructureRisk,
  signal,
}: NeuralGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef(active);
  const pausedRef = useRef(paused);
  const intensityRef = useRef(intensity);
  const riskRef = useRef(infrastructureRisk);
  const signalRef = useRef(signal);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);
  useEffect(() => {
    riskRef.current = infrastructureRisk;
  }, [infrastructureRisk]);
  useEffect(() => {
    signalRef.current = signal;
  }, [signal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const compactQuery = window.matchMedia("(max-width: 720px)");
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let compact = compactQuery.matches;
    let reducedMotion = reducedQuery.matches;
    let disposed = false;
    let elapsed = 0;
    let frameAccumulator = 0;
    let lastSignalId = "";
    let routeSequence = 100;
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const radius = compact ? 4.15 : 4.75;

    const app = new pc.Application(canvas, {
      graphicsDeviceOptions: {
        antialias: !compact,
        alpha: false,
        powerPreference: "high-performance",
      },
    });
    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    app.graphicsDevice.maxPixelRatio = compact ? 1 : Math.min(devicePixelRatio || 1, 1.5);
    app.scene.ambientLight = new pc.Color(0.015, 0.02, 0.06);
    app.scene.exposure = 1.32;
    app.start();

    const camera = new pc.Entity("ORBITAL NETWORK CAMERA");
    camera.addComponent("camera", {
      clearColor: new pc.Color(0.001, 0.002, 0.012),
      fov: compact ? 61 : 52,
      nearClip: 0.08,
      farClip: 100,
    });
    camera.setPosition(0, compact ? 0.25 : 0.1, compact ? 13.5 : 14.3);
    camera.lookAt(0, 0, 0);
    app.root.addChild(camera);

    let cameraFrame: pc.CameraFrame | null = null;
    try {
      cameraFrame = new pc.CameraFrame(app, camera.camera!);
      cameraFrame.rendering.renderTargetScale = compact ? 0.72 : 0.92;
      cameraFrame.rendering.toneMapping = pc.TONEMAP_ACES2;
      cameraFrame.bloom.intensity = compact ? 0.014 : 0.032;
      cameraFrame.bloom.blurLevel = compact ? 4 : 7;
      cameraFrame.grading.enabled = true;
      cameraFrame.grading.contrast = 1.12;
      cameraFrame.grading.saturation = 1.18;
      cameraFrame.vignette.intensity = compact ? 0.2 : 0.32;
      cameraFrame.vignette.inner = 0.5;
      cameraFrame.vignette.outer = 1.2;
      cameraFrame.enabled = true;
      cameraFrame.update();
    } catch {
      cameraFrame = null;
    }

    const globe = new pc.Entity("LIVE INTERNET EARTH");
    globe.setEulerAngles(-8, -18, -2);
    app.root.addChild(globe);

    const surfaceMaterial = new pc.StandardMaterial();
    surfaceMaterial.diffuse = new pc.Color(0.004, 0.012, 0.045);
    surfaceMaterial.emissive = new pc.Color(0.008, 0.035, 0.12);
    surfaceMaterial.emissiveIntensity = 0.74;
    surfaceMaterial.metalness = 0.35;
    surfaceMaterial.gloss = 0.9;
    surfaceMaterial.opacity = 0.9;
    surfaceMaterial.update();
    const surface = new pc.Entity("DARK OCEAN SPHERE");
    surface.addComponent("render", { type: "sphere", material: surfaceMaterial });
    surface.setLocalScale(radius * 2, radius * 2, radius * 2);
    globe.addChild(surface);

    const wireMaterial = createMaterial(new pc.Color(0.06, 0.22, 0.7), 0.12, 1.1);
    const wire = new pc.Entity("GEODESIC FIELD");
    wire.addComponent("render", { type: "sphere", material: wireMaterial });
    wire.setLocalScale(radius * 2.008, radius * 2.008, radius * 2.008);
    const wireMesh = wire.render?.meshInstances[0];
    if (wireMesh) wireMesh.renderStyle = pc.RENDERSTYLE_WIREFRAME;
    globe.addChild(wire);

    const atmosphereMaterial = createMaterial(new pc.Color(0.04, 0.33, 1), 0.1, 2.4);
    atmosphereMaterial.cull = pc.CULLFACE_FRONT;
    atmosphereMaterial.update();
    const atmosphere = new pc.Entity("THIN ATMOSPHERE");
    atmosphere.addComponent("render", { type: "sphere", material: atmosphereMaterial });
    atmosphere.setLocalScale(radius * 2.055, radius * 2.055, radius * 2.055);
    globe.addChild(atmosphere);

    const graticulePositions: number[] = [];
    for (let latitude = -60; latitude <= 60; latitude += 15) {
      for (let longitude = -180; longitude < 180; longitude += 6) {
        const a = spherePoint(latitude, longitude, radius * 1.003);
        const b = spherePoint(latitude, longitude + 6, radius * 1.003);
        graticulePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    for (let longitude = -180; longitude < 180; longitude += 15) {
      for (let latitude = -84; latitude < 84; latitude += 6) {
        const a = spherePoint(latitude, longitude, radius * 1.003);
        const b = spherePoint(latitude + 6, longitude, radius * 1.003);
        graticulePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    createLineEntity(
      app,
      globe,
      "ULTRAFINE COORDINATE FIELD",
      graticulePositions,
      createMaterial(new pc.Color(0.05, 0.18, 0.62), 0.11, 1.05),
    );

    const topology = landTopology as unknown as Topology;
    const coastline = topologyMesh(topology, topology.objects.land as never);
    const continentPositions: number[] = [];
    for (const line of coastline.coordinates) {
      for (let index = 1; index < line.length; index += 1) {
        const previous = line[index - 1];
        const current = line[index];
        if (Math.abs(current[0] - previous[0]) > 90) continue;
        const a = spherePoint(previous[1], previous[0], radius * 1.008);
        const b = spherePoint(current[1], current[0], radius * 1.008);
        continentPositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    createLineEntity(
      app,
      globe,
      "CONTINENT LIGHT",
      continentPositions,
      createMaterial(new pc.Color(0.08, 0.72, 1), 0.82, 3.2),
    );
    createLineEntity(
      app,
      globe,
      "CONTINENT AURA",
      continentPositions,
      createMaterial(new pc.Color(0.14, 0.24, 1), 0.24, 4.8),
    ).entity.setLocalScale(1.003, 1.003, 1.003);

    const nodeMaterial = createMaterial(new pc.Color(0.08, 0.8, 1), 0.95, 4.7);
    const nodeAuraMaterial = createMaterial(new pc.Color(0.42, 0.12, 1), 0.28, 5.2);
    const nodeEntities: Array<{ core: pc.Entity; aura: pc.Entity; phase: number; weight: number }> = [];
    HUBS.forEach((hub, index) => {
      const point = spherePoint(hub.lat, hub.lon, radius * 1.014);
      const core = new pc.Entity(`NODE ${hub.name}`);
      core.addComponent("render", { type: "sphere", material: nodeMaterial });
      core.setPosition(point);
      core.setLocalScale(0.045 + hub.weight * 0.035, 0.045 + hub.weight * 0.035, 0.045 + hub.weight * 0.035);
      globe.addChild(core);
      const aura = new pc.Entity(`NODE AURA ${hub.name}`);
      aura.addComponent("render", { type: "sphere", material: nodeAuraMaterial });
      aura.setPosition(point);
      globe.addChild(aura);
      nodeEntities.push({ core, aura, phase: seeded(index, 31) * Math.PI * 2, weight: hub.weight });
    });

    const routeCount = compact ? 15 : 34;
    const routes: RouteTrace[] = [];
    for (let index = 0; index < routeCount; index += 1) {
      const tone = (["cyan", "violet", "cyan", "amber"] as ImmersiveTone[])[index % 4];
      const material = createMaterial(COLORS[tone], tone === "amber" ? 0.68 : 0.48, tone === "cyan" ? 4.4 : 3.5);
      const entity = new pc.Entity(`DRAWING ROUTE ${index}`);
      const mesh = new pc.Mesh(app.graphicsDevice);
      mesh.clear(true, false, 48, 0);
      mesh.setPositions([0, 0, 0, 0.001, 0.001, 0.001]);
      mesh.update(pc.PRIMITIVE_LINESTRIP, false);
      const meshInstance = new pc.MeshInstance(mesh, material, entity);
      meshInstance.cull = false;
      entity.addComponent("render", { meshInstances: [meshInstance] });
      globe.addChild(entity);

      const pulse = new pc.Entity(`ROUTE HEAD ${index}`);
      pulse.addComponent("render", { type: "sphere", material });
      pulse.setLocalScale(0.075, 0.075, 0.075);
      globe.addChild(pulse);
      const trace: RouteTrace = {
        entity,
        mesh,
        material,
        pulse,
        from: 0,
        to: 1,
        progress: 0,
        speed: 0.1,
        delay: 0,
        phase: 0,
        tone,
      };
      pickRoute(trace, index + routeSequence);
      trace.progress = seeded(index, 41);
      routes.push(trace);
    }

    const orbitPositions: number[] = [];
    for (let ring = 0; ring < 5; ring += 1) {
      const orbitRadius = radius * (1.28 + ring * 0.13);
      const tilt = -0.42 + ring * 0.21;
      for (let segment = 0; segment < 96; segment += 1) {
        const a = (segment / 96) * Math.PI * 2;
        const b = ((segment + 1) / 96) * Math.PI * 2;
        orbitPositions.push(
          Math.cos(a) * orbitRadius,
          Math.sin(a) * orbitRadius * Math.sin(tilt),
          Math.sin(a) * orbitRadius * Math.cos(tilt),
          Math.cos(b) * orbitRadius,
          Math.sin(b) * orbitRadius * Math.sin(tilt),
          Math.sin(b) * orbitRadius * Math.cos(tilt),
        );
      }
    }
    createLineEntity(
      app,
      globe,
      "ORBITAL BACKBONE",
      orbitPositions,
      createMaterial(new pc.Color(0.22, 0.06, 1), 0.13, 2.2),
    );

    const resize = () => {
      compact = compactQuery.matches;
      app.graphicsDevice.maxPixelRatio = compact ? 1 : Math.min(devicePixelRatio || 1, 1.5);
      app.resizeCanvas(canvas.clientWidth, canvas.clientHeight);
      if (camera.camera) camera.camera.fov = compact ? 61 : 52;
      if (cameraFrame) {
        cameraFrame.rendering.renderTargetScale = compact ? 0.72 : 0.92;
        cameraFrame.update();
      }
    };
    const onPointer = (event: PointerEvent) => {
      pointer.targetX = (event.clientX / Math.max(innerWidth, 1) - 0.5) * 2;
      pointer.targetY = (event.clientY / Math.max(innerHeight, 1) - 0.5) * 2;
    };
    const onReduced = () => {
      reducedMotion = reducedQuery.matches;
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    window.addEventListener("pointermove", onPointer, { passive: true });
    reducedQuery.addEventListener("change", onReduced);
    resize();

    app.on("update", (rawDelta: number) => {
      if (disposed) return;
      camera.camera!.enabled = activeRef.current;
      if (!activeRef.current || document.hidden) return;
      if (compact) {
        frameAccumulator += rawDelta;
        if (frameAccumulator < 1 / 30) return;
        frameAccumulator = 0;
      }

      const delta = Math.min(rawDelta, 0.045);
      const motion = pausedRef.current ? 0 : reducedMotion ? 0.16 : 1;
      const energy = 0.55 + intensityRef.current / 100;
      const risk = Math.max(0, Math.min(1, riskRef.current / 100));
      elapsed += delta * motion;
      pointer.x += (pointer.targetX - pointer.x) * Math.min(1, delta * 2.2);
      pointer.y += (pointer.targetY - pointer.y) * Math.min(1, delta * 2.2);
      camera.setPosition(pointer.x * 0.32, -pointer.y * 0.18 + (compact ? 0.25 : 0.1), compact ? 13.5 : 14.3);
      camera.lookAt(pointer.x * 0.12, -pointer.y * 0.08, 0);
      globe.rotate(0.45 * delta * motion, (2.2 + energy * 0.9) * delta * motion, 0);

      camera.camera!.clearColor.set(0.001 + risk * 0.055, 0.002, 0.012);
      atmosphereMaterial.emissive.lerp(COLORS.cyan, COLORS.coral, risk);
      atmosphereMaterial.emissiveIntensity = 2.2 + energy * 0.55 + risk * 3.4;
      surfaceMaterial.emissive.set(0.008 + risk * 0.08, 0.025, 0.11 - risk * 0.06);

      const currentSignal = signalRef.current;
      if (currentSignal && currentSignal.id !== lastSignalId) {
        lastSignalId = currentSignal.id;
        const burst = Math.min(compact ? 4 : 10, 2 + Math.round(currentSignal.magnitude / 14));
        for (let index = 0; index < burst; index += 1) {
          const route = routes[(index + routeSequence) % routes.length];
          pickRoute(route, routeSequence + index * 7);
          route.delay = index * 0.045;
          route.speed *= 1.45;
          route.tone = currentSignal.tone;
          route.material.emissive.copy(COLORS[currentSignal.tone]);
          route.material.emissiveIntensity = currentSignal.tone === "coral" ? 5.8 : 4.8;
        }
        routeSequence += burst + currentSignal.code.length;
      }

      routes.forEach((route, index) => {
        if (route.delay > 0) {
          route.delay -= delta * motion;
          route.entity.enabled = false;
          route.pulse.enabled = false;
          return;
        }
        route.entity.enabled = true;
        route.pulse.enabled = true;
        route.progress += route.speed * delta * energy * motion;
        if (route.progress >= 1.08) {
          pickRoute(route, routeSequence + index * 17);
          routeSequence += 1;
          route.tone = risk > 0.68 && index % 3 === 0
            ? "coral"
            : (["cyan", "violet", "cyan", "amber"] as ImmersiveTone[])[index % 4];
          route.material.emissive.copy(COLORS[route.tone]);
        }
        const visibleProgress = Math.min(1, route.progress);
        const start = spherePoint(HUBS[route.from].lat, HUBS[route.from].lon, radius * 1.012);
        const end = spherePoint(HUBS[route.to].lat, HUBS[route.to].lon, radius * 1.012);
        route.mesh.setPositions(routePositions(start, end, visibleProgress, radius * 1.012));
        route.mesh.update(pc.PRIMITIVE_LINESTRIP, false);
        const head = arcPoint(start, end, visibleProgress, radius * 1.012);
        route.pulse.setPosition(head);
        const fade = route.progress > 0.86 ? Math.max(0.05, (1.08 - route.progress) / 0.22) : 1;
        route.material.opacity = (route.tone === "amber" ? 0.62 : 0.46) * fade;
        route.material.emissiveIntensity = (route.tone === "coral" ? 5.4 : 3.8) + energy * 0.55 + risk * 1.7;
      });

      nodeEntities.forEach((node) => {
        const pulse = 0.09 + node.weight * 0.08 + (Math.sin(elapsed * (1.4 + node.weight) + node.phase) + 1) * 0.035;
        node.aura.setLocalScale(pulse, pulse, pulse);
      });
    });

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointer);
      reducedQuery.removeEventListener("change", onReduced);
      cameraFrame?.destroy();
      app.destroy();
    };
  }, []);

  return (
    <div className={`neural-globe ${active ? "is-active" : "is-inactive"}`} aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className="neural-globe-aura" />
      <div className="immersive-vignette" />
    </div>
  );
}
