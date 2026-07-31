import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds Etherlane as the Listening Sea instead of the previous dashboard", async () => {
  const [page, css, layout, version] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/app-version.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Hear the living Internet/);
  assert.match(page, /Enter the Listening Sea/);
  assert.match(page, /This is a translation of measurements, not intercepted private traffic/);
  assert.match(page, /<ListeningSeaVisual/);
  assert.match(page, /"drift", "observe", "focus"/);
  assert.match(page, /LISTENING LENS/);
  assert.match(page, /NOW LISTENING/);
  assert.match(page, /eventExplanation/);
  assert.match(page, /ZERO RETENTION · RAW EVENTS EXIST IN MEMORY ONLY/);
  assert.match(css, /\.listening-sea-canvas/);
  assert.match(css, /\.entry-gate/);
  assert.match(css, /\.event-inspector/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /100dvh/);
  assert.match(layout, /og-listening-sea\.png/);
  assert.match(layout, /Hear the living Internet/);
  assert.match(version, /1\.0\.2/);
});

test("uses live public observatories and labels non-live fallback honestly", async () => {
  const [page, pulse] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pulse/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /wss:\/\/ris-live\.ripe\.net\/v1\/ws/);
  assert.match(page, /wss:\/\/atlas-stream\.ripe\.net\/stream/);
  assert.match(page, /stream\.wikimedia\.org\/v2\/stream\/recentchange/);
  assert.match(page, /\/api\/infrastructure/);
  assert.match(page, /\/api\/pulse/);
  assert.match(page, /live: false/);
  assert.match(page, /not a live Internet observation/);
  assert.match(pulse, /api\.ioda\.inetintel\.cc\.gatech\.edu/);
  assert.match(pulse, /RIPE Labs/);
  assert.match(pulse, /APNIC Blog/);
  assert.match(pulse, /X-Etherlane-Retention/);
  assert.doesNotMatch(page + pulse, /localStorage|sessionStorage|indexedDB|document\.cookie|MediaRecorder|getUserMedia/i);
});

test("renders a mobile-aware temporal sea with submerged continents and live paths", async () => {
  const scene = await readFile(new URL("../app/listening-sea-visual.tsx", import.meta.url), "utf8");
  assert.match(scene, /new pc\.Application/);
  assert.match(scene, /powerPreference: compact \? "low-power" : "high-performance"/);
  assert.match(scene, /SUBMERGED CONTINENTS/);
  assert.match(scene, /topologyMesh/);
  assert.match(scene, /TEMPORAL RIPPLE/);
  assert.match(scene, /LIVE PATH/);
  assert.match(scene, /DATA RAIN/);
  assert.match(scene, /routeCurve/);
  assert.match(scene, /prefers-reduced-motion: reduce/);
  assert.match(scene, /compact \? 24 : 110/);
  assert.match(scene, /maxPixelRatio = compact \? 0\.78/);
  assert.match(scene, /portraitPoint/);
  assert.match(scene, /app\.autoRender = !compact/);
  assert.match(scene, /renderTick % 2/);
  assert.doesNotMatch(scene, /localStorage|sessionStorage|indexedDB|document\.cookie/i);
});

test("uses a lightweight Canvas 2D renderer on mobile and lazy-loads PlayCanvas for desktop", async () => {
  const [loader, mobile, page] = await Promise.all([
    readFile(new URL("../app/listening-sea-visual-loader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/listening-sea-mobile-visual.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /listening-sea-visual-loader/);
  assert.match(loader, /import\("\.\/listening-sea-visual"\)/);
  assert.match(loader, /pointer: coarse/);
  assert.match(mobile, /getContext\("2d"/);
  assert.match(mobile, /desynchronized: true/);
  assert.match(mobile, /requestAnimationFrame/);
  assert.match(mobile, /topologyMesh/);
  assert.match(mobile, /packetCodes/);
  assert.doesNotMatch(mobile, /from "playcanvas"|new pc\./);
  assert.doesNotMatch(mobile, /localStorage|sessionStorage|indexedDB|document\.cookie/i);
});

test("keeps a stable drone and bounded independent stereo delays", async () => {
  const [audio, model] = await Promise.all([
    readFile(new URL("../app/listening-sea-audio.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/listening-sea-model.ts", import.meta.url), "utf8"),
  ]);
  assert.match(audio, /\[36\.708, 73\.416, 110\.0\]/);
  assert.match(audio, /createDynamicsCompressor/);
  assert.match(audio, /createConvolver/);
  assert.match(audio, /delayL\.connect\(feedbackL\)\.connect\(delayL\)/);
  assert.match(audio, /delayR\.connect\(feedbackR\)\.connect\(delayR\)/);
  assert.doesNotMatch(audio, /feedbackL\.connect\(delayR\)|feedbackR\.connect\(delayL\)/);
  assert.match(audio, /playDroplet/);
  assert.match(audio, /playFelt/);
  assert.match(audio, /playGlass/);
  assert.match(audio, /playSwell/);
  assert.match(model, /D minor pentatonic/);
  assert.match(model, /feedback: clamp\([^\n]+0\.16, 0\.44\)/);
  assert.doesNotMatch(audio + model, /MediaRecorder|localStorage|sessionStorage|indexedDB|document\.cookie|fetch\(/i);
});
