"use client";

import { useEffect, useRef } from "react";
import * as pc from "playcanvas";
import { mesh as topologyMesh } from "topojson-client";
import type { Topology } from "topojson-specification";
import landTopology from "world-atlas/land-110m.json";
import { eventColor, hashText, type ListeningMode, type SeaEvent, type SeaSource } from "./listening-sea-model";

type ListeningSeaVisualProps = {
  active: boolean;
  paused: boolean;
  mode: ListeningMode;
  event?: SeaEvent;
  focusSource: SeaSource | "ALL";
  infrastructureRisk: number;
  audioLevel: number;
};

type Ripple = {
  entity: pc.Entity;
  material: pc.StandardMaterial;
  life: number;
  energy: number;
};

type Route = {
  entity: pc.Entity;
  mesh: pc.Mesh;
  material: pc.StandardMaterial;
  pulse: pc.Entity;
  pulseMaterial: pc.StandardMaterial;
  start: pc.Vec3;
  end: pc.Vec3;
  progress: number;
  speed: number;
  life: number;
};

type Droplet = {
  entity: pc.Entity;
  material: pc.StandardMaterial;
  start: pc.Vec3;
  target: pc.Vec3;
  progress: number;
  speed: number;
};

function seeded(seed: number, salt = 0) {
  const value = Math.sin(seed * 91.731 + salt * 37.119) * 43758.5453;
  return value - Math.floor(value);
}

function colorFromHex(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return new pc.Color(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function material(color: pc.Color, opacity: number, intensity: number, additive = true) {
  const result = new pc.StandardMaterial();
  result.diffuse = color.clone().mulScalar(0.08);
  result.emissive = color.clone();
  result.emissiveIntensity = intensity;
  result.useLighting = !additive;
  result.useFog = true;
  result.opacity = opacity;
  result.blendType = additive ? pc.BLEND_ADDITIVE : pc.BLEND_NORMAL;
  result.depthWrite = !additive && opacity >= 1;
  result.metalness = 0.32;
  result.gloss = 0.92;
  result.update();
  return result;
}

function lineEntity(app: pc.Application, name: string, positions: number[], lineMaterial: pc.Material, primitive: number = pc.PRIMITIVE_LINES) {
  const mesh = new pc.Mesh(app.graphicsDevice);
  mesh.setPositions(positions);
  mesh.update(primitive);
  const entity = new pc.Entity(name);
  const instance = new pc.MeshInstance(mesh, lineMaterial, entity);
  instance.cull = false;
  entity.addComponent("render", { meshInstances: [instance] });
  app.root.addChild(entity);
  return { entity, mesh };
}

function mapPoint(latitude: number, longitude: number) {
  return new pc.Vec3((longitude / 180) * 15.5, 0.035, -18 + (latitude / 90) * 10.5);
}

function portraitPoint(point: pc.Vec3) {
  return new pc.Vec3(point.x * 0.38, point.y, -10.5 + (point.z + 18) * 0.68);
}

function positionFor(event: SeaEvent, destination = false) {
  const seed = hashText(`${event.id}:${destination ? "destination" : "origin"}`);
  const latitude = destination ? event.destinationLatitude : event.latitude;
  const longitude = destination ? event.destinationLongitude : event.longitude;
  return mapPoint(
    typeof latitude === "number" ? latitude : seeded(seed, 4) * 120 - 60,
    typeof longitude === "number" ? longitude : seeded(seed, 9) * 320 - 160,
  );
}

function routeCurve(start: pc.Vec3, end: pc.Vec3, progress: number, segments = 34) {
  const points: number[] = [];
  const visible = Math.max(2, Math.ceil(segments * Math.max(0.03, progress)));
  const distance = start.distance(end);
  for (let index = 0; index <= visible; index += 1) {
    const t = (index / visible) * progress;
    points.push(
      pc.math.lerp(start.x, end.x, t),
      0.08 + Math.sin(t * Math.PI) * (1.1 + distance * 0.085),
      pc.math.lerp(start.z, end.z, t),
    );
  }
  return points;
}

function pointOnRoute(start: pc.Vec3, end: pc.Vec3, progress: number) {
  const distance = start.distance(end);
  return new pc.Vec3(
    pc.math.lerp(start.x, end.x, progress),
    0.08 + Math.sin(progress * Math.PI) * (1.1 + distance * 0.085),
    pc.math.lerp(start.z, end.z, progress),
  );
}

function continentPositions(compact = false) {
  const topology = landTopology as unknown as Topology;
  const geometry = topologyMesh(topology, topology.objects.land as never);
  const positions: number[] = [];
  for (const line of geometry.coordinates) {
    for (let index = 1; index < line.length; index += 1) {
      const previousMap = mapPoint(line[index - 1][1], line[index - 1][0]);
      const currentMap = mapPoint(line[index][1], line[index][0]);
      const previous = compact ? portraitPoint(previousMap) : previousMap;
      const current = compact ? portraitPoint(currentMap) : currentMap;
      positions.push(previous.x, previous.y, previous.z, current.x, current.y, current.z);
    }
  }
  return positions;
}

export function ListeningSeaVisual({
  active,
  paused,
  mode,
  event,
  focusSource,
  infrastructureRisk,
  audioLevel,
}: ListeningSeaVisualProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef(active);
  const pausedRef = useRef(paused);
  const modeRef = useRef(mode);
  const eventRef = useRef(event);
  const focusRef = useRef(focusSource);
  const riskRef = useRef(infrastructureRisk);
  const audioRef = useRef(audioLevel);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { eventRef.current = event; }, [event]);
  useEffect(() => { focusRef.current = focusSource; }, [focusSource]);
  useEffect(() => { riskRef.current = infrastructureRisk; }, [infrastructureRisk]);
  useEffect(() => { audioRef.current = audioLevel; }, [audioLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const compactQuery = window.matchMedia("(max-width: 760px)");
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let compact = compactQuery.matches;
    let reduced = reducedQuery.matches;
    let disposed = false;
    let lastEventId = "";
    let elapsed = 0;
    let frame = 0;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    const app = new pc.Application(canvas, {
      graphicsDeviceOptions: {
        antialias: !compact,
        alpha: false,
        powerPreference: compact ? "low-power" : "high-performance",
      },
    });
    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    app.graphicsDevice.maxPixelRatio = compact ? 0.78 : Math.min(window.devicePixelRatio || 1, 1.4);
    app.autoRender = !compact;
    app.renderNextFrame = true;
    app.scene.ambientLight = new pc.Color(0.018, 0.035, 0.08);
    app.scene.exposure = compact ? 1.3 : 1.08;
    app.scene.fog.type = pc.FOG_EXP2;
    app.scene.fog.color = new pc.Color(0.0015, 0.006, 0.018);
    app.scene.fog.density = compact ? 0.022 : 0.024;
    app.start();

    const camera = new pc.Entity("LISTENER");
    camera.addComponent("camera", {
      clearColor: new pc.Color(0.001, 0.004, 0.014),
      fov: compact ? 68 : 66,
      nearClip: 0.05,
      farClip: compact ? 72 : 120,
    });
    camera.setPosition(0, compact ? 4.8 : 1.62, compact ? 5.6 : 7.4);
    camera.lookAt(0, compact ? 0.02 : 0.15, compact ? -9.5 : -17);
    app.root.addChild(camera);

    let cameraFrame: pc.CameraFrame | null = null;
    if (!compact) try {
      cameraFrame = new pc.CameraFrame(app, camera.camera!);
      cameraFrame.rendering.renderTargetScale = compact ? 0.66 : 0.88;
      cameraFrame.rendering.toneMapping = pc.TONEMAP_ACES2;
      cameraFrame.bloom.intensity = compact ? 0.012 : 0.028;
      cameraFrame.bloom.blurLevel = compact ? 4 : 7;
      cameraFrame.grading.enabled = true;
      cameraFrame.grading.contrast = 1.09;
      cameraFrame.grading.saturation = 1.1;
      cameraFrame.vignette.intensity = compact ? 0.34 : 0.42;
      cameraFrame.vignette.inner = 0.45;
      cameraFrame.vignette.outer = 1.18;
      cameraFrame.enabled = true;
      cameraFrame.update();
    } catch {
      cameraFrame = null;
    }

    const horizon = new pc.Entity("DISTANT HORIZON");
    horizon.addComponent("light", {
      type: "omni",
      color: new pc.Color(0.08, 0.27, 1),
      intensity: compact ? 8 : 7,
      range: 58,
      castShadows: false,
    });
    horizon.setPosition(0, 0.4, compact ? -18 : -28);
    app.root.addChild(horizon);

    const dangerLight = new pc.Entity("OUTAGE PRESSURE");
    dangerLight.addComponent("light", {
      type: "omni",
      color: new pc.Color(1, 0.025, 0.08),
      intensity: 0,
      range: 45,
      castShadows: false,
    });
    dangerLight.setPosition(0, -0.8, compact ? -9 : -14);
    app.root.addChild(dangerLight);

    const oceanMaterial = new pc.StandardMaterial();
    oceanMaterial.diffuse = new pc.Color(0.004, 0.018, 0.045);
    oceanMaterial.emissive = new pc.Color(0.002, 0.012, 0.038);
    oceanMaterial.emissiveIntensity = 1.5;
    oceanMaterial.metalness = 0.64;
    oceanMaterial.gloss = 0.96;
    oceanMaterial.opacity = 0.94;
    oceanMaterial.update();
    const ocean = new pc.Entity("LISTENING SEA");
    ocean.addComponent("render", { type: "plane", material: oceanMaterial });
    ocean.setLocalScale(compact ? 14 : 42, 1, compact ? 38 : 58);
    ocean.setPosition(0, -0.06, compact ? -10 : -18);
    app.root.addChild(ocean);

    const worldMaterial = material(new pc.Color(0.08, 0.43, 0.82), compact ? 0.22 : 0.15, compact ? 2.4 : 1.2);
    lineEntity(app, "SUBMERGED CONTINENTS", continentPositions(compact), worldMaterial);

    const currentMaterial = material(new pc.Color(0.1, 0.32, 0.78), compact ? 0.2 : 0.075, compact ? 2.1 : 1.1);
    const currents: Array<{ mesh: pc.Mesh; phase: number; lane: number }> = [];
    const currentCount = compact ? 5 : 13;
    for (let lane = 0; lane < currentCount; lane += 1) {
      const current = lineEntity(app, `TIDAL CURRENT ${lane}`, [0, 0, 0, 0, 0, 0], currentMaterial, pc.PRIMITIVE_LINESTRIP);
      currents.push({ mesh: current.mesh, phase: seeded(lane, 3) * Math.PI * 2, lane });
    }

    const dustMaterial = material(new pc.Color(0.18, 0.48, 1), compact ? 0.62 : 0.38, compact ? 3.2 : 2.4);
    const dust: Array<{ entity: pc.Entity; phase: number; speed: number; origin: pc.Vec3 }> = [];
    const dustCount = compact ? 24 : 110;
    for (let index = 0; index < dustCount; index += 1) {
      const mote = new pc.Entity(`SUSPENDED BIT ${index}`);
      mote.addComponent("render", { type: "sphere", material: dustMaterial });
      const origin = compact
        ? new pc.Vec3(seeded(index, 2) * 9 - 4.5, seeded(index, 5) * 3.1 - 0.55, -2 - seeded(index, 8) * 23)
        : new pc.Vec3(seeded(index, 2) * 34 - 17, seeded(index, 5) * 3.6 - 1.1, -4 - seeded(index, 8) * 34);
      const size = 0.012 + seeded(index, 11) * 0.035;
      mote.setPosition(origin);
      mote.setLocalScale(size, size, size);
      app.root.addChild(mote);
      dust.push({ entity: mote, origin, phase: seeded(index, 15) * Math.PI * 2, speed: 0.08 + seeded(index, 17) * 0.16 });
    }

    const ripples: Ripple[] = [];
    for (let index = 0; index < (compact ? 8 : 28); index += 1) {
      const rippleMaterial = material(new pc.Color(0.2, 0.62, 1), 0, 3.2);
      const ring = new pc.Entity(`TEMPORAL RIPPLE ${index}`);
      ring.addComponent("render", { type: "torus", material: rippleMaterial });
      ring.setLocalEulerAngles(0, 0, 0);
      ring.setLocalScale(0.01, 0.003, 0.01);
      ring.enabled = false;
      app.root.addChild(ring);
      ripples.push({ entity: ring, material: rippleMaterial, life: 0, energy: 0 });
    }

    const routes: Route[] = [];
    for (let index = 0; index < (compact ? 5 : 18); index += 1) {
      const routeMaterial = material(new pc.Color(0.2, 0.55, 1), 0, 3.6);
      const routeEntity = lineEntity(app, `LIVE PATH ${index}`, [0, 0, 0, 0, 0, 0], routeMaterial, pc.PRIMITIVE_LINESTRIP);
      routeEntity.entity.enabled = false;
      const pulseMaterial = material(new pc.Color(0.5, 0.82, 1), 0, 5.2);
      const pulse = new pc.Entity(`PATH SIGNAL ${index}`);
      pulse.addComponent("render", { type: "sphere", material: pulseMaterial });
      pulse.setLocalScale(0.08, 0.08, 0.08);
      pulse.enabled = false;
      app.root.addChild(pulse);
      routes.push({
        entity: routeEntity.entity,
        mesh: routeEntity.mesh,
        material: routeMaterial,
        pulse,
        pulseMaterial,
        start: new pc.Vec3(),
        end: new pc.Vec3(),
        progress: 0,
        speed: 0.2,
        life: 0,
      });
    }

    const droplets: Droplet[] = [];
    for (let index = 0; index < (compact ? 6 : 22); index += 1) {
      const dropMaterial = material(new pc.Color(0.3, 0.76, 1), 0, 5);
      const drop = new pc.Entity(`DATA RAIN ${index}`);
      drop.addComponent("render", { type: "sphere", material: dropMaterial });
      drop.setLocalScale(0.055, 0.15, 0.055);
      drop.enabled = false;
      app.root.addChild(drop);
      droplets.push({ entity: drop, material: dropMaterial, start: new pc.Vec3(), target: new pc.Vec3(), progress: 0, speed: 0.4 });
    }

    const spawnRipple = (position: pc.Vec3, color: pc.Color, energy: number) => {
      const ripple = ripples.reduce((oldest, candidate) => candidate.life < oldest.life ? candidate : oldest, ripples[0]);
      ripple.life = 1;
      ripple.energy = energy;
      ripple.entity.enabled = true;
      ripple.entity.setPosition(position.x, 0.03, position.z);
      ripple.entity.setLocalScale(0.06, 0.012, 0.06);
      ripple.material.emissive.copy(color);
      ripple.material.emissiveIntensity = 1.35 + energy * 1.15;
      ripple.material.opacity = 0.24;
      ripple.material.update();
    };

    const spawnEvent = (next: SeaEvent) => {
      if (focusRef.current !== "ALL" && focusRef.current !== next.source) return;
      const color = colorFromHex(eventColor(next));
      const targetMap = positionFor(next, true);
      const startMap = positionFor(next, false);
      const target = compact ? portraitPoint(targetMap) : targetMap;
      const start = compact ? portraitPoint(startMap) : startMap;
      const energy = Math.max(0.25, next.magnitude / 100);
      spawnRipple(target, color, energy);

      const drop = droplets.find((candidate) => !candidate.entity.enabled) ?? droplets[hashText(next.id) % droplets.length];
      drop.start.copy(target).add(new pc.Vec3(0, compact ? 2.2 + energy * 3.4 : 3.2 + energy * 4.8, 0));
      drop.target.copy(target);
      drop.progress = 0;
      drop.speed = 0.54 + energy * 0.62;
      drop.entity.enabled = true;
      drop.material.emissive.copy(color);
      drop.material.opacity = 0.82;
      drop.material.update();

      if (next.source === "ROUTING" || next.source === "MEASUREMENT" || next.severity !== "nominal") {
        const route = routes.reduce((oldest, candidate) => candidate.life < oldest.life ? candidate : oldest, routes[0]);
        route.start.copy(start);
        route.end.copy(target);
        route.progress = 0;
        route.speed = 0.22 + energy * 0.28;
        route.life = 1;
        route.entity.enabled = true;
        route.pulse.enabled = true;
        route.material.emissive.copy(color);
        route.material.opacity = 0.3 + energy * 0.36;
        route.pulseMaterial.emissive.copy(color);
        route.pulseMaterial.opacity = 0.9;
        route.material.update();
        route.pulseMaterial.update();
      }
    };

    const resize = () => {
      compact = compactQuery.matches;
      reduced = reducedQuery.matches;
      app.graphicsDevice.maxPixelRatio = compact ? 0.78 : Math.min(window.devicePixelRatio || 1, 1.4);
      app.autoRender = !compact;
      app.renderNextFrame = true;
      app.resizeCanvas(canvas.clientWidth, canvas.clientHeight);
      if (camera.camera) camera.camera.fov = compact ? 68 : 66;
      if (cameraFrame) {
        cameraFrame.rendering.renderTargetScale = compact ? 0.66 : 0.88;
        cameraFrame.update();
      }
    };
    const onPointer = (pointerEvent: PointerEvent) => {
      pointer.tx = (pointerEvent.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      pointer.ty = (pointerEvent.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    };
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    compactQuery.addEventListener("change", resize);
    reducedQuery.addEventListener("change", resize);
    resize();

    let renderTick = 0;
    app.on("update", (delta: number) => {
      renderTick += 1;
      if (compact && renderTick % 2 !== 0) return;
      if (compact && (!activeRef.current || pausedRef.current)) {
        if (renderTick <= 4) app.renderNextFrame = true;
        return;
      }
      if (compact) app.renderNextFrame = true;
      if (disposed || pausedRef.current || !activeRef.current) return;
      const dt = Math.min(delta, 0.05) * (reduced ? 0.35 : 1);
      elapsed += dt;
      frame += 1;
      const currentEvent = eventRef.current;
      if (currentEvent && currentEvent.id !== lastEventId) {
        lastEventId = currentEvent.id;
        spawnEvent(currentEvent);
      }

      pointer.x += (pointer.tx - pointer.x) * 0.025;
      pointer.y += (pointer.ty - pointer.y) * 0.025;
      const cameraX = compact ? 0 : pointer.x * 0.52;
      const cameraY = (compact ? 4.8 : 1.62) - (compact ? 0 : pointer.y * 0.16) + Math.sin(elapsed * 0.11) * 0.035;
      camera.setPosition(cameraX, cameraY, compact ? 5.6 : 7.4);
      camera.lookAt(compact ? 0 : pointer.x * 0.55, compact ? 0.02 : 0.12, compact ? -9.5 : -17.5);

      const risk = riskRef.current;
      if (dangerLight.light) dangerLight.light.intensity = risk * 0.065;
      if (horizon.light) horizon.light.intensity = (compact ? 8 : 7) + audioRef.current * 3.2;
      ocean.setLocalEulerAngles(Math.sin(elapsed * 0.07) * 0.18, 0, Math.cos(elapsed * 0.06) * 0.14);

      const density = modeRef.current === "drift" ? 0.62 : modeRef.current === "observe" ? 1 : 0.82;
      dust.forEach((mote, index) => {
        const drift = elapsed * mote.speed;
        mote.entity.setPosition(
          mote.origin.x + Math.sin(drift + mote.phase) * 0.32,
          mote.origin.y + Math.cos(drift * 0.7 + mote.phase) * 0.18,
          mote.origin.z + ((drift * 0.22 + index) % (compact ? 1.4 : 2.4)),
        );
        mote.entity.enabled = index / dust.length < density;
      });

      if (frame % (compact ? 5 : 2) === 0) {
        currents.forEach((current) => {
          const positions: number[] = [];
          const laneOffset = (current.lane / Math.max(1, currentCount - 1) - 0.5) * (compact ? 8.4 : 28);
          const segments = compact ? 22 : 34;
          for (let segment = 0; segment <= segments; segment += 1) {
            const t = segment / segments;
            positions.push(
              laneOffset + Math.sin(t * 8 + elapsed * 0.18 + current.phase) * (compact ? 0.34 + current.lane * 0.025 : 1.2 + current.lane * 0.05),
              -0.01 + Math.sin(t * 12 + elapsed * 0.3) * 0.025,
              (compact ? 3 : 5) - t * (compact ? 29 : 42),
            );
          }
          current.mesh.setPositions(positions);
          current.mesh.update(pc.PRIMITIVE_LINESTRIP);
        });
      }

      ripples.forEach((ripple) => {
        if (ripple.life <= 0) return;
        ripple.life = Math.max(0, ripple.life - dt * (0.22 + ripple.energy * 0.1));
        const age = 1 - ripple.life;
        const scale = 0.08 + age * (3.5 + ripple.energy * 4.2) * (compact ? 0.65 : 1);
        ripple.entity.setLocalScale(scale, 0.012 + age * 0.025, scale);
        ripple.material.opacity = ripple.life * 0.16;
        ripple.material.update();
        if (ripple.life <= 0) ripple.entity.enabled = false;
      });

      droplets.forEach((drop) => {
        if (!drop.entity.enabled) return;
        drop.progress = Math.min(1, drop.progress + dt * drop.speed);
        const eased = drop.progress * drop.progress;
        drop.entity.setPosition(
          pc.math.lerp(drop.start.x, drop.target.x, eased),
          pc.math.lerp(drop.start.y, 0.06, eased),
          pc.math.lerp(drop.start.z, drop.target.z, eased),
        );
        if (drop.progress >= 1) drop.entity.enabled = false;
      });

      routes.forEach((route) => {
        if (route.life <= 0) return;
        route.progress = Math.min(1, route.progress + dt * route.speed);
        route.life = Math.max(0, route.life - dt * (route.progress >= 1 ? 0.18 : 0.03));
        route.mesh.setPositions(routeCurve(route.start, route.end, route.progress, compact ? 20 : 36));
        route.mesh.update(pc.PRIMITIVE_LINESTRIP);
        route.pulse.setPosition(pointOnRoute(route.start, route.end, route.progress));
        const pulseSize = 0.05 + Math.sin(elapsed * 9) * 0.012 + audioRef.current * 0.06;
        route.pulse.setLocalScale(pulseSize, pulseSize, pulseSize);
        route.material.opacity = Math.min(route.material.opacity, route.life * 0.62);
        route.pulseMaterial.opacity = route.life;
        route.material.update();
        route.pulseMaterial.update();
        if (route.life <= 0) {
          route.entity.enabled = false;
          route.pulse.enabled = false;
        }
      });
    });

    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      compactQuery.removeEventListener("change", resize);
      reducedQuery.removeEventListener("change", resize);
      cameraFrame?.destroy();
      app.destroy();
    };
  }, []);

  return <canvas ref={canvasRef} className="listening-sea-canvas" aria-hidden="true" />;
}
