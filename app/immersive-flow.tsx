"use client";

import { useEffect, useRef } from "react";
import * as pc from "playcanvas";

export type ImmersiveTone = "violet" | "cyan" | "amber" | "coral";

export type ImmersiveSignal = {
  id: string;
  tone: ImmersiveTone;
  magnitude: number;
  code: string;
};

type ImmersiveFlowProps = {
  active: boolean;
  paused: boolean;
  intensity: number;
  infrastructureRisk: number;
  signal?: ImmersiveSignal;
};

type Packet = {
  entity: pc.Entity;
  shell: pc.Entity;
  lane: number;
  altitude: number;
  z: number;
  speed: number;
  size: number;
  phase: number;
  tone: ImmersiveTone;
};

type DataSpark = {
  entity: pc.Entity;
  lane: number;
  altitude: number;
  z: number;
  speed: number;
  phase: number;
};

const TONE_COLORS: Record<ImmersiveTone, pc.Color> = {
  violet: new pc.Color(0.42, 0.12, 1),
  cyan: new pc.Color(0.04, 0.66, 1),
  amber: new pc.Color(1, 0.45, 0.08),
  coral: new pc.Color(1, 0.06, 0.12),
};

const LANES = [-8.2, -5.4, -2.7, 0, 2.7, 5.4, 8.2];

function seeded(index: number, salt = 0) {
  const value = Math.sin(index * 91.731 + salt * 37.119) * 43758.5453;
  return value - Math.floor(value);
}

function createMatrixCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  context.fillStyle = "#02030a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = "600 18px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textBaseline = "top";

  for (let column = 0; column < 16; column += 1) {
    for (let row = 0; row < 28; row += 1) {
      const energy = 0.28 + seeded(column, row) * 0.72;
      context.fillStyle = `rgba(174, 228, 255, ${energy})`;
      const glyph = seeded(row, column) > 0.68
        ? Math.floor(seeded(column + row, 7) * 16).toString(16).toUpperCase()
        : seeded(column, row + 11) > 0.5
          ? "1"
          : "0";
      context.fillText(glyph, column * 32 + 8, row * 20 - 10);
    }
  }

  context.strokeStyle = "rgba(128, 186, 255, .44)";
  context.lineWidth = 2;
  context.strokeRect(3, 3, 506, 506);
  return canvas;
}

function createMaterial(
  color: pc.Color,
  options: {
    opacity?: number;
    emissiveIntensity?: number;
    additive?: boolean;
    texture?: pc.Texture;
    metalness?: number;
    gloss?: number;
  } = {},
) {
  const material = new pc.StandardMaterial();
  material.diffuse = color.clone().mulScalar(0.2);
  material.emissive = color.clone();
  material.emissiveIntensity = options.emissiveIntensity ?? 2.4;
  material.metalness = options.metalness ?? 0.16;
  material.gloss = options.gloss ?? 0.72;
  material.useLighting = !options.additive;
  material.useFog = true;
  material.opacity = options.opacity ?? 1;
  if ((options.opacity ?? 1) < 1 || options.additive) {
    material.blendType = options.additive ? pc.BLEND_ADDITIVE : pc.BLEND_NORMAL;
    material.depthWrite = false;
  }
  if (options.texture) {
    material.diffuseMap = options.texture;
    material.emissiveMap = options.texture;
    material.diffuseMapTiling.set(1.6, 2.4);
    material.emissiveMapTiling.set(1.6, 2.4);
  }
  material.update();
  return material;
}

function createLineField(
  app: pc.Application,
  name: string,
  positions: number[],
  color: pc.Color,
  opacity: number,
  intensity: number,
) {
  const mesh = new pc.Mesh(app.graphicsDevice);
  mesh.setPositions(positions);
  mesh.update(pc.PRIMITIVE_LINES);
  const material = createMaterial(color, {
    additive: true,
    opacity,
    emissiveIntensity: intensity,
  });
  const entity = new pc.Entity(name);
  const meshInstance = new pc.MeshInstance(mesh, material, entity);
  meshInstance.cull = false;
  entity.addComponent("render", { meshInstances: [meshInstance] });
  app.root.addChild(entity);
  return { entity, mesh, material };
}

function resetPacket(packet: Packet, index: number, tone?: ImmersiveTone, burst = false) {
  const laneIndex = Math.floor(seeded(index, performance.now() * 0.001) * LANES.length);
  packet.lane = LANES[laneIndex];
  packet.altitude = 0.62 + seeded(index, 12) * (burst ? 4.8 : 3.4);
  packet.z = burst ? -118 - seeded(index, 14) * 42 : -35 - seeded(index, 9) * 145;
  packet.speed = 9 + seeded(index, 17) * 13 + (burst ? 9 : 0);
  packet.size = 0.32 + seeded(index, 28) * (burst ? 1.1 : 0.78);
  packet.phase = seeded(index, 39) * Math.PI * 2;
  if (tone) packet.tone = tone;
  packet.entity.setLocalScale(packet.size * 1.25, packet.size * 0.86, packet.size * 1.7);
  packet.shell.setLocalScale(1.035, 1.05, 1.03);
}

export function ImmersiveFlowScene({
  active,
  paused,
  intensity,
  infrastructureRisk,
  signal,
}: ImmersiveFlowProps) {
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
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let compact = compactQuery.matches;
    let reducedMotion = reducedMotionQuery.matches;
    let disposed = false;
    let lastSignalId = "";
    let frameAccumulator = 0;
    let elapsed = 0;
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

    const app = new pc.Application(canvas, {
      graphicsDeviceOptions: {
        antialias: !compact,
        alpha: false,
        powerPreference: "high-performance",
      },
    });
    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    app.graphicsDevice.maxPixelRatio = compact
      ? 1
      : Math.min(window.devicePixelRatio || 1, 1.5);
    app.scene.ambientLight = new pc.Color(0.035, 0.045, 0.11);
    app.scene.exposure = 1.42;
    app.scene.fog.type = pc.FOG_EXP2;
    app.scene.fog.color = new pc.Color(0.006, 0.008, 0.026);
    app.scene.fog.density = compact ? 0.012 : 0.009;
    app.start();

    const camera = new pc.Entity("LOW FLOW CAMERA");
    camera.addComponent("camera", {
      clearColor: new pc.Color(0.001, 0.002, 0.012),
      fov: compact ? 79 : 72,
      nearClip: 0.08,
      farClip: 240,
      frustumCulling: true,
    });
    camera.setPosition(0, compact ? 1.05 : 1.32, 4.2);
    camera.lookAt(0, 1.05, -72);
    app.root.addChild(camera);

    let cameraFrame: pc.CameraFrame | null = null;
    try {
      cameraFrame = new pc.CameraFrame(app, camera.camera!);
      cameraFrame.rendering.renderTargetScale = compact ? 0.68 : 0.9;
      cameraFrame.rendering.toneMapping = pc.TONEMAP_ACES2;
      cameraFrame.bloom.intensity = compact ? 0.014 : 0.038;
      cameraFrame.bloom.blurLevel = compact ? 4 : 8;
      cameraFrame.grading.enabled = true;
      cameraFrame.grading.contrast = 1.13;
      cameraFrame.grading.saturation = 1.22;
      cameraFrame.vignette.intensity = compact ? 0.22 : 0.34;
      cameraFrame.vignette.inner = 0.48;
      cameraFrame.vignette.outer = 1.18;
      cameraFrame.vignette.curvature = 0.72;
      cameraFrame.enabled = true;
      cameraFrame.update();
    } catch {
      cameraFrame = null;
    }

    const keyLight = new pc.Entity("HORIZON LIGHT");
    keyLight.addComponent("light", {
      type: "omni",
      color: new pc.Color(0.18, 0.34, 1),
      intensity: 7,
      range: 48,
      castShadows: false,
    });
    keyLight.setPosition(0, 1.2, -44);
    app.root.addChild(keyLight);

    const rimLight = new pc.Entity("VIOLET RIM");
    rimLight.addComponent("light", {
      type: "omni",
      color: new pc.Color(0.48, 0.08, 1),
      intensity: 5,
      range: 32,
      castShadows: false,
    });
    rimLight.setPosition(-6, 3.5, -18);
    app.root.addChild(rimLight);

    const gridPositions: number[] = [];
    for (let lane = -16; lane <= 16; lane += 1.35) {
      gridPositions.push(lane, 0, 8, lane, 0, -190);
    }
    for (let z = 7; z >= -190; z -= Math.max(1.5, Math.abs(z) * 0.055)) {
      gridPositions.push(-16, 0, z, 16, 0, z);
    }
    createLineField(
      app,
      "DATA FLOOR",
      gridPositions,
      new pc.Color(0.08, 0.27, 1),
      0.42,
      2.1,
    );

    const lanePositions: number[] = [];
    for (const lane of LANES) {
      lanePositions.push(lane - 0.46, 0.025, 8, lane - 0.46, 0.025, -190);
      lanePositions.push(lane + 0.46, 0.025, 8, lane + 0.46, 0.025, -190);
    }
    createLineField(
      app,
      "LUMINOUS LANES",
      lanePositions,
      TONE_COLORS.cyan,
      0.76,
      4.2,
    );

    const tunnelPositions: number[] = [];
    const archCount = compact ? 16 : 28;
    for (let arch = 0; arch < archCount; arch += 1) {
      const z = -5 - arch * (compact ? 8.2 : 6.5);
      for (let segment = 0; segment < 28; segment += 1) {
        const a = Math.PI - (segment / 28) * Math.PI;
        const b = Math.PI - ((segment + 1) / 28) * Math.PI;
        tunnelPositions.push(
          Math.cos(a) * 13.8,
          Math.sin(a) * 8.4,
          z,
          Math.cos(b) * 13.8,
          Math.sin(b) * 8.4,
          z,
        );
      }
    }
    for (let ribbon = 1; ribbon < 14; ribbon += 1) {
      const angle = (ribbon / 14) * Math.PI;
      tunnelPositions.push(
        Math.cos(angle) * 13.8,
        Math.sin(angle) * 8.4,
        5,
        Math.cos(angle) * 13.8,
        Math.sin(angle) * 8.4,
        -190,
      );
    }
    createLineField(
      app,
      "NETWORK VAULT",
      tunnelPositions,
      TONE_COLORS.violet,
      0.34,
      3.2,
    );

    const horizonMaterial = createMaterial(new pc.Color(0.06, 0.35, 1), {
      emissiveIntensity: 3.4,
      opacity: 0.72,
      additive: true,
    });
    const horizonCount = compact ? 34 : 76;
    for (let index = 0; index < horizonCount; index += 1) {
      const tower = new pc.Entity(`HORIZON NODE ${index}`);
      tower.addComponent("render", { type: "box", material: horizonMaterial });
      const side = index % 2 === 0 ? -1 : 1;
      const x = side * (9.5 + seeded(index, 4) * 13.5);
      const z = -18 - seeded(index, 8) * 150;
      const height = 0.3 + seeded(index, 12) * 2.8;
      tower.setPosition(x, height * 0.5, z);
      tower.setLocalScale(0.06 + seeded(index, 7) * 0.16, height, 0.08);
      app.root.addChild(tower);
    }

    const matrixCanvas = createMatrixCanvas();
    const matrixTexture = new pc.Texture(app.graphicsDevice, {
      addressU: pc.ADDRESS_REPEAT,
      addressV: pc.ADDRESS_REPEAT,
      anisotropy: Math.min(4, app.graphicsDevice.maxAnisotropy),
      mipmaps: true,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
      magFilter: pc.FILTER_LINEAR,
    });
    matrixTexture.setSource(matrixCanvas);

    const packetMaterials = {} as Record<ImmersiveTone, pc.StandardMaterial>;
    const shellMaterials = {} as Record<ImmersiveTone, pc.StandardMaterial>;
    (Object.keys(TONE_COLORS) as ImmersiveTone[]).forEach((tone) => {
      packetMaterials[tone] = createMaterial(TONE_COLORS[tone], {
        texture: matrixTexture,
        emissiveIntensity: tone === "coral" ? 4.8 : 3.35,
        metalness: 0.34,
        gloss: 0.86,
      });
      shellMaterials[tone] = createMaterial(TONE_COLORS[tone], {
        additive: true,
        opacity: 0.62,
        emissiveIntensity: tone === "coral" ? 6 : 4.2,
      });
    });

    const packetCount = compact ? 34 : 78;
    const packets: Packet[] = [];
    for (let index = 0; index < packetCount; index += 1) {
      const tone = (["cyan", "violet", "cyan", "amber"] as ImmersiveTone[])[index % 4];
      const entity = new pc.Entity(`PACKET ${index}`);
      entity.addComponent("render", { type: "box", material: packetMaterials[tone] });
      const shell = new pc.Entity(`PACKET SHELL ${index}`);
      shell.addComponent("render", { type: "box", material: shellMaterials[tone] });
      const meshInstance = shell.render?.meshInstances[0];
      if (meshInstance) meshInstance.renderStyle = pc.RENDERSTYLE_WIREFRAME;
      entity.addChild(shell);
      app.root.addChild(entity);
      const packet: Packet = {
        entity,
        shell,
        lane: 0,
        altitude: 0,
        z: 0,
        speed: 0,
        size: 1,
        phase: 0,
        tone,
      };
      resetPacket(packet, index);
      packet.z -= (index / packetCount) * 160;
      packets.push(packet);
    }

    const sparkMaterial = createMaterial(new pc.Color(0.12, 0.72, 1), {
      additive: true,
      opacity: 0.82,
      emissiveIntensity: 5,
    });
    const sparkCount = compact ? 18 : 46;
    const sparks: DataSpark[] = [];
    for (let index = 0; index < sparkCount; index += 1) {
      const entity = new pc.Entity(`LIGHTSPEED SIGNAL ${index}`);
      entity.addComponent("render", { type: "box", material: sparkMaterial });
      const lane = LANES[index % LANES.length] + (seeded(index, 1) - 0.5) * 0.5;
      const altitude = 0.1 + seeded(index, 4) * 5.5;
      const z = -10 - seeded(index, 9) * 180;
      entity.setPosition(lane, altitude, z);
      entity.setLocalScale(0.025, 0.025, 1.2 + seeded(index, 11) * 4.5);
      app.root.addChild(entity);
      sparks.push({
        entity,
        lane,
        altitude,
        z,
        speed: 26 + seeded(index, 14) * 42,
        phase: seeded(index, 18) * Math.PI * 2,
      });
    }

    const arcMaterial = createMaterial(new pc.Color(0.18, 0.44, 1), {
      additive: true,
      opacity: 0.9,
      emissiveIntensity: 5,
    });
    const arcNodes: Array<{ entity: pc.Entity; phase: number; ring: number }> = [];
    const arcNodeCount = compact ? 12 : 28;
    for (let index = 0; index < arcNodeCount; index += 1) {
      const entity = new pc.Entity(`TUNNEL NODE ${index}`);
      entity.addComponent("render", { type: "sphere", material: arcMaterial });
      entity.setLocalScale(0.055, 0.055, 0.055);
      app.root.addChild(entity);
      arcNodes.push({ entity, phase: seeded(index, 22), ring: index % 7 });
    }

    const resize = () => {
      compact = compactQuery.matches;
      app.graphicsDevice.maxPixelRatio = compact
        ? 1
        : Math.min(window.devicePixelRatio || 1, 1.5);
      app.resizeCanvas(canvas.clientWidth, canvas.clientHeight);
      if (camera.camera) camera.camera.fov = compact ? 79 : 72;
      if (cameraFrame) {
        cameraFrame.rendering.renderTargetScale = compact ? 0.68 : 0.9;
        cameraFrame.update();
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.targetX = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      pointer.targetY = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    };

    const onMotionPreference = () => {
      reducedMotion = reducedMotionQuery.matches;
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    reducedMotionQuery.addEventListener("change", onMotionPreference);
    resize();

    const switchPacketTone = (packet: Packet, tone: ImmersiveTone) => {
      if (packet.tone === tone) return;
      packet.tone = tone;
      if (packet.entity.render) packet.entity.render.material = packetMaterials[tone];
      if (packet.shell.render) packet.shell.render.material = shellMaterials[tone];
    };

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
      const motionScale = pausedRef.current ? 0 : reducedMotion ? 0.16 : 1;
      const energy = 0.46 + intensityRef.current / 100;
      const risk = Math.max(0, Math.min(1, riskRef.current / 100));
      elapsed += delta * motionScale;

      pointer.x += (pointer.targetX - pointer.x) * Math.min(1, delta * 2.4);
      pointer.y += (pointer.targetY - pointer.y) * Math.min(1, delta * 2.4);
      const shake = risk > 0.62 ? Math.sin(elapsed * 18) * (risk - 0.62) * 0.11 : 0;
      camera.setPosition(
        pointer.x * (compact ? 0.08 : 0.22) + shake,
        (compact ? 1.05 : 1.32) - pointer.y * 0.08,
        4.2,
      );
      camera.lookAt(pointer.x * 0.42, 1.05 - pointer.y * 0.18, -72);

      const danger = new pc.Color(0.075 * risk, 0.004, 0.012 + 0.018 * (1 - risk));
      camera.camera!.clearColor.lerp(
        new pc.Color(0.001, 0.002, 0.012),
        danger,
        risk,
      );
      app.scene.fog.color.set(0.006 + risk * 0.065, 0.008, 0.026 - risk * 0.012);
      keyLight.light!.color.lerp(TONE_COLORS.cyan, TONE_COLORS.coral, risk);
      rimLight.light!.intensity = 4.6 + energy * 1.6 + risk * 4.5;

      const currentSignal = signalRef.current;
      if (currentSignal && currentSignal.id !== lastSignalId) {
        lastSignalId = currentSignal.id;
        const burstCount = Math.min(compact ? 4 : 9, 2 + Math.round(currentSignal.magnitude / 18));
        for (let index = 0; index < burstCount; index += 1) {
          const packet = packets[(index + Math.floor(elapsed * 13)) % packets.length];
          switchPacketTone(packet, currentSignal.tone);
          resetPacket(packet, index + Math.floor(elapsed * 100), currentSignal.tone, true);
          packet.phase += currentSignal.code.length * 0.013;
        }
      }

      const textureOffset = (elapsed * 0.12 * energy) % 1;
      (Object.keys(packetMaterials) as ImmersiveTone[]).forEach((tone, index) => {
        const material = packetMaterials[tone];
        material.diffuseMapOffset.y = (textureOffset + index * 0.17) % 1;
        material.emissiveMapOffset.y = (textureOffset + index * 0.17) % 1;
        material.emissiveIntensity = (tone === "coral" ? 4.4 : 2.85) + energy * 0.72 + risk * 1.8;
        material.update();
      });

      packets.forEach((packet, index) => {
        packet.z += packet.speed * delta * energy * motionScale;
        if (packet.z > 8.5) {
          resetPacket(packet, index + Math.floor(elapsed * 10));
          switchPacketTone(
            packet,
            risk > 0.68 && index % 3 === 0
              ? "coral"
              : (["cyan", "violet", "cyan", "amber"] as ImmersiveTone[])[index % 4],
          );
        }
        const laneBreath = Math.sin(elapsed * 0.19 + packet.phase) * 0.035;
        const verticalBreath = Math.sin(elapsed * 0.37 + packet.phase) * 0.045;
        packet.entity.setPosition(packet.lane + laneBreath, packet.altitude + verticalBreath, packet.z);
        packet.entity.setEulerAngles(
          Math.sin(packet.phase) * 3,
          Math.sin(elapsed * 0.09 + packet.phase) * 5,
          0,
        );
      });

      sparks.forEach((spark) => {
        spark.z += spark.speed * delta * energy * motionScale;
        if (spark.z > 7) spark.z = -185 - seeded(Math.floor(elapsed * 10), spark.phase) * 20;
        spark.entity.setPosition(
          spark.lane,
          spark.altitude + Math.sin(elapsed * 0.6 + spark.phase) * 0.035,
          spark.z,
        );
      });

      arcNodes.forEach((node) => {
        const progress = (node.phase + elapsed * (0.035 + node.ring * 0.002)) % 1;
        const angle = Math.PI * progress;
        const z = -9 - node.ring * 20 - Math.sin(elapsed * 0.12 + node.phase) * 7;
        node.entity.setPosition(
          Math.cos(angle) * 13.75,
          Math.sin(angle) * 8.35,
          z,
        );
      });
    });

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      reducedMotionQuery.removeEventListener("change", onMotionPreference);
      cameraFrame?.destroy();
      matrixTexture.destroy();
      app.destroy();
    };
  }, []);

  return (
    <div
      className={`immersive-flow ${active ? "is-active" : "is-inactive"}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
      <div className="immersive-horizon" />
      <div className="immersive-vignette" />
    </div>
  );
}
